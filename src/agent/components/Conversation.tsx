// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { Fragment, useCallback, useMemo, useState } from 'react';

import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import CompressIcon from '@mui/icons-material/Compress';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import TerminalIcon from '@mui/icons-material/Terminal';

import { noticeAnchor } from '../commands';
import type { CommandNotice } from '../commands';
import type { Artifact } from '../types';
import { resumeAnchor, resumeRunning } from '../resume';
import type { ResumeView } from '../resume';
import { useAlwaysShowThinking } from '../thinkingPref';
import { liveParts } from '../transcript';
import type { TranscriptItem } from '../transcript';
import type { ChatStream } from '../useChatStream';
import { compactionReason, formatAnswerUsage, formatTokens, formatUsd, TARIFF_LABEL } from '../usage';
import type { AnswerUsage } from '../usage';
import { MessageAttachments } from './Attachments';
import Markdown from './Markdown';
import ResumeBlock from './ResumeBlock';
import StepList from './StepList';
import ThinkingBlock from './ThinkingBlock';

const NO_CHOICES: Record<string, boolean> = {};

type Thinking = { open: Record<string, boolean>; onOpenChange: (id: string, open: boolean) => void };

type Files = { chatId?: string; known: Artifact[] };

function UserBubble({
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
    const width = dense ? '88%' : '74%';
    const withFiles = !!attachments?.length;
    const bubble = text ? (
        <Box
            title={pending}
            data-pending={pending ? 'true' : undefined}
            data-testid="agent-user-bubble"
            sx={{
                opacity: pending ? 0.6 : 1,
                alignSelf: 'flex-end',
                maxWidth: withFiles ? '100%' : width,
                bgcolor: 'primary.main',
                color: '#fff',
                borderRadius: '14px 14px 3px 14px',
                px: dense ? 1.5 : 2,
                py: dense ? 1 : 1.25,
                fontSize: dense ? 13.5 : 14.5,
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                overflowWrap: 'anywhere',
            }}
        >
            {text}
        </Box>
    ) : null;
    if (!withFiles) return bubble;
    return (
        <Box
            title={bubble ? undefined : pending}
            data-pending={pending ? 'true' : undefined}
            sx={{
                alignSelf: 'flex-end',
                maxWidth: width,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                opacity: pending && !bubble ? 0.6 : 1,
            }}
        >
            {bubble}
            <MessageAttachments chatId={files.chatId} files={attachments ?? []} known={files.known} />
        </Box>
    );
}

function AgentBlock({
    item,
    dense,
    thinking,
    chatId,
}: {
    item: Extract<TranscriptItem, { kind: 'agent' }>;
    dense: boolean;
    thinking: Thinking;
    /** For the answer's display images. */
    chatId?: string;
}) {
    return (
        <Box sx={{ display: 'flex', minWidth: 0 }}>
            <Box sx={{ flex: 1, minWidth: 0, fontSize: dense ? 13.5 : 14.5, lineHeight: 1.6 }}>
                {item.parts.map((p, i) => {
                    if (p.type === 'text') {
                        return (
                            <Box key={i} sx={{ mb: 1 }}>
                                <Markdown text={p.text} dense={dense} images={{ chatId, msgId: p.imageKey }} />
                            </Box>
                        );
                    }
                    if (p.type === 'thinking') {
                        return (
                            <ThinkingBlock
                                key={p.id}
                                part={p}
                                open={thinking.open[p.id]}
                                onOpenChange={thinking.onOpenChange}
                            />
                        );
                    }
                    return <StepList key={i} steps={p.steps} />;
                })}
                {item.error && (
                    <Typography sx={{ fontSize: 12.5, color: 'error.main' }}>Error: {item.error}</Typography>
                )}
                {item.usage && <UsageLine usage={item.usage} />}
            </Box>
        </Box>
    );
}

/** Muted line under an answer: tokens, cost by tariff and the tariff it fell into. */
function UsageLine({ usage }: { usage: AnswerUsage }) {
    const hint = [
        usage.cost !== undefined
            ? `Cost by tariff at the time of the answer${usage.tariff ? ` (${TARIFF_LABEL[usage.tariff]})` : ''}.`
            : usage.flatCost !== undefined
              ? "Approximate: pi's flat price, no tariff cost stored for this answer."
              : 'No cost stored for this answer.',
        usage.calls > 1 ? `${usage.calls} model calls in this answer.` : undefined,
        'Subagents and compactions count only in the chat total.',
    ]
        .filter(Boolean)
        .join(' ');
    return (
        <Tooltip title={hint} placement="bottom-start">
            <Typography
                data-testid="agent-answer-usage"
                sx={{
                    fontSize: 11.5,
                    color: 'text.disabled',
                    fontVariantNumeric: 'tabular-nums',
                    mt: 0.25,
                    width: 'fit-content',
                }}
            >
                {formatAnswerUsage(usage)}
            </Typography>
        </Tooltip>
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
        text = `Context compacted${reason ? ` (${reason})` : ''}${sizes}${
            item?.cost !== undefined ? ` · ${formatUsd(item.cost)}` : ''
        }`;
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

/**
 * The conversation of a chat: user messages as green bubbles, agent answers with markdown and tool
 * steps and collapsed thinking, notices of the gateway, the answer that is streaming right now and a working indicator. Scrolling is
 * up to the caller (ChatView, useStickToBottom).
 */
export default function Conversation({
    stream,
    items,
    dense = false,
}: {
    stream: ChatStream;
    /** The transcript, built by the caller (it also counts the entries for scrolling). */
    items: TranscriptItem[];
    dense?: boolean;
}) {
    const { chat, live, resumes, pending } = stream;
    const liveP = useMemo(() => liveParts(live), [live]);
    // Open state chosen per thinking block; kept here so it survives the switch from live to stored message.
    // The choices belong to one value of "Always show thinking": switching it applies to every block again.
    const [alwaysShow] = useAlwaysShowThinking();
    const [choices, setChoices] = useState<{ pref: boolean; open: Record<string, boolean> }>({
        pref: alwaysShow,
        open: {},
    });
    const onOpenChange = useCallback(
        (id: string, o: boolean) =>
            setChoices((c) => ({ pref: alwaysShow, open: { ...(c.pref === alwaysShow ? c.open : {}), [id]: o } })),
        [alwaysShow],
    );
    const open = choices.pref === alwaysShow ? choices.open : NO_CHOICES;
    const thinking = useMemo(() => ({ open, onOpenChange }), [open, onOpenChange]);
    const hasLive = liveP.length > 0;
    const files = useMemo<Files>(() => ({ chatId: chat?.id, known: stream.artifacts }), [chat?.id, stream.artifacts]);
    // resume blocks sit after the user message that triggered them; not stored yet: at the end
    const placed = useMemo(() => {
        const after = new Map<number, ResumeView[]>();
        const end: ResumeView[] = [];
        for (const r of resumes) {
            const i = resumeAnchor(items, r);
            if (i < 0) end.push(r);
            else after.set(i, [...(after.get(i) ?? []), r]);
        }
        return { after, end };
    }, [items, resumes]);
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

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: dense ? 1.5 : 1.75 }}>
            {items.length === 0 && !hasLive && !pending && resumes.length === 0 && notes.end.length === 0 && (
                <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
                    No messages yet. Describe what you want to do.
                </Typography>
            )}
            {items.map((it, i) => (
                <Fragment key={it.key}>
                    {notes.before.get(i)?.map((n) => <CommandLine key={n.key} notice={n} />)}
                    {it.kind === 'user' ? (
                        <UserBubble text={it.text} dense={dense} attachments={it.files} files={files} />
                    ) : it.kind === 'notice' ? (
                        <Notice text={it.text} label={it.label} />
                    ) : it.kind === 'compaction' ? (
                        <CompactionLine item={it} />
                    ) : (
                        <AgentBlock item={it} dense={dense} thinking={thinking} chatId={chat?.id} />
                    )}
                    {placed.after.get(i)?.map((r) => <ResumeBlock key={`resume-${r.id}`} resume={r} />)}
                </Fragment>
            ))}
            {pending && (
                <UserBubble
                    text={pending.text}
                    attachments={pending.files}
                    files={files}
                    dense={dense}
                    pending={resuming ? 'Goes to the agent once the chat has resumed' : 'Sending …'}
                />
            )}
            {placed.end.map((r) => (
                <ResumeBlock key={`resume-${r.id}`} resume={r} />
            ))}
            {notes.end.map((n) => (
                <CommandLine key={n.key} notice={n} />
            ))}
            {hasLive && (
                <AgentBlock item={{ kind: 'agent', key: 'live', parts: liveP }} dense={dense} thinking={thinking} />
            )}
            {stream.compacting && <CompactionLine running={stream.compacting} />}
            {(chat?.running || pending) && !hasLive && !resuming && !stream.compacting && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary', fontSize: 12.5 }}>
                    <CircularProgress size={14} />
                    {chat?.resuming
                        ? 'Resuming the chat …'
                        : stream.approvals.some((a) => a.state === 'pending')
                          ? 'Waiting for your approval …'
                          : 'The agent is working …'}
                </Box>
            )}
        </Box>
    );
}
