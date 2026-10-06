// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { ReactNode, useCallback, useEffect, useMemo } from 'react';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';

import { useAgentOptional } from '../AgentContext';
import { withLiveOptions } from '../commands';
import { modelName } from '../modelChoice';
import { resumeRunning } from '../resume';
import { runSince, runStateOf } from '../runState';
import { buildTranscript, countEntries, liveParts } from '../transcript';

import { useChatStream } from '../useChatStream';
import { useStickToBottom } from '../useStickToBottom';
import ApprovalCard from './ApprovalCard';
import ArtifactStrip from './ArtifactStrip';
import ChatInput from './ChatInput';
import ModelEffortPicker from './ModelEffortPicker';
import Conversation from './Conversation';
import DelegationStrip from './DelegationStrip';
import QueueList from './QueueList';
import RunStatus from './RunStatus';
import TaskStrip from './TaskStrip';

type Props = {
    chatId: string;
    /** Narrow layout of the context panel. */
    dense?: boolean;
    placeholder?: string;
    /** Rendered above the delegation strip, outside the scrolling area (e.g. the chat selector). */
    header?: ReactNode;
};

/**
 * One chat: delegation strip with blocked calls on top, the conversation and pending approvals in the
 * middle (scrolls), queued messages and the input field at the bottom. The middle follows the end of the
 * transcript while the user is there; after scrolling up, a "Jump to latest" button counts the new entries.
 * Above the input, the run status shows what the agent does and offers "Stop" and "Let it rest".
 */
export default function ChatView({ chatId, dense = false, placeholder, header }: Props) {
    const stream = useChatStream(chatId);
    const { messages, approvals, socketCalls, executions, chat, live, thinkingTimes, send } = stream;
    const pending = approvals.filter((a) => a.state === 'pending');
    const runState = runStateOf(chat, { pendingApprovals: pending.length, resumeRunning: resumeRunning(stream.resumes) });
    const since = runSince(chat, messages);
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
            buildTranscript(messages, { approvals, socketCalls, executions, running: !!chat?.running, thinkingTimes }),
        [messages, approvals, socketCalls, executions, chat?.running, thinkingTimes],
    );
    const liveCount = useMemo(() => {
        const parts = liveParts(live);
        return parts.length ? countEntries([{ kind: 'agent', key: 'live', parts }]) : 0;
    }, [live]);
    const count =
        countEntries(items) +
        pending.length +
        liveCount +
        stream.resumes.length +
        stream.commandNotices.length +
        (stream.pending ? 1 : 0);
    const { scrollRef, contentRef, stuck, unseen, jumpToLatest } = useStickToBottom(count);
    // After sending, the own message and the answer are what the user wants to see.
    const onSend = useCallback(
        (text: string, attachments: string[]) => {
            jumpToLatest();
            return send(text, attachments);
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

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
            <Box
                sx={{
                    flex: 'none',
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr)',
                    gap: 1.25,
                    px: dense ? 1.75 : 0,
                    pt: dense ? 1.5 : 0,
                    pr: dense ? 1.75 : 1,
                    pb: 1.25,
                }}
            >
                {header}
                {chat && <DelegationStrip chat={chat} socketCalls={stream.socketCalls} />}
                <ArtifactStrip chatId={chatId} artifacts={stream.artifacts} onOpen={stream.refreshArtifacts} />
                <TaskStrip
                    chatId={chatId}
                    chatRunning={!!chat?.running}
                    background={stream.background}
                    onStopBackground={stream.stopBackground}
                    subagentEntries={stream.subagentEntries}
                    subagentRuns={stream.subagentRuns}
                    llmCalls={stream.llmCalls}
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
                        px: dense ? 1.75 : 0,
                        pr: dense ? 1.75 : 1,
                        pt: 0.5,
                        pb: 1.5,
                    }}
                >
                    <Box ref={contentRef} sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        {stream.error && (
                            <Alert severity="warning" sx={{ fontSize: 12.5 }}>
                                {stream.error}
                            </Alert>
                        )}
                        <Conversation stream={stream} items={items} dense={dense} />
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
                    borderTop: 1,
                    borderColor: 'divider',
                    bgcolor: '#fff',
                    px: dense ? 1.75 : 0,
                    pt: dense ? 1.25 : 1.75,
                    pb: dense ? 1.25 : 0,
                }}
            >
                <QueueList
                    chat={stream.chat}
                    rows={stream.queue}
                    error={stream.queueError}
                    onRemove={stream.unqueue}
                    onSendNow={stream.sendQueueNow}
                />
                {runState && (
                    <RunStatus state={runState} since={since} onAbort={stream.abort} onSuspend={stream.suspend} />
                )}
                <ChatInput
                    onSend={onSend}
                    onUpload={stream.uploadFiles}
                    maxFileMb={agent?.config?.artifact_max_mb}
                    chatId={chatId}
                    running={stream.chat?.running}
                    placeholder={placeholder}
                    dense={dense}
                    commands={commands}
                    onCommand={onCommand}
                    onCommandsOpen={stream.refreshCommands}
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
    );
}
