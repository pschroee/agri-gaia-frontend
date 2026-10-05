// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { useEffect, useMemo, useRef } from 'react';

import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

import { buildTranscript, TranscriptItem } from '../transcript';
import type { ChatStream } from '../useChatStream';
import Markdown from './Markdown';
import StepList from './StepList';
import { agentColors } from './tokens';

function Avatar() {
    return (
        <Box
            sx={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                flex: 'none',
                display: 'grid',
                placeItems: 'center',
                bgcolor: agentColors.greenTint,
                border: `1px solid ${agentColors.greenLine}`,
                color: agentColors.green,
            }}
        >
            <AutoAwesomeIcon sx={{ fontSize: 15 }} />
        </Box>
    );
}

function UserBubble({ text, dense }: { text: string; dense: boolean }) {
    return (
        <Box
            sx={{
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

function AgentBlock({ item, dense }: { item: Extract<TranscriptItem, { kind: 'agent' }>; dense: boolean }) {
    return (
        <Box sx={{ display: 'flex', gap: dense ? 1 : 1.5, minWidth: 0 }}>
            <Avatar />
            <Box sx={{ flex: 1, minWidth: 0, fontSize: dense ? 13.5 : 14.5, lineHeight: 1.6, pt: '3px' }}>
                {item.parts.map((p, i) =>
                    p.type === 'text' ? (
                        <Box key={i} sx={{ mb: 1 }}>
                            <Markdown text={p.text} dense={dense} />
                        </Box>
                    ) : (
                        <StepList key={i} steps={p.steps} />
                    ),
                )}
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
 * steps, notices of the gateway, the answer that is streaming right now and a working indicator.
 */
export default function Conversation({ stream, dense = false }: { stream: ChatStream; dense?: boolean }) {
    const { messages, approvals, socketCalls, executions, chat, liveText } = stream;
    const items = useMemo(
        () => buildTranscript(messages, { approvals, socketCalls, executions, running: !!chat?.running }),
        [messages, approvals, socketCalls, executions, chat?.running],
    );
    const end = useRef<HTMLDivElement>(null);

    // Keep the newest message in view: scroll the nearest scrolling container (not the page).
    useEffect(() => {
        let el = end.current?.parentElement ?? null;
        while (el && !/(auto|scroll)/.test(getComputedStyle(el).overflowY)) el = el.parentElement;
        if (el) el.scrollTop = el.scrollHeight;
    }, [items.length, liveText]);

    if (stream.loading && items.length === 0) {
        return (
            <Box sx={{ display: 'grid', placeItems: 'center', py: 4 }}>
                <CircularProgress size={24} />
            </Box>
        );
    }

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: dense ? 1.5 : 1.75 }}>
            {items.length === 0 && !liveText && (
                <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
                    No messages yet. Describe what you want to do.
                </Typography>
            )}
            {items.map((it) =>
                it.kind === 'user' ? (
                    <UserBubble key={it.key} text={it.text} dense={dense} />
                ) : it.kind === 'notice' ? (
                    <Notice key={it.key} text={it.text} label={it.label} />
                ) : (
                    <AgentBlock key={it.key} item={it} dense={dense} />
                ),
            )}
            {liveText && (
                <AgentBlock
                    item={{ kind: 'agent', key: 'live', parts: [{ type: 'text', text: liveText }] }}
                    dense={dense}
                />
            )}
            {chat?.running && !liveText && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary', fontSize: 12.5 }}>
                    <CircularProgress size={14} />
                    {chat.resuming ? 'Resuming the chat …' : 'The agent is working …'}
                </Box>
            )}
            <div ref={end} />
        </Box>
    );
}
