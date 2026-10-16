// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { Fragment, useCallback, useMemo, useState } from 'react';

import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CompressIcon from '@mui/icons-material/Compress';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import TerminalIcon from '@mui/icons-material/Terminal';

import { answerSteps } from '../answer';
import { backgroundByCall } from '../background';
import { noticeAnchor } from '../commands';
import { outputsByStepPart, placeOutputs } from '../files';
import { placePlans, plansByPart, pendingIdsOf } from '../plan';
import type { PlacedPlan, Plan } from '../plan';
import { useJobs } from '../jobs';
import type { WatchJob } from '../jobs';
import { useAgentOptional } from '../AgentContext';
import type { CommandNotice } from '../commands';
import type { SubagentNavItem } from '../subagents';
import type { Approval, Artifact } from '../types';
import { resumeAnchor, resumeRunning } from '../resume';
import type { ResumeView } from '../resume';
import { showIdleBar } from '../runState';
import { abortLineText, liveParts } from '../transcript';
import type { TranscriptItem } from '../transcript';
import type { ChatStream } from '../useChatStream';
import { compactionReason, formatTokens } from '../usage';
import { AgentFileMessage, MessageAttachments } from './Attachments';
import Markdown from './Markdown';
import BackgroundNoteLine from './BackgroundNoteLine';
import ResumeBlock from './ResumeBlock';
import StepList from './StepList';
import type { StepControls } from './StepList';
import SubagentCard from './SubagentCard';
import PlanCard from './PlanCard';
import ThinkingBlock from './ThinkingBlock';
import WorkingIndicator, { WorkingBar } from './WorkingIndicator';
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
    quiet,
    attachments,
    files,
}: {
    text: string;
    dense: boolean;
    pending?: string;
    /** Slightly dimmed until the stored message replaces it, without a hint text. */
    quiet?: boolean;
    /** Names of the attachments that went with the message. */
    attachments?: string[];
    files: Files;
}) {
    const withFiles = !!attachments?.length;
    return (
        <Box
            title={pending}
            data-pending={pending || quiet ? 'true' : undefined}
            sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                gap: '6px',
                minWidth: 0,
                opacity: pending || quiet ? 0.6 : 1,
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

/** What the plan cards of this view need (A-E4): the chat's approvals, its observed jobs and the layout. */
export type PlanEnv = {
    approvals: Approval[];
    jobs: WatchJob[];
    /** Ids of the approvals that are still pending: a step with such a parked approval waits for the user. */
    pending: ReadonlySet<string>;
    layout: 'panel' | 'page';
    /** The user allowed browser notifications for a plan (D4.4); absent where the view cannot store it. */
    onNotify?: (planId: string, on: boolean) => void;
};

/**
 * One answer of the agent: its parts in the order they happened, live as they arrive (issue #57, as before #54): text
 * as Markdown, each thinking block as one collapsed "Thinking · 3 s", each run of tool calls as a step list with its
 * controls, and right after it the file message with the files those calls sent (issue #62; nothing of them inside the
 * step list). A plan of this answer sits right after the part with its `propose_plan` call (issue #138), the plans of
 * other answers stay under the whole answer. Under the answer the subagents it started as a card (#54) and a file
 * message for files placed by time.
 */
export function AgentBlock({
    item,
    dense,
    thinking,
    chatId,
    live = false,
    controls,
    results,
    filesChatId,
    plans,
    approvals,
    onDecide,
    planEnv,
}: {
    item: Extract<TranscriptItem, { kind: 'agent' }>;
    dense: boolean;
    thinking: Thinking;
    /** Stop / move running commands, background chips, the runs of `subagent` calls. */
    controls?: StepControls;
    /** For the answer's display images and file downloads. */
    chatId?: string;
    /** The answer is still streaming (Mermaid blocks render once closed). */
    live?: boolean;
    /** Files the agent sent in this answer (placeOutputs, outputsByCall). */
    results?: Artifact[];
    /** Chat whose files the file messages download (defaults to chatId; the subagent view has no chatId). */
    filesChatId?: string;
    /** Plans of this answer (issue #138): each one after the part of its call, the rest under the answer. */
    plans?: PlacedPlan[];
    /** Approvals the plan cards show (issue #70); the subagent view renders its cards itself. */
    approvals?: Approval[];
    onDecide?: (approval: Approval, approve: boolean) => Promise<void>;
    /** What every plan card of this view needs on top (autonomy E4): approvals, jobs, pending ids, layout. */
    planEnv?: PlanEnv;
}) {
    const fileChatId = filesChatId ?? chatId;
    const placed = useMemo(() => outputsByStepPart(item.parts, results), [item.parts, results]);
    // where in the answer each plan goes (issue #138): after the part holding its call
    const placedPlans = useMemo(() => plansByPart(item.parts, plans ?? []), [item.parts, plans]);
    const planCard = (p: PlacedPlan) => (
        <PlanCard
            key={p.id}
            plan={p}
            approval={approvals?.find((a) => a.id === p.approval_id)}
            approvals={planEnv?.approvals}
            jobs={planEnv?.jobs}
            pending={planEnv?.pending}
            layout={planEnv?.layout}
            onNotify={planEnv ? (on) => planEnv.onNotify?.(p.id, on) : undefined}
            onDecide={onDecide}
            dense={dense}
        />
    );
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
            sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                minWidth: 0,
                fontSize: dense ? 14 : 14.5,
                lineHeight: 1.6,
            }}
        >
            {item.parts.map((p, i) => {
                // plans proposed in this part come right after it (issue #138)
                const cards = placedPlans.byPart.get(i)?.map(planCard);
                if (p.type === 'text')
                    return (
                        <Fragment key={i}>
                            <Box data-testid="agent-answer-text" sx={{ minWidth: 0 }}>
                                <Markdown
                                    text={p.text}
                                    dense={dense}
                                    images={{ chatId, msgId: p.imageKey }}
                                    streaming={live}
                                />
                            </Box>
                            {cards}
                        </Fragment>
                    );
                if (p.type === 'thinking')
                    return (
                        <Fragment key={p.id}>
                            <ThinkingBlock part={p} open={thinking.open[p.id]} onOpenChange={thinking.onOpenChange} />
                            {cards}
                        </Fragment>
                    );
                const files = placed.byPart.get(i);
                return (
                    <Fragment key={`steps-${p.steps[0]?.id ?? i}`}>
                        <StepList steps={p.steps} controls={controls} expand={thinking} />
                        {files && <AgentFileMessage chatId={fileChatId} artifacts={files} />}
                        {cards}
                    </Fragment>
                );
            })}
            {item.error && <Typography sx={{ fontSize: 12.5, color: 'error.main' }}>Error: {item.error}</Typography>}
            {item.stopped && (
                // the reason decides the wording (issue #120, F9): "Stopped by you" only for the user's own stop,
                // otherwise the limit or the trash, and just "Stopped" when nothing recorded one
                <Typography data-testid="agent-answer-stopped" sx={{ fontSize: 12.5, color: 'text.secondary' }}>
                    {abortLineText(item.abortReason)}
                </Typography>
            )}
            {runs.length > 0 && subagents && (
                <SubagentCard
                    items={runs}
                    onOpen={subagents.onOpen}
                    onStop={subagents.stop?.onStop}
                    stopStateOf={subagents.stop?.stateOf}
                    stopErrorOf={subagents.stop?.errorOf}
                    onDismissStopError={subagents.stop?.dismissError}
                />
            )}
            {placed.rest.length > 0 && <AgentFileMessage chatId={fileChatId} artifacts={placed.rest} />}
            {/* a plan whose call is not among the parts of this answer stays under the whole answer (as before #138) */}
            {placedPlans.rest.map(planCard)}
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
            <Typography sx={{ fontSize: 14, lineHeight: 1.5 }}>
                No messages yet. Describe what you want to do.
            </Typography>
        </Box>
    );
}

/**
 * The conversation of a chat (issues #54, #57): user messages as light green bubbles with their files above, answers
 * with text, thinking blocks and tool steps in the order they happened and the files and subagents they produced;
 * notices of the gateway, the answer that is streaming right now and a working hint while nothing of it
 * shows yet. Scrolling is up to the caller (ChatView, useStickToBottom).
 */
export default function Conversation({
    stream,
    items,
    dense = false,
    subagents,
    plans,
}: {
    stream: ChatStream;
    /** The transcript, built by the caller (it also counts the entries for scrolling). */
    items: TranscriptItem[];
    dense?: boolean;
    /** Runs per `subagent` call, listed as a card under the answer and opened on click (issue #48). */
    subagents?: StepControls['subagents'];
    /**
     * The chat's plans (issue #70): a card in the answer of their tool call, at the place of that call (issue #138);
     * plans without a call stay before the running answer, as before.
     */
    plans?: Plan[];
}) {
    const { chat, live, resumes, pending } = stream;
    // the observed platform jobs of this chat (A-E2) and what the plan cards of this view need (A-E4)
    const jobs = useJobs(stream.chat?.id);
    const pendingIds = useMemo(() => pendingIdsOf(stream.approvals), [stream.approvals]);
    const setPlanNotify = useAgentOptional()?.setPlanNotify;
    const planEnv: PlanEnv = useMemo(
        () => ({ approvals: stream.approvals, jobs, pending: pendingIds, layout: dense ? 'panel' : 'page' }),
        [stream.approvals, jobs, pendingIds, dense],
    );
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
    const placedPlans = useMemo(() => placePlans(shown, plans ?? [], true), [shown, plans]);
    // the cards of the plans without an answer (no tool call, gateway F28): they stay before the running answer, as
    // before issue #138; the plans of an answer are rendered inside it, at the place of their call
    const planCards = (list: PlacedPlan[]) =>
        list.map((p) => (
            <PlanCard
                key={p.id}
                plan={p}
                approval={stream.approvals.find((a) => a.id === p.approval_id)}
                approvals={stream.approvals}
                jobs={jobs}
                pending={pendingIds}
                layout={dense ? 'panel' : 'page'}
                onNotify={setPlanNotify ? (on) => setPlanNotify(p.id, on) : undefined}
                onDecide={stream.decide}
                dense={dense}
            />
        ));
    const running = !!chat?.running;
    const waitingApproval = stream.approvals.some((a) => a.state === 'pending');
    // the answer of the running turn: the live one, else the last stored answer while the chat runs
    const activeKey =
        running && !pending
            ? liveItem
                ? 'live'
                : shown[shown.length - 1]?.kind === 'agent'
                ? shown[shown.length - 1].key
                : undefined
            : undefined;
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
            controls={controls}
            results={placed.byItem.get(it.key)}
            plans={placedPlans.byItem.get(it.key)}
            approvals={stream.approvals}
            onDecide={stream.decide}
            planEnv={planEnv}
        />
    );
    const empty =
        items.length === 0 &&
        !hasLive &&
        !pending &&
        stream.delivered.length === 0 &&
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
                    Preparing this chat … You can type already.
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
                            ? 'Goes to the agent once the chat is ready'
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
            {placedPlans.rest.length > 0 && planCards(placedPlans.rest)}
            {liveItem && answer(liveItem, true)}
            {placed.unplaced.length > 0 && <AgentFileMessage chatId={chat?.id} artifacts={placed.unplaced} />}
            {stream.compacting && <CompactionLine running={stream.compacting} />}
            {/* handed to the agent, which reads it after its current step: the stored message takes this place */}
            {stream.delivered.map((d) => (
                <UserBubble key={d.key} text={d.text} attachments={d.attachments} files={files} dense={dense} quiet />
            ))}
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
            {showIdleBar({
                running,
                pending: !!pending,
                answerShown: !!activeKey,
                streaming: liveP.some(
                    (p) => p.type === 'text' || (p.type === 'thinking' && p.liveSince !== undefined),
                ),
                toolRunning: runningTools.size > 0,
                approvalWaiting: waitingApproval,
                loadingOrCompacting: resuming || !!chat?.starting || !!stream.compacting,
            }) && (
                // the answer of the running turn stands there inert (a step just ended, the next output has not begun):
                // a quiet sign of life, without a text of its own (F8, issue L6/#123, decision DL6.4)
                <WorkingBar />
            )}
        </Box>
    );
}
