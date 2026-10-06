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

import { ActivityRow, formatDuration } from '../activity';
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
import type { ActivityCall } from '../types';
import EffectChip from './EffectChip';
import { agentColors, MONO } from './tokens';

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

function CallLog({ row }: { row: ActivityRow }) {
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
                    {call.via.toUpperCase()}
                    {chat.model && ` · model ${chat.model}`}
                </dd>
                <dt>Duration</dt>
                <dd>
                    {call.duration_ms !== undefined
                        ? `${formatDuration(call.duration_ms)} round trip to the platform`
                        : 'not measured (the call did not go out, or it predates the measurement)'}
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

/** Platform calls of the agent with effect, result and duration; a row expands to its call log. */
export default function ActivityTable({
    rows,
    emptyText = 'The agent has not called the platform yet.',
}: {
    rows: ActivityRow[];
    emptyText?: string;
}) {
    const [open, setOpen] = useState<number>();

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
                                    <TableCell>
                                        <Typography noWrap sx={{ fontSize: 14, maxWidth: 180 }} title={chat.title}>
                                            {chat.title || 'Untitled chat'}
                                        </Typography>
                                    </TableCell>
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
                                    <TableCell sx={{ textTransform: 'uppercase', color: 'text.secondary' }}>
                                        {call.via}
                                    </TableCell>
                                    <TableCell>{effect && <EffectChip effect={effect} />}</TableCell>
                                    <TableCell>
                                        <OutcomeCell outcome={outcomeOfCall(call)} />
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
                                            <CallLog row={row} />
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
