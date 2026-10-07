// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';

import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CheckIcon from '@mui/icons-material/Check';
import CompressIcon from '@mui/icons-material/Compress';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import TerminalIcon from '@mui/icons-material/Terminal';

import { answerMarkdown, answerSteps } from '../answer';
import { backgroundByCall } from '../background';
import { copyText } from '../clipboard';
import { noticeAnchor } from '../commands';
import { outputsByStepPart, placeOutputs } from '../files';
import type { CommandNotice } from '../commands';
import type { SubagentNavItem } from '../subagents';
import type { Artifact } from '../types';
import { resumeAnchor, resumeRunning } from '../resume';
import type { ResumeView } from '../resume';
import { liveParts } from '../transcript';
import type { TranscriptItem } from '../transcript';
import type { ChatStream } from '../useChatStream';
import { compactionReason, formatTokens } from '../usage';
import { MessageAttachments, ResultAttachments } from './Attachments';
import Markdown from './Markdown';
import BackgroundNoteLine from './BackgroundNoteLine';
import ResumeBlock from './ResumeBlock';
import StepList from './StepList';
import type { StepControls } from './StepList';
import SubagentCard from './SubagentCard';
import ThinkingBlock from './ThinkingBlock';
import WorkingIndicator from './WorkingIndicator';
import { agentColors } from './tokens';

/** Open state of thinking blocks and of tool steps' details (keys `stepOpenKey`), kept across transcript reloads. */
export type Thinking = { open: Record<string, boolean>; onOpenChange: (id: string, open: boolean) => void };

export type Files = { chatId?: string; known: Artifact[] };

/** Width of a message bubble in the panel (design: 85 %) and on the wider agent page. */
const bubbleWidth = (dense: boolean) => (dense ? '85%' : '74%');

/**
 * The user's message (issue #54, design): a light green bubble on the right; its attachments as file cards directly
 * above it.
 */
export function UserBubble({
    text,
    dense,
    pending,
    attachments,
    files,
}: {
    text: string;
    dense: boolean;
    pending?: string;
    /** Names of the attachments that went with the message. */
    attachments?: string[];
    files: Files;
}) {
    const withFiles = !!attachments?.length;
    return (
        <Box
            title={pending}
            data-pending={pending ? 'true' : undefined}
            sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                gap: '6px',
                minWidth: 0,
                opacity: pending ? 0.6 : 1,
            }}
        >
            {withFiles && <MessageAttachments chatId={files.chatId} files={attachments ?? []} known={files.known} />}
            {text && (
                <Box
                    data-testid="agent-user-bubble"
                    sx={{
                        maxWidth: bubbleWidth(dense),
                        bgcolor: agentColors.userBubble,
                        color: 'text.primary',
                        borderRadius: '16px 16px 4px 16px',
                        px: '14px',
                        py: '10px',
                        fontSize: dense ? 14 : 14.5,
                        lineHeight: 1.5,
                        whiteSpace: 'pre-wrap',
                        overflowWrap: 'anywhere',
                    }}
                >
                    {text}
                </Box>
            )}
        </Box>
    );
}

/** Copy under an answer: its text as Markdown to the clipboard; the icon turns into a tick for a moment. */
export function CopyButton({ text }: { text: string }) {
    const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
    useEffect(() => {
        if (state === 'idle') return;
        const t = setTimeout(() => setState('idle'), 1200);
        return () => clearTimeout(t);
    }, [state]);
    return (
        <Box sx={{ display: 'flex', ml: '-8px' }}>
            <Tooltip
                title={state === 'copied' ? 'Copied' : state === 'failed' ? 'Could not copy' : 'Copy'}
                disableInteractive
            >
                <IconButton
                    aria-label="Copy answer"
                    data-testid="agent-copy"
                    data-state={state}
                    onClick={() => void copyText(text).then((ok) => setState(ok ? 'copied' : 'failed'))}
                    sx={{ width: 32, height: 32, color: 'rgba(0, 0, 0, 0.54)' }}
                >
                    {state === 'copied' ? (
                        <CheckIcon sx={{ fontSize: 18, color: agentColors.green }} />
                    ) : (
                        <ContentCopyIcon sx={{ fontSize: 18 }} />
                    )}
                </IconButton>
            </Tooltip>
        </Box>
    );
}

/**
 * One answer of the agent: its parts in the order they happened, live as they arrive (issue #57, as before #54): text
 * as Markdown, each thinking block as one collapsed "Thinking · 3 s", each run of tool calls as a step list with its
 * controls and the files those calls handed over below it. Under the answer the subagents it started as a card
 * (#54), files placed by time and, once finished, the copy button.
 */
export function AgentBlock({
    item,
    dense,
    thinking,
    chatId,
    live = false,
    active = false,
    controls,
    results,
}: {
    item: Extract<TranscriptItem, { kind: 'agent' }>;
    dense: boolean;
    thinking: Thinking;
    /** Stop / move running commands, background chips, the runs of `subagent` calls. */
    controls?: StepControls;
    /** For the answer's display images and file downloads. */
    chatId?: string;
    /** The answer is still streaming (Mermaid blocks render once closed, no copy yet). */
    live?: boolean;
    /** The answer belongs to the turn that runs right now (no copy yet). */
    active?: boolean;
    /** Files the agent handed over in this answer (placeOutputs). */
    results?: Artifact[];
}) {
    const markdown = useMemo(() => answerMarkdown(item.parts), [item.parts]);
    const placed = useMemo(() => outputsByStepPart(item.parts, results), [item.parts, results]);
    const subagents = controls?.subagents;
    const runs = useMemo(() => {
        if (!subagents) return [];
        const seen = new Set<string>();
        const out: SubagentNavItem[] = [];
        for (const s of answerSteps(item.parts))
            for (const r of subagents.byCall.get(s.id) ?? [])
                if (!seen.has(r.runId)) {
                    seen.add(r.runId);
                    out.push(r);
                }
        return out;
    }, [item.parts, subagents]);
    return (
        <Box
            data-testid="agent-answer"
            sx={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, fontSize: dense ? 14 : 14.5, lineHeight: 1.6 }}
        >
            {item.parts.map((p, i) => {
                if (p.type === 'text')
                    return (
                        <Box key={i} data-testid="agent-answer-text" sx={{ minWidth: 0 }}>
                            <Markdown text={p.text} dense={dense} images={{ chatId, msgId: p.imageKey }} streaming={live} />
                        </Box>
                    );
                if (p.type === 'thinking')
                    return (
                        <ThinkingBlock
                            key={p.id}
                            part={p}
                            open={thinking.open[p.id]}
                            onOpenChange={thinking.onOpenChange}
                        />
                    );
                const files = placed.byPart.get(i);
                return (
                    <Fragment key={`steps-${p.steps[0]?.id ?? i}`}>
                        <StepList steps={p.steps} controls={controls} expand={thinking} />
                        {files && <ResultAttachments chatId={chatId} artifacts={files} />}
                    </Fragment>
                );
            })}
            {item.error && <Typography sx={{ fontSize: 12.5, color: 'error.main' }}>Error: {item.error}</Typography>}
            {item.stopped && (
                <Typography data-testid="agent-answer-stopped" sx={{ fontSize: 12.5, color: 'text.secondary' }}>
                    Stopped by you
                </Typography>
            )}
            {runs.length > 0 && subagents && <SubagentCard items={runs} onOpen={subagents.onOpen} />}
            {placed.rest.length > 0 && <ResultAttachments chatId={chatId} artifacts={placed.rest} />}
            {!live && !active && markdown && <CopyButton text={markdown} />}
        </Box>
    );
}

/** Divider-like line for a compaction: stored ones with their sizes, a running one with a spinner. */
function CompactionLine({
    item,
    running,
}: {
    item?: Extract<TranscriptItem, { kind: 'compaction' }>;
    running?: { reason: string };
}) {
    const reason = compactionReason(running?.reason ?? item?.reason);
    let text: string;
    if (running) text = `Compacting the context${reason ? ` (${reason})` : ''} …`;
    else {
        const sizes =
            item?.tokensBefore !== undefined
                ? ` · ${formatTokens(item.tokensBefore)} → ${
                      item.tokensAfter !== undefined ? `≈ ${formatTokens(item.tokensAfter)}` : '?'
                  } tokens`
                : '';
        text = `Context compacted${reason ? ` (${reason})` : ''}${sizes}`;
    }
    return (
        <Box
            data-testid={running ? 'agent-compacting' : 'agent-compaction'}
            sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                fontSize: 12,
                color: 'text.secondary',
                '&::before, &::after': { content: '""', flex: 1, borderTop: 1, borderColor: 'divider' },
            }}
        >
            {running ? <CircularProgress size={12} /> : <CompressIcon sx={{ fontSize: 14 }} />}
            <span>{text}</span>
        </Box>
    );
}

/** Result of a built-in slash command: the command as typed and what it did (or why it did not work). */
function CommandLine({ notice }: { notice: CommandNotice }) {
    const error = notice.tone === 'error';
    return (
        <Box
            data-testid="agent-command-notice"
            data-tone={notice.tone}
            role={error ? 'alert' : 'status'}
            sx={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 0.75,
                fontSize: 12,
                color: error ? 'error.main' : 'text.secondary',
                px: 0.5,
                minWidth: 0,
            }}
        >
            {error ? (
                <ErrorOutlineIcon sx={{ fontSize: 14, mt: '2px' }} />
            ) : (
                <TerminalIcon sx={{ fontSize: 14, mt: '2px' }} />
            )}
            <Box component="span" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                <Box component="code" sx={{ fontFamily: 'monospace', fontSize: 11.5, color: 'text.primary', mr: 0.75 }}>
                    {notice.command}
                </Box>
                {notice.text}
            </Box>
        </Box>
    );
}

function Notice({ text, label }: { text: string; label?: string }) {
    const first = label ?? text.split('\n').find((l) => l.trim() && !l.startsWith('[')) ?? text.split('\n')[0];
    return (
        <Box
            title={text}
            sx={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 0.75,
                fontSize: 12,
                color: 'text.secondary',
                px: 0.5,
            }}
        >
            <InfoOutlinedIcon sx={{ fontSize: 14, mt: '2px' }} />
            <span>Gateway notice: {first}</span>
        </Box>
    );
}

/** The empty chat (design): the agent's symbol and one line. */
function EmptyChat() {
    return (
        <Box
            data-testid="agent-empty-chat"
            sx={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1.5,
                py: 4,
                px: 3,
                textAlign: 'center',
                color: 'text.secondary',
            }}
        >
            <AutoAwesomeIcon sx={{ fontSize: 32, color: alpha(agentColors.green, 0.5) }} />
            <Typography sx={{ fontSize: 14, lineHeight: 1.5 }}>No messages yet. Describe what you want to do.</Typography>
        </Box>
    );
}

/**
 * The conversation of a chat (issues #54, #57): user messages as light green bubbles with their files above, answers
 * with text, thinking blocks and tool steps in the order they happened, the files and subagents they produced and a
 * copy button; notices of the gateway, the answer that is streaming right now and a working hint while nothing of it
 * shows yet. Scrolling is up to the caller (ChatView, useStickToBottom).
 */
export default function Conversation({
    stream,
    items,
    dense = false,
    subagents,
}: {
    stream: ChatStream;
    /** The transcript, built by the caller (it also counts the entries for scrolling). */
    items: TranscriptItem[];
    dense?: boolean;
    /** Runs per `subagent` call, listed as a card under the answer and opened on click (issue #48). */
    subagents?: StepControls['subagents'];
}) {
    const { chat, live, resumes, pending } = stream;
    const liveP = useMemo(() => liveParts(live), [live]);
    // Open state chosen per thinking block and per tool step (collapsed until opened); kept here so it survives the
    // switch from live to stored message and every reload of the transcript.
    const [open, setOpen] = useState<Record<string, boolean>>({});
    const onOpenChange = useCallback((id: string, o: boolean) => setOpen((c) => ({ ...c, [id]: o })), []);
    const thinking = useMemo(() => ({ open, onOpenChange }), [open, onOpenChange]);
    const hasLive = liveP.length > 0;
    const files = useMemo<Files>(() => ({ chatId: chat?.id, known: stream.artifacts }), [chat?.id, stream.artifacts]);
    const { runningTools, stopTool, backgroundTool, background } = stream;
    const controls = useMemo<StepControls>(
        () => ({
            running: runningTools,
            onStop: stopTool,
            onBackground: backgroundTool,
            background: backgroundByCall(background),
            subagents,
        }),
        [runningTools, stopTool, backgroundTool, background, subagents],
    );
    // The streaming message continues the stored answer of the same turn (the last item, no user message after it):
    // one answer, not two.
    const lastItem = items[items.length - 1];
    const mergeLive = hasLive && !pending && lastItem?.kind === 'agent';
    const shown = useMemo<TranscriptItem[]>(() => {
        if (!hasLive) return items;
        if (mergeLive && lastItem?.kind === 'agent')
            return [...items.slice(0, -1), { ...lastItem, parts: [...lastItem.parts, ...liveP] }];
        return items;
    }, [items, hasLive, mergeLive, lastItem, liveP]);
    const liveItem = useMemo<Extract<TranscriptItem, { kind: 'agent' }> | undefined>(
        () => (hasLive && !mergeLive ? { kind: 'agent', key: 'live', parts: liveP } : undefined),
        [hasLive, mergeLive, liveP],
    );
    // files the agent handed over, under the answer that produced them (by tool call, else by time)
    const placed = useMemo(
        () => placeOutputs(liveItem ? [...shown, liveItem] : shown, stream.artifacts),
        [shown, liveItem, stream.artifacts],
    );
    const running = !!chat?.running;
    const waitingApproval = stream.approvals.some((a) => a.state === 'pending');
    // the answer of the running turn: the live one, else the last stored answer while the chat runs
    const activeKey = running && !pending ? (liveItem ? 'live' : shown[shown.length - 1]?.kind === 'agent' ? shown[shown.length - 1].key : undefined) : undefined;
    // resume blocks sit after the user message that triggered them; not stored yet: at the end. A resume on opening
    // the chat sits where it started, before anything stored later and before a message still on its way. The start of
    // a new chat's first sandbox comes before everything.
    const resumesPlaced = useMemo(() => {
        const after = new Map<number, ResumeView[]>();
        const before = new Map<number, ResumeView[]>();
        const end: ResumeView[] = [];
        const beforePending: ResumeView[] = [];
        const top: ResumeView[] = [];
        for (const r of resumes) {
            if (r.start) {
                top.push(r);
                continue;
            }
            if (r.opened) {
                const i = noticeAnchor(items, r.afterSeq);
                if (i < 0) beforePending.push(r);
                else before.set(i, [...(before.get(i) ?? []), r]);
                continue;
            }
            const i = resumeAnchor(items, r);
            if (i < 0) end.push(r);
            else after.set(i, [...(after.get(i) ?? []), r]);
        }
        return { after, before, end, beforePending, top };
    }, [items, resumes]);
    // only the latest resume can be tried again; an earlier failed one stays visible as history
    const lastResume = resumes[resumes.length - 1]?.id;
    const retryOf = (r: ResumeView) => (r.id === lastResume ? stream.retryResume : undefined);
    const resuming = resumeRunning(resumes);
    // command notes sit before the first message stored after the command ran; nothing stored since: at the end
    const notes = useMemo(() => {
        const before = new Map<number, CommandNotice[]>();
        const end: CommandNotice[] = [];
        for (const n of stream.commandNotices) {
            const i = noticeAnchor(items, n.afterSeq);
            if (i < 0) end.push(n);
            else before.set(i, [...(before.get(i) ?? []), n]);
        }
        return { before, end };
    }, [items, stream.commandNotices]);

    if (stream.loading && items.length === 0) {
        return (
            <Box sx={{ display: 'grid', placeItems: 'center', py: 4 }}>
                <CircularProgress size={24} />
            </Box>
        );
    }

    const answer = (it: Extract<TranscriptItem, { kind: 'agent' }>, isLive: boolean) => (
        <AgentBlock
            item={it}
            dense={dense}
            thinking={thinking}
            chatId={chat?.id}
            live={isLive}
            active={it.key === activeKey}
            controls={controls}
            results={placed.byItem.get(it.key)}
        />
    );
    const empty =
        items.length === 0 &&
        !hasLive &&
        !pending &&
        resumes.length === 0 &&
        notes.end.length === 0 &&
        !chat?.starting &&
        !running;

    return (
        // only the empty chat fills the height (its line sits in the middle); otherwise approvals follow right after
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, flex: empty ? 1 : 'none', minWidth: 0 }}>
            {resumesPlaced.top.map((r) => (
                <ResumeBlock key={`resume-${r.id}`} resume={r} onRetry={retryOf(r)} />
            ))}
            {/* a new chat waiting for its sandbox, before the first step arrives over SSE */}
            {chat?.starting && resumes.length === 0 && (
                <Box
                    data-testid="agent-chat-starting"
                    role="status"
                    sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary', fontSize: 12.5 }}
                >
                    <CircularProgress size={14} />
                    Starting a sandbox for this chat … You can type already.
                </Box>
            )}
            {empty && <EmptyChat />}
            {shown.map((it, i) => (
                <Fragment key={it.key}>
                    {notes.before.get(i)?.map((n) => (
                        <CommandLine key={n.key} notice={n} />
                    ))}
                    {resumesPlaced.before.get(i)?.map((r) => (
                        <ResumeBlock key={`resume-${r.id}`} resume={r} onRetry={retryOf(r)} />
                    ))}
                    {it.kind === 'user' ? (
                        <UserBubble text={it.text} dense={dense} attachments={it.files} files={files} />
                    ) : it.kind === 'notice' ? (
                        it.note ? (
                            <BackgroundNoteLine note={it.note} text={it.text} />
                        ) : (
                            <Notice text={it.text} label={it.label} />
                        )
                    ) : it.kind === 'compaction' ? (
                        <CompactionLine item={it} />
                    ) : (
                        answer(it, mergeLive && i === shown.length - 1)
                    )}
                    {resumesPlaced.after.get(i)?.map((r) => (
                        <ResumeBlock key={`resume-${r.id}`} resume={r} onRetry={retryOf(r)} />
                    ))}
                </Fragment>
            ))}
            {resumesPlaced.beforePending.map((r) => (
                <ResumeBlock key={`resume-${r.id}`} resume={r} onRetry={retryOf(r)} />
            ))}
            {pending && (
                <UserBubble
                    text={pending.text}
                    attachments={pending.files}
                    files={files}
                    dense={dense}
                    pending={
                        chat?.starting || resumes.some((r) => r.start && r.state === 'running')
                            ? 'Goes to the agent once the sandbox is ready'
                            : resuming
                            ? 'Goes to the agent once the chat has resumed'
                            : 'Sending …'
                    }
                />
            )}
            {resumesPlaced.end.map((r) => (
                <ResumeBlock key={`resume-${r.id}`} resume={r} onRetry={retryOf(r)} />
            ))}
            {notes.end.map((n) => (
                <CommandLine key={n.key} notice={n} />
            ))}
            {liveItem && answer(liveItem, true)}
            {placed.unplaced.length > 0 && <ResultAttachments chatId={chat?.id} artifacts={placed.unplaced} />}
            {stream.compacting && <CompactionLine running={stream.compacting} />}
            {/* the agent works, but nothing of this turn's answer shows yet: a subtle hint, never in place of the steps */}
            {(running || pending) && !activeKey && !resuming && !chat?.starting && !stream.compacting && (
                <WorkingIndicator
                    label={
                        chat?.resuming
                            ? 'Resuming the chat …'
                            : waitingApproval
                            ? 'Waiting for your approval …'
                            : undefined
                    }
                />
            )}
        </Box>
    );
}
