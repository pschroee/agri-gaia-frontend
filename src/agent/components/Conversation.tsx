// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { Fragment, useCallback, useMemo, useState } from 'react';

import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

import { resumeAnchor, resumeRunning } from '../resume';
import type { ResumeView } from '../resume';
import { useAlwaysShowThinking } from '../thinkingPref';
import { liveParts } from '../transcript';
import type { TranscriptItem } from '../transcript';
import type { ChatStream } from '../useChatStream';
import Markdown from './Markdown';
import ResumeBlock from './ResumeBlock';
import StepList from './StepList';
import ThinkingBlock from './ThinkingBlock';

const NO_CHOICES: Record<string, boolean> = {};

type Thinking = { open: Record<string, boolean>; onOpenChange: (id: string, open: boolean) => void };

function UserBubble({ text, dense, pending }: { text: string; dense: boolean; pending?: string }) {
    return (
        <Box
            title={pending}
            data-pending={pending ? 'true' : undefined}
            sx={{
                opacity: pending ? 0.6 : 1,
                alignSelf: 'flex-end',
                maxWidth: dense ? '88%' : '74%',
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
    );
}

function AgentBlock({
    item,
    dense,
    thinking,
}: {
    item: Extract<TranscriptItem, { kind: 'agent' }>;
    dense: boolean;
    thinking: Thinking;
}) {
    return (
        <Box sx={{ display: 'flex', minWidth: 0 }}>
            <Box sx={{ flex: 1, minWidth: 0, fontSize: dense ? 13.5 : 14.5, lineHeight: 1.6 }}>
                {item.parts.map((p, i) => {
                    if (p.type === 'text') {
                        return (
                            <Box key={i} sx={{ mb: 1 }}>
                                <Markdown text={p.text} dense={dense} />
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

    if (stream.loading && items.length === 0) {
        return (
            <Box sx={{ display: 'grid', placeItems: 'center', py: 4 }}>
                <CircularProgress size={24} />
            </Box>
        );
    }

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: dense ? 1.5 : 1.75 }}>
            {items.length === 0 && !hasLive && !pending && resumes.length === 0 && (
                <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
                    No messages yet. Describe what you want to do.
                </Typography>
            )}
            {items.map((it, i) => (
                <Fragment key={it.key}>
                    {it.kind === 'user' ? (
                        <UserBubble text={it.text} dense={dense} />
                    ) : it.kind === 'notice' ? (
                        <Notice text={it.text} label={it.label} />
                    ) : (
                        <AgentBlock item={it} dense={dense} thinking={thinking} />
                    )}
                    {placed.after.get(i)?.map((r) => <ResumeBlock key={`resume-${r.id}`} resume={r} />)}
                </Fragment>
            ))}
            {pending && (
                <UserBubble
                    text={pending.text}
                    dense={dense}
                    pending={resuming ? 'Goes to the agent once the chat has resumed' : 'Sending …'}
                />
            )}
            {placed.end.map((r) => (
                <ResumeBlock key={`resume-${r.id}`} resume={r} />
            ))}
            {hasLive && (
                <AgentBlock item={{ kind: 'agent', key: 'live', parts: liveP }} dense={dense} thinking={thinking} />
            )}
            {(chat?.running || pending) && !hasLive && !resuming && (
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
