// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { Fragment, useEffect, useRef, useState } from 'react';

import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import BlockIcon from '@mui/icons-material/Block';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import SearchIcon from '@mui/icons-material/Search';

import {
    ActivityRow,
    activityChatName,
    formatDuration,
    internetEvent,
    isSystemRead,
    kindOf,
    viaLabel,
} from '../activity';
import {
    formatClock,
    isToday,
    Outcome,
    OUTCOME_LABEL,
    outcomeOf,
} from '../format';
import { callEffect } from '../effect';
import type { ActivityCall } from '../types';
import EffectChip from './EffectChip';
import { AccessCallCell, AccessDetails, AccessResultCell } from './internet/InternetAccessView';
import { agentColors, MONO } from './tokens';
import { agentApi } from '../api';
import { needsLlmLoad, sentCallText, sentChatText, sentToModel } from '../sentToModel';
import type { LlmLoad } from '../sentToModel';

/** Outcome as the gateway classified it; older entries without it from the result text. */
const outcomeOfCall = (c: ActivityCall): Outcome => c.outcome ?? outcomeOf(c.result);

function OutcomeCell({ outcome }: { outcome: Outcome }) {
    const style: Record<Outcome, { color: string; icon: JSX.Element }> = {
        ok: { color: agentColors.ok, icon: <CheckIcon sx={{ fontSize: 16 }} /> },
        error: { color: agentColors.red, icon: <ErrorOutlineIcon sx={{ fontSize: 16 }} /> },
        blocked: { color: agentColors.red, icon: <BlockIcon sx={{ fontSize: 16 }} /> },
        rejected: { color: agentColors.red, icon: <CloseIcon sx={{ fontSize: 16 }} /> },
        refused: { color: agentColors.red, icon: <BlockIcon sx={{ fontSize: 16 }} /> },
        logged: { color: agentColors.amberText, icon: <ErrorOutlineIcon sx={{ fontSize: 16 }} /> },
    };
    const s = style[outcome];
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: s.color, fontSize: 14 }}>
            {s.icon}
            {OUTCOME_LABEL[outcome]}
        </Box>
    );
}

/**
 * The gateway's own read for the summary of an approval (gateway issue L2/#119): the system read the platform, the
 * agent did not. What was read is the delivered detail.
 */
function SystemReadCell({ call }: { call: ActivityRow['call'] }) {
    return (
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }} data-testid="activity-summary-read">
            <SearchIcon sx={{ fontSize: 18, color: 'text.secondary', mt: '1px', flex: 'none' }} />
            <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: 14 }}>Read for an approval summary</Typography>
                <Typography
                    sx={{
                        fontFamily: MONO,
                        fontSize: '12.5px !important',
                        color: 'text.secondary',
                        overflowWrap: 'anywhere',
                    }}
                >
                    {call.detail}
                </Typography>
            </Box>
        </Box>
    );
}

/** "Sent to model": the model call that asked for this platform call, and the chat's totals (gateway issue #69). */
function SentToModelText({ sent, toolCallId }: { sent: LlmLoad | undefined; toolCallId?: string }) {
    if (sent === undefined || sent === 'loading') return <Box>Loading …</Box>;
    if (sent === 'error') return <Box>Could not load the model calls of this chat.</Box>;
    if (sent.length === 0) return <Box>No model calls recorded for this chat.</Box>;
    const { call, chat } = sentToModel(sent, toolCallId);
    return (
        <>
            <Box>
                {call
                    ? `This call: ${sentCallText(call)}`
                    : 'This call: the model call that asked for it is not among the recorded ones.'}
            </Box>
            <Box sx={{ color: 'text.secondary' }}>{`Chat in total: ${sentChatText(chat)}`}</Box>
        </>
    );
}

function CallLog({ row, sent }: { row: ActivityRow; sent?: LlmLoad }) {
    const { call, chat, log } = row;
    const lines: { at: string; text: string; tone?: 'warn' | 'bad' }[] = [];
    for (const c of log) {
        const o = outcomeOfCall(c);
        const took = c.duration_ms !== undefined ? `  (${formatDuration(c.duration_ms)})` : '';
        lines.push({
            at: c.created_at,
            text: `${c.op.padEnd(10)} ${c.detail}  →  ${c.result}${took}`,
            tone: o === 'ok' ? undefined : o === 'logged' ? 'warn' : 'bad',
        });
    }
    for (const c of log) {
        const approval = c.approval;
        if (!approval) continue;
        lines.push({ at: approval.created_at, text: `approval requested  ${c.detail}`, tone: 'warn' });
        if (approval.decided_at) {
            lines.push({
                at: approval.decided_at,
                text: `approval ${approval.state}`,
                tone: approval.state === 'approved' ? undefined : 'bad',
            });
        }
    }
    lines.sort((a, b) => a.at.localeCompare(b.at));

    return (
        <Box sx={{ py: 2, pl: 4.5, pr: 2, bgcolor: '#f4f7f5' }}>
            <Box
                sx={{
                    bgcolor: '#fff',
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 1,
                    p: 1.5,
                    fontFamily: MONO,
                    fontSize: 12.5,
                    lineHeight: 1.75,
                    overflowX: 'auto',
                }}
            >
                {lines.map((l, i) => (
                    <Box key={i} sx={{ display: 'flex', gap: 2, whiteSpace: 'pre' }}>
                        <Box component="span" sx={{ color: 'text.disabled' }}>
                            {formatClock(l.at, true)}
                        </Box>
                        <Box
                            component="span"
                            sx={{
                                color:
                                    l.tone === 'bad'
                                        ? agentColors.red
                                        : l.tone === 'warn'
                                        ? agentColors.amberText
                                        : 'inherit',
                            }}
                        >
                            {l.text}
                        </Box>
                    </Box>
                ))}
            </Box>
            <Box
                component="dl"
                sx={{
                    display: 'grid',
                    gridTemplateColumns: '180px 1fr',
                    gap: '6px 16px',
                    m: 0,
                    mt: 2,
                    fontSize: 13,
                    '& dt': { color: 'text.secondary' },
                    '& dd': { m: 0 },
                }}
            >
                <dt>Chat</dt>
                <dd>{chat.title || chat.id}</dd>
                <dt>Connection</dt>
                <dd>
                    {viaLabel(call.via)}
                    {chat.model && ` · model ${chat.model}`}
                </dd>
                <dt>Duration</dt>
                <dd>
                    {call.duration_ms !== undefined
                        ? `${formatDuration(call.duration_ms)} round trip to the platform`
                        : 'not measured (the call did not go out, or it predates the measurement)'}
                </dd>
                <dt>Sent to model</dt>
                <dd data-testid="activity-sent-to-model" style={{ overflowWrap: 'anywhere' }}>
                    <SentToModelText sent={sent} toolCallId={call.tool_call_id} />
                </dd>
                {call.tool_call_id && (
                    <>
                        <dt>Tool call</dt>
                        <dd style={{ fontFamily: MONO, fontSize: 12 }}>{call.tool_call_id}</dd>
                    </>
                )}
            </Box>
        </Box>
    );
}

/**
 * Platform calls of the agent with effect, result and duration, and internet switches; a row expands to its call
 * log. A row named by a link from a step detail (focus, issue L6/#123) opens by itself and is scrolled into view.
 */
export default function ActivityTable({
    rows,
    emptyText = 'The agent has not called the platform yet.',
    focus,
}: {
    rows: ActivityRow[];
    emptyText?: string;
    /** Chat and tool call a step detail linked to; without a tool call nothing opens by itself. */
    focus?: { chat?: string; call?: string };
}) {
    const [open, setOpen] = useState<number>();
    // Model calls per chat, loaded when a platform row of the chat is first expanded (gateway issue #69).
    const [sent, setSent] = useState<Record<string, LlmLoad>>({});

    const loadSent = (chatId: string) => {
        if (!needsLlmLoad(sent[chatId])) return;
        setSent((s) => ({ ...s, [chatId]: 'loading' }));
        agentApi.llmCalls(chatId).then(
            (calls) => setSent((s) => ({ ...s, [chatId]: calls })),
            () => setSent((s) => ({ ...s, [chatId]: 'error' })),
        );
    };

    // The row of the linked tool call: opened without a click. `open` stays undefined until the user clicks, so the
    // link keeps working while the table reloads; 0 means the user closed everything.
    const focusRow = focus?.call
        ? rows.find(
              (r) => r.call.tool_call_id === focus.call && (!focus.chat || (r.call.chat_id ?? '') === focus.chat),
          ) ?? rows.find((r) => r.call.tool_call_id === focus.call)
        : undefined;
    const openId = open ?? focusRow?.call.id;
    const rowRef = useRef<HTMLTableRowElement | null>(null);
    const scrolled = useRef<number>();
    useEffect(() => {
        if (focusRow === undefined) return;
        // Scrolling happens once: a later refresh of the same link must not pull the view up again.
        if (scrolled.current === focusRow.call.id) return;
        scrolled.current = focusRow.call.id;
        if (kindOf(focusRow.call) !== 'internet') loadSent(focusRow.chat.id);
        rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, [focusRow?.call.id]);

    if (rows.length === 0) {
        return <Typography sx={{ color: 'text.secondary', fontSize: 14, py: 3 }}>{emptyText}</Typography>;
    }

    return (
        // Narrow screens scroll the table, not the page.
        <Box sx={{ overflowX: 'auto' }}>
            <Table size="medium" sx={{ '& td, & th': { fontSize: 14 } }}>
                <TableHead>
                    <TableRow>
                        <TableCell sx={{ width: 40, p: 0 }} />
                        <TableCell sx={{ fontWeight: 500 }}>Time</TableCell>
                        <TableCell sx={{ fontWeight: 500 }}>Chat</TableCell>
                        <TableCell sx={{ fontWeight: 500 }}>Call</TableCell>
                        <TableCell sx={{ fontWeight: 500 }}>Via</TableCell>
                        <TableCell sx={{ fontWeight: 500 }}>Effect</TableCell>
                        <TableCell sx={{ fontWeight: 500 }}>Result</TableCell>
                        <TableCell sx={{ fontWeight: 500 }} align="right">
                            Duration
                        </TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {rows.map((row) => {
                        const { call, chat } = row;
                        const internet = kindOf(call) === 'internet' ? internetEvent(call) : undefined;
                        const systemRead = isSystemRead(call);
                        const effect = internet || systemRead ? undefined : callEffect(call);
                        const expanded = openId === call.id;
                        return (
                            <Fragment key={call.id}>
                                <TableRow
                                    hover
                                    ref={expanded ? rowRef : null}
                                    onClick={() => {
                                        setOpen(expanded ? 0 : call.id);
                                        if (!expanded && !internet) loadSent(chat.id);
                                    }}
                                    sx={{
                                        cursor: 'pointer',
                                        '& > td': { borderBottom: expanded ? 0 : undefined },
                                        ...(expanded && {
                                            bgcolor: '#f4f7f5',
                                            '& > td:first-of-type': { boxShadow: `inset 3px 0 0 ${agentColors.green}` },
                                        }),
                                    }}
                                >
                                    <TableCell sx={{ p: 0, pl: 0.5 }}>
                                        <IconButton size="small" aria-label={expanded ? 'Collapse' : 'Expand'}>
                                            {expanded ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                                        </IconButton>
                                    </TableCell>
                                    <TableCell sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                                        {isToday(call.created_at)
                                            ? ''
                                            : `${new Date(call.created_at).toLocaleDateString('en-GB')} `}
                                        {formatClock(call.created_at)}
                                    </TableCell>
                                    <TableCell>
                                        <Typography
                                            noWrap
                                            sx={{
                                                fontSize: 14,
                                                maxWidth: 180,
                                                ...(chat.deleted && { color: 'text.secondary', fontStyle: 'italic' }),
                                            }}
                                            title={chat.title}
                                        >
                                            {activityChatName(chat)}
                                        </Typography>
                                    </TableCell>
                                    {internet ? (
                                        <TableCell sx={{ minWidth: 160 }} data-testid="activity-internet">
                                            <AccessCallCell event={internet} />
                                        </TableCell>
                                    ) : systemRead ? (
                                        <TableCell sx={{ minWidth: 160 }}>
                                            <SystemReadCell call={call} />
                                        </TableCell>
                                    ) : (
                                        <TableCell
                                            sx={{
                                                fontFamily: MONO,
                                                fontSize: '13px !important',
                                                overflowWrap: 'anywhere',
                                                minWidth: 160,
                                            }}
                                        >
                                            {call.detail}
                                        </TableCell>
                                    )}
                                    <TableCell sx={{ color: 'text.secondary' }}>
                                        {internet ? internet.via : viaLabel(call.via)}
                                    </TableCell>
                                    <TableCell data-effect={effect}>{effect && <EffectChip effect={effect} />}</TableCell>
                                    <TableCell>
                                        {internet ? (
                                            <AccessResultCell event={internet} />
                                        ) : (
                                            <OutcomeCell outcome={outcomeOfCall(call)} />
                                        )}
                                    </TableCell>
                                    <TableCell
                                        align="right"
                                        sx={{
                                            whiteSpace: 'nowrap',
                                            fontVariantNumeric: 'tabular-nums',
                                            color: call.duration_ms === undefined ? 'text.disabled' : undefined,
                                        }}
                                    >
                                        {formatDuration(call.duration_ms)}
                                    </TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell colSpan={8} sx={{ p: 0, borderBottom: expanded ? undefined : 0 }}>
                                        <Collapse in={expanded} timeout="auto" unmountOnExit>
                                            {internet ? <AccessDetails row={row} /> : <CallLog row={row} sent={sent[chat.id]} />}
                                        </Collapse>
                                    </TableCell>
                                </TableRow>
                            </Fragment>
                        );
                    })}
                </TableBody>
            </Table>
        </Box>
    );
}
