// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { Fragment, useState } from 'react';

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

import {
    effectOf,
    formatClock,
    isToday,
    Outcome,
    OUTCOME_LABEL,
    outcomeOf,
    splitCall,
    summarizeRules,
} from '../format';
import type { Approval, Chat, SocketCall } from '../types';
import EffectChip from './EffectChip';
import { agentColors, MONO } from './tokens';

/** One platform call of the agent, with the chat it belongs to. */
export type ActivityRow = { call: SocketCall; chat: Chat; log: SocketCall[]; approvals: Approval[] };

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

function CallLog({ row }: { row: ActivityRow }) {
    const { call, chat, log, approvals } = row;
    const approval = approvals.find(
        (a) => a.kind === 'platform_write' && a.tool_call_id && a.tool_call_id === call.tool_call_id,
    );
    const lines: { at: string; text: string; tone?: 'warn' | 'bad' }[] = [];
    for (const c of log) {
        const o = outcomeOf(c.result);
        lines.push({
            at: c.created_at,
            text: `${c.op.padEnd(10)} ${c.detail}  →  ${c.result}`,
            tone: o === 'ok' ? undefined : o === 'logged' ? 'warn' : 'bad',
        });
    }
    if (approval) {
        lines.push({ at: approval.created_at, text: `approval requested  ${approval.name}`, tone: 'warn' });
        if (approval.decided_at) {
            lines.push({
                at: approval.decided_at,
                text: `approval ${approval.state}`,
                tone: approval.state === 'approved' ? undefined : 'bad',
            });
        }
    }
    lines.sort((a, b) => a.at.localeCompare(b.at));
    const d = chat.delegation;

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
                    {call.via.toUpperCase()} · model {chat.model}
                </dd>
                <dt>Delegation</dt>
                <dd>{d ? summarizeRules(d.rules).join('; ') : 'none (writes need approval)'}</dd>
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

/** Platform calls of the agent with effect and result; a row expands to its call log. */
export default function ActivityTable({ rows }: { rows: ActivityRow[] }) {
    const [open, setOpen] = useState<number>();

    if (rows.length === 0) {
        return (
            <Typography sx={{ color: 'text.secondary', fontSize: 14, py: 3 }}>
                The agent has not called the platform yet.
            </Typography>
        );
    }

    return (
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
                </TableRow>
            </TableHead>
            <TableBody>
                {rows.map((row) => {
                    const { call, chat } = row;
                    const { method, path } = splitCall(call.detail);
                    const effect = effectOf(method, path);
                    const expanded = open === call.id;
                    return (
                        <Fragment key={call.id}>
                            <TableRow
                                hover
                                onClick={() => setOpen(expanded ? undefined : call.id)}
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
                                <TableCell sx={{ maxWidth: 220 }}>
                                    <Typography noWrap sx={{ fontSize: 14 }} title={chat.title}>
                                        {chat.title || 'Untitled chat'}
                                    </Typography>
                                </TableCell>
                                <TableCell
                                    sx={{ fontFamily: MONO, fontSize: '13px !important', overflowWrap: 'anywhere' }}
                                >
                                    {call.detail}
                                </TableCell>
                                <TableCell sx={{ textTransform: 'uppercase', color: 'text.secondary' }}>
                                    {call.via}
                                </TableCell>
                                <TableCell>{effect && <EffectChip effect={effect} />}</TableCell>
                                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                                    <OutcomeCell outcome={outcomeOf(call.result)} />
                                </TableCell>
                            </TableRow>
                            <TableRow>
                                <TableCell colSpan={7} sx={{ p: 0, borderBottom: expanded ? undefined : 0 }}>
                                    <Collapse in={expanded} timeout="auto" unmountOnExit>
                                        <CallLog row={row} />
                                    </Collapse>
                                </TableCell>
                            </TableRow>
                        </Fragment>
                    );
                })}
            </TableBody>
        </Table>
    );
}
