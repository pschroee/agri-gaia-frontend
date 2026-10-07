// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { ReactNode, useCallback, useEffect, useMemo } from 'react';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';

import { useAgentOptional } from '../AgentContext';
import { dropUnknownSubagent } from '../chatSubagents';
import { withLiveOptions } from '../commands';
import { modelName } from '../modelChoice';
import { freshChatFor } from '../newChat';
import type { PageContext } from '../pageContext';
import { useCurrentPageContext } from '../pageSelection';
import { resumeRunning } from '../resume';
import { runStateOf } from '../runState';
import { groupRuns, isLiveStatus, runStatus, runsByCall, subagentNav } from '../subagents';
import type { SubagentNavItem } from '../subagents';
import { buildTranscript, countEntries, liveParts } from '../transcript';
import { useNow } from '../useNow';

import { useChatDraft, useSharedChatStream } from '../sharedChatStream';
import { useStickToBottom } from '../useStickToBottom';
import ApprovalCard from './ApprovalCard';
import ChatInput from './ChatInput';
import ModelEffortPicker from './ModelEffortPicker';
import Conversation from './Conversation';
import QueueList from './QueueList';
import { SubagentReadOnlyBar, SubagentTranscript } from './SubagentView';
import TaskStrip from './TaskStrip';

type Props = {
    chatId: string;
    /** Narrow layout of the context panel. */
    dense?: boolean;
    placeholder?: string;
    /** Rendered above the strips, outside the scrolling area (e.g. the chat selector). */
    header?: ReactNode;
};

/**
 * One chat: background tasks on top, the conversation and pending approvals in the middle (scrolls; files stand at
 * the message or answer they belong to, issue #54), queued messages and the input field at the bottom. The middle follows the end of the
 * transcript while the user is there; after scrolling up, a "Jump to latest" button counts the new entries.
 * While a turn runs, Stop sits in the input field and the run state in the row below it (issue #39).
 */
export default function ChatView({ chatId, dense = false, placeholder, header }: Props) {
    // the current chat's stream lives above page and panel, so it survives the move between them (issue #50)
    const stream = useSharedChatStream(chatId);
    const draft = useChatDraft(chatId);
    const { messages, approvals, socketCalls, executions, chat, live, thinkingTimes, partials, send } = stream;
    const pending = approvals.filter((a) => a.state === 'pending');
    const runState = runStateOf(chat, { pendingApprovals: pending.length, resumeRunning: resumeRunning(stream.resumes) });
    // the open chat's live state goes to the chat list and the panel header
    const agent = useAgentOptional();
    const updateChat = agent?.updateChat;
    useEffect(() => {
        if (chat && updateChat) updateChat(chat);
    }, [chat, updateChat]);
    // a running compaction shows in the context ring of the header
    const setCompacting = agent?.setCompacting;
    const compacting = stream.compacting;
    useEffect(() => {
        if (!setCompacting) return;
        setCompacting(chatId, compacting);
        return () => setCompacting(chatId, undefined);
    }, [chatId, compacting, setCompacting]);
    const items = useMemo(
        () =>
            buildTranscript(messages, {
                approvals,
                socketCalls,
                executions,
                running: !!chat?.running,
                thinkingTimes,
                partials,
            }),
        [messages, approvals, socketCalls, executions, chat?.running, thinkingTimes, partials],
    );
    // subagents (issue #48): published for the chat selector and the history, looked into read-only here
    const runs = useMemo(
        () => groupRuns(stream.subagentEntries, stream.subagentRuns),
        [stream.subagentEntries, stream.subagentRuns],
    );
    const chatRunning = !!chat?.running;
    const setOpenChatSubagents = agent?.setOpenChatSubagents;
    useEffect(() => {
        setOpenChatSubagents?.(chatId, { runs, chatRunning });
    }, [chatId, runs, chatRunning, setOpenChatSubagents]);
    useEffect(() => () => setOpenChatSubagents?.(chatId, undefined), [chatId, setOpenChatSubagents]);
    const selectSubagent = agent?.selectSubagent;
    const subagentId = agent?.selectedSubagent;
    const subRun = subagentId ? runs.find((r) => r.runId === subagentId) : undefined;
    // a run the loaded chat does not know (gone or another chat's): back to the chat, but only once the chat is loaded
    // (a subagent picked under another chat comes with its chat, before this view has loaded anything; issue #60)
    useEffect(() => {
        if (dropUnknownSubagent({ subagentId, known: !!subRun, loaded: stream.loaded, loading: stream.loading }))
            selectSubagent?.(undefined);
    }, [subagentId, subRun, stream.loaded, stream.loading, selectSubagent]);
    const anyRunLive = runs.some((r) => isLiveStatus(runStatus(r, { chatRunning, now: Date.now() })));
    const now = useNow(anyRunLive || chatRunning, 2000);
    const subStatus = subRun ? runStatus(subRun, { chatRunning, now }) : undefined;
    const subagentLinks = useMemo(() => {
        if (!runs.length || !selectSubagent) return undefined;
        const nav = new Map(subagentNav(runs, { chatRunning, now }).map((n) => [n.runId, n]));
        const byCall = new Map<string, SubagentNavItem[]>();
        for (const [call, ids] of Object.entries(runsByCall(messages, runs)))
            byCall.set(
                call,
                ids.map((id) => nav.get(id)).filter((n): n is SubagentNavItem => !!n),
            );
        return { byCall, onOpen: (runId: string) => selectSubagent(runId) };
    }, [runs, messages, chatRunning, now, selectSubagent]);
    const liveCount = useMemo(() => {
        const parts = liveParts(live);
        return parts.length ? countEntries([{ kind: 'agent', key: 'live', parts }]) : 0;
    }, [live]);
    const count = subRun
        ? subRun.entries.length
        : countEntries(items) +
        pending.length +
        liveCount +
        stream.resumes.length +
        stream.commandNotices.length +
        (stream.pending ? 1 : 0);
    const { scrollRef, contentRef, stuck, unseen, jumpToLatest } = useStickToBottom(count);
    // opening a subagent or going back starts at the end, like opening a chat
    useEffect(() => {
        jumpToLatest();
    }, [subagentId, jumpToLatest]);
    const backToChat = useCallback(() => selectSubagent?.(undefined), [selectSubagent]);
    // the platform page next to the panel (none on /ai-agent)
    const pageContext = useCurrentPageContext();
    // After sending, the own message and the answer are what the user wants to see.
    const onSend = useCallback(
        (text: string, attachments: string[], context?: PageContext) => {
            jumpToLatest();
            return send(text, attachments, context);
        },
        [jumpToLatest, send],
    );
    const models = agent?.models;
    const runCommand = stream.runCommand;
    const onCommand = useCallback(
        (text: string) => {
            jumpToLatest();
            return runCommand(text, (id) => modelName(models ?? [], id));
        },
        [jumpToLatest, runCommand, models],
    );
    const commands = useMemo(() => withLiveOptions(stream.commands, chat), [stream.commands, chat]);
    // just created by "New chat": the input takes the focus (and dropped files)
    const start = freshChatFor(agent?.freshChat, chatId);
    const takeFreshChat = agent?.takeFreshChat;
    const onStartTaken = useCallback(() => takeFreshChat?.(chatId), [takeFreshChat, chatId]);

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
            <Box
                sx={{
                    flex: 'none',
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr)',
                    gap: 1.25,
                    px: dense ? 2 : 0,
                    pt: dense ? 2 : 0,
                    pr: dense ? 2 : 1,
                    pb: dense ? 0.5 : 1.25,
                }}
            >
                {header}
                <TaskStrip
                    chatId={chatId}
                    chatRunning={!!chat?.running}
                    background={stream.background}
                    onStopBackground={stream.stopBackground}
                    subagentEntries={stream.subagentEntries}
                    subagentRuns={stream.subagentRuns}
                    llmCalls={stream.llmCalls}
                    onOpenSubagent={selectSubagent}
                    subagentsElsewhere={dense}
                />
            </Box>
            <Box sx={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
                <Box
                    ref={scrollRef}
                    data-testid="agent-transcript"
                    sx={{
                        flex: 1,
                        minHeight: 0,
                        overflowY: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                        px: dense ? 2 : 0,
                        pr: dense ? 2 : 1,
                        pt: 1.5,
                        pb: 1,
                    }}
                >
                    <Box
                        ref={contentRef}
                        // grows to the box's height, so the empty chat sits in the middle (design)
                        sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, flex: '1 0 auto', minWidth: 0 }}
                    >
                        {stream.error && (
                            <Alert severity="warning" sx={{ fontSize: 12.5 }}>
                                {stream.error}
                            </Alert>
                        )}
                        {subRun && subStatus ? (
                            <SubagentTranscript
                                run={subRun}
                                status={subStatus}
                                dense={dense}
                                chatId={chatId}
                                executions={stream.executions}
                            />
                        ) : (
                            <Conversation stream={stream} items={items} dense={dense} subagents={subagentLinks} />
                        )}
                        <ApprovalCard approvals={pending} onDecide={stream.decide} />
                    </Box>
                </Box>
                {!stuck && (
                    <Button
                        size="small"
                        variant="contained"
                        startIcon={<ArrowDownwardIcon fontSize="small" />}
                        onClick={jumpToLatest}
                        sx={{
                            position: 'absolute',
                            bottom: 12,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            borderRadius: 999,
                            textTransform: 'none',
                            fontSize: 12.5,
                            boxShadow: 3,
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {unseen > 0 ? `Jump to latest · ${unseen} new` : 'Jump to latest'}
                    </Button>
                )}
            </Box>
            <Box
                sx={{
                    flex: 'none',
                    bgcolor: '#fff',
                    ...(subRun && subStatus
                        ? { borderTop: 1, borderColor: 'divider', px: dense ? 2 : 0, py: 1.5 }
                        : { px: dense ? 1.5 : 0, pt: 1, pb: dense ? 1.5 : 0 }),
                }}
            >
                {/* read-only: no input and no stop per subagent; the chat's input stays mounted (hidden), so a draft
                    and staged files are still there after "Back to chat" */}
                {subRun && subStatus && <SubagentReadOnlyBar onBack={backToChat} />}
                <Box sx={{ display: subRun && subStatus ? 'none' : 'block' }}>
                    <QueueList
                        chat={stream.chat}
                        rows={stream.queue}
                        error={stream.queueError}
                        onRemove={stream.unqueue}
                        onSendNow={stream.sendQueueNow}
                    />
                    <ChatInput
                        onSend={onSend}
                        onUpload={stream.uploadFiles}
                        maxFileMb={agent?.config?.artifact_max_mb}
                        chatId={chatId}
                        running={stream.chat?.running}
                        runState={runState}
                        onAbort={stream.abort}
                        placeholder={placeholder}
                        commands={commands}
                        onCommand={onCommand}
                        onCommandsOpen={stream.refreshCommands}
                        pageContext={pageContext}
                        start={start}
                        onStartTaken={onStartTaken}
                        initialText={draft.initial}
                        onTextChange={draft.save}
                                                toolbar={
                            <ModelEffortPicker
                                chat={stream.chat}
                                models={agent?.models ?? []}
                                dense={dense}
                                onModel={stream.setModel}
                                onEffort={stream.setEffort}
                                tooLargeRequest={stream.commandTooLarge}
                            />
                        }
                    />
                </Box>
            </Box>
        </Box>
    );
}
