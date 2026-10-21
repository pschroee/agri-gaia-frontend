// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { Fragment, useEffect, useRef, useState } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import DataUsageIcon from '@mui/icons-material/DataUsage';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import PublicIcon from '@mui/icons-material/Public';
import PublicOffIcon from '@mui/icons-material/PublicOff';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import TimerOffIcon from '@mui/icons-material/TimerOff';

import {
    activityChatName,
    allowedLine,
    type ActivityRow,
    grantLimitsText,
    internetEvent,
    type InternetEvent,
    type InternetTone,
    type ResultIcon,
} from '../../activity';
import { formatClock, isToday } from '../../format';
import { useConnections } from '../../internet';
import {
    connectionsSummaryText,
    endInfo,
    formatData,
    KIND_CHIP,
    NO_CONNECTIONS_TEXT,
    reasonText,
    unlistedText,
    WARNING_AREA_COLOR,
    WARNING_TEXT_COLOR,
} from '../../internetView';
import { agentColors, MONO } from '../tokens';
import { connectionTime, ResultCell, TargetCell } from './InternetConnectionsView';

const TONE_COLOR: Record<InternetTone, string> = {
    ok: agentColors.ok,
    bad: agentColors.red,
    warn: agentColors.amberText,
    muted: agentColors.muted,
};

const RESULT_ICON: Record<ResultIcon, JSX.Element | null> = {
    Check: <CheckIcon sx={{ fontSize: 16 }} />,
    Close: <CloseIcon sx={{ fontSize: 16 }} />,
    HourglassEmpty: <HourglassEmptyIcon sx={{ fontSize: 16 }} />,
    TaskAlt: <TaskAltIcon sx={{ fontSize: 16 }} />,
    TimerOff: <TimerOffIcon sx={{ fontSize: 16 }} />,
    DataUsage: <DataUsageIcon sx={{ fontSize: 16 }} />,
    PublicOff: <PublicOffIcon sx={{ fontSize: 16 }} />,
    ErrorOutline: <ErrorOutlineIcon sx={{ fontSize: 16 }} />,
    none: null,
};

/** Result column of an internet entry: symbol and word (A3, A10, A20). */
export function AccessResultCell({ event }: { event: InternetEvent }) {
    return (
        <Box
            data-testid="access-result"
            sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                color: TONE_COLOR[event.tone],
                fontSize: 14,
                whiteSpace: { xs: 'normal', lg: 'nowrap' },
            }}
        >
            {RESULT_ICON[event.resultIcon] ?? <Box component="span" sx={{ width: 16 }} />}
            {event.result}
        </Box>
    );
}

/** Call column of an internet entry: symbol and title, below the kind chip and the list (hosts, packages, …). */
export function AccessCallCell({ event }: { event: InternetEvent }) {
    const full = event.kind === 'full';
    const Icon = event.icon === 'PublicOff' ? PublicOffIcon : PublicIcon;
    return (
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            <Icon sx={{ fontSize: 18, color: full ? WARNING_AREA_COLOR : 'text.secondary', mt: '1px', flex: 'none' }} />
            <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: 14 }}>{event.title}</Typography>
                {event.kind && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, minWidth: 0 }}>
                        <Chip
                            size="small"
                            variant="outlined"
                            label={KIND_CHIP[event.kind]}
                            sx={{
                                height: 20,
                                fontSize: 11,
                                letterSpacing: 0.5,
                                borderRadius: '4px',
                                flex: 'none',
                                color: full ? WARNING_TEXT_COLOR : agentColors.green,
                                borderColor: full ? WARNING_AREA_COLOR : agentColors.greenLine,
                                bgcolor: full ? '#fff3e0' : agentColors.greenTint,
                            }}
                        />
                        {event.list && (
                            <Typography
                                noWrap
                                title={event.list}
                                sx={{ fontFamily: MONO, fontSize: '12px !important', color: 'text.secondary' }}
                            >
                                {event.list}
                            </Typography>
                        )}
                    </Box>
                )}
            </Box>
        </Box>
    );
}

/** Rows of the "Connections of this approval" table before "Show all". */
export const GRANT_CONNECTIONS_FOLD = 10;

/**
 * Details of an internet entry: time line (requested, approved, blocked, ended), chat, who acted, the agent's note, what
 * is allowed, the limits, the tool call and the connections of the approval. Mounted only while the row is open, so the
 * connections are read when the user looks.
 */
export function AccessDetails({ row }: { row: ActivityRow }) {
    const { call, chat } = row;
    const event = internetEvent(call);
    const g = call.grant;
    const [all, setAll] = useState(false);
    const conns = useConnections({ grant: g?.id, limit: all ? 200 : GRANT_CONNECTIONS_FOLD }, !!g);
    const page = conns.page;

    const lines: { at: string; text: string; tone?: InternetTone }[] = [];
    const ap = call.approval;
    if (ap) {
        lines.push({
            at: ap.created_at,
            text: `requested by ${event.by === 'Helper' ? 'a helper of the agent' : 'the agent'}`,
            tone: 'warn',
        });
        if (ap.decided_at) {
            lines.push({
                at: ap.decided_at,
                text:
                    ap.state === 'approved'
                        ? 'approved by you'
                        : ap.state === 'rejected'
                        ? 'rejected by you'
                        : `approval ${ap.state}`,
                tone: ap.state === 'approved' ? 'ok' : 'bad',
            });
        }
    }
    if (g?.started_at && !(ap?.decided_at && ap.decided_at === g.started_at)) {
        lines.push({ at: g.started_at, text: 'access started' });
    }
    const firstBlocked = [...page.connections].reverse().find((c) => !!c.denied || !!c.reason);
    if (firstBlocked) {
        const t = firstBlocked.package ?? firstBlocked.host;
        lines.push({
            at: firstBlocked.started_at,
            text: `blocked ${t} (${reasonText(firstBlocked.reason)})`,
            tone: 'bad',
        });
    }
    if (g?.ended_at) {
        const e = endInfo(g.ended_reason);
        lines.push({ at: g.ended_at, text: `ended: ${e.long} · ${formatData(g.bytes)}` });
    }
    if (lines.length === 0) {
        lines.push({
            at: call.created_at,
            text: `${event.title}  →  ${event.result}`,
            tone: event.tone === 'bad' ? 'bad' : undefined,
        });
    }
    lines.sort((a, b) => a.at.localeCompare(b.at));

    const by =
        event.by === 'You'
            ? 'You, with the internet switch'
            : event.by === 'System'
            ? 'The gateway, by itself'
            : `${event.by === 'Helper' ? 'A helper of the agent' : 'The agent'} · ${event.via}${
                  ap?.state === 'approved' ? ' · approved by you' : ap?.state === 'rejected' ? ' · rejected by you' : ''
              }`;
    const unlisted = page.unlisted.filter((u) => u.grant_id === g?.id);
    const rowSx = { display: 'grid', gridTemplateColumns: '196px minmax(0, 1fr)', gap: 1, fontSize: 13 } as const;

    return (
        <Box sx={{ py: 2, pl: 4.5, pr: 2, bgcolor: '#f4f7f5', display: 'grid', gap: 2 }} data-testid="access-details">
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
                }}
            >
                {lines.map((l, idx) => (
                    <Box key={idx} sx={{ display: 'flex', gap: 2 }}>
                        <Box component="span" sx={{ color: 'text.disabled', flex: 'none' }}>
                            {formatClock(l.at, true)}
                        </Box>
                        <Box
                            component="span"
                            sx={{ color: l.tone ? TONE_COLOR[l.tone] : 'inherit', overflowWrap: 'anywhere' }}
                        >
                            {l.text}
                        </Box>
                    </Box>
                ))}
            </Box>
            <Box sx={{ display: 'grid', gap: 1 }}>
                <Box sx={rowSx}>
                    <Box component="span" sx={{ color: 'text.secondary' }}>
                        Chat
                    </Box>
                    <span>{activityChatName(chat)}</span>
                </Box>
                <Box sx={rowSx}>
                    <Box component="span" sx={{ color: 'text.secondary' }}>
                        By
                    </Box>
                    <span>{by}</span>
                </Box>
                {event.reason && (
                    <Box sx={rowSx}>
                        <Box component="span" sx={{ color: WARNING_TEXT_COLOR, fontSize: 12 }}>
                            {"Agent's note – not verified"}
                        </Box>
                        <Box
                            component="span"
                            sx={{
                                fontStyle: 'italic',
                                borderLeft: '2px dashed',
                                borderColor: agentColors.amber,
                                pl: 1.25,
                                overflowWrap: 'anywhere',
                            }}
                        >
                            {event.reason}
                        </Box>
                    </Box>
                )}
                {g && (
                    <Box sx={rowSx}>
                        <Box component="span" sx={{ color: 'text.secondary' }}>
                            Allowed
                        </Box>
                        <Box component="span" sx={{ fontFamily: MONO, fontSize: '12.5px', overflowWrap: 'anywhere' }}>
                            {allowedLine(g)}
                        </Box>
                    </Box>
                )}
                {g && grantLimitsText(g) && (
                    <Box sx={rowSx}>
                        <Box component="span" sx={{ color: 'text.secondary' }}>
                            Limits
                        </Box>
                        <span>{grantLimitsText(g)}</span>
                    </Box>
                )}
                {call.tool_call_id && (
                    <Box sx={rowSx}>
                        <Box component="span" sx={{ color: 'text.secondary' }}>
                            Tool call
                        </Box>
                        <Box component="span" sx={{ fontFamily: MONO, fontSize: '12.5px', overflowWrap: 'anywhere' }}>
                            {call.tool_call_id}
                        </Box>
                    </Box>
                )}
            </Box>
            {g && (
                <Box data-testid="grant-connections">
                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, pb: 1 }}>
                        <Typography sx={{ fontSize: 14, fontWeight: 500 }}>Connections of this approval</Typography>
                        <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
                            {connectionsSummaryText(page.summary)}
                        </Typography>
                    </Box>
                    {page.connections.length === 0 && unlisted.length === 0 ? (
                        <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
                            {conns.loading ? 'Loading …' : NO_CONNECTIONS_TEXT}
                        </Typography>
                    ) : (
                        <Table size="small" sx={{ bgcolor: '#fff', '& td, & th': { fontSize: 13 } }}>
                            <TableHead>
                                <TableRow>
                                    {['Time', 'From', 'Target', 'Data', 'Result'].map((t) => (
                                        <TableCell
                                            key={t}
                                            sx={{
                                                fontWeight: 500,
                                                color: 'text.secondary',
                                                fontSize: '12px !important',
                                            }}
                                        >
                                            {t}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {page.connections.map((c) => (
                                    <TableRow key={c.id}>
                                        <TableCell
                                            sx={{ fontFamily: MONO, fontSize: '12px !important', whiteSpace: 'nowrap' }}
                                        >
                                            {connectionTime(c.started_at)}
                                        </TableCell>
                                        <TableCell>
                                            {c.origin === 'pkg'
                                                ? 'Packages'
                                                : c.origin === 'exec'
                                                ? 'Commands'
                                                : 'Web tools'}
                                        </TableCell>
                                        <TableCell sx={{ minWidth: 180 }}>
                                            <TargetCell c={c} />
                                        </TableCell>
                                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                                            {[
                                                c.bytes_down > 0 ? `↓ ${formatData(c.bytes_down)}` : '',
                                                c.bytes_up > 0 ? `↑ ${formatData(c.bytes_up)}` : '',
                                            ]
                                                .filter(Boolean)
                                                .join(' · ') || '–'}
                                        </TableCell>
                                        <TableCell>
                                            <ResultCell c={c} />
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {unlisted.map((u) => (
                                    <TableRow key={`u${u.grant_id}`}>
                                        <TableCell colSpan={5} sx={{ color: WARNING_TEXT_COLOR }}>
                                            {unlistedText(u)}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                    {!all && page.total > page.connections.length && (
                        <Button
                            size="small"
                            onClick={() => setAll(true)}
                            endIcon={<ExpandMoreIcon />}
                            sx={{ mt: 0.75 }}
                        >
                            {`SHOW ALL ${page.total}`}
                        </Button>
                    )}
                    {all && conns.hasMore && (
                        <Button
                            size="small"
                            onClick={() => void conns.loadMore()}
                            disabled={conns.loading}
                            sx={{ mt: 0.75 }}
                        >
                            Load more
                        </Button>
                    )}
                </Box>
            )}
        </Box>
    );
}

/**
 * Activity › Internet access (issue #175): one row per request, end or switch of the internet access, newest first —
 * Time, Chat, Call (symbol, title, kind chip and list), Via, Result, Data. A row opens to its details; `focusGrant`
 * (a click on an Approval chip of the connection table) opens the row of that grant and scrolls to it.
 */
export default function InternetAccessView({
    rows,
    emptyText,
    summary,
    focusGrant,
}: {
    rows: ActivityRow[];
    emptyText: string;
    /** "3 approvals · 2.6 GB · 4 blocked" (A16). */
    summary?: string;
    focusGrant?: number;
}) {
    const [open, setOpen] = useState<number>();
    const focusRow = focusGrant ? rows.find((r) => r.call.grant?.id === focusGrant) : undefined;
    const openId = open ?? focusRow?.call.id;
    const rowRef = useRef<HTMLTableRowElement | null>(null);
    const scrolled = useRef<number>();
    useEffect(() => {
        if (!focusRow || scrolled.current === focusRow.call.id) return;
        scrolled.current = focusRow.call.id;
        rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, [focusRow?.call.id]);

    return (
        <Box data-testid="agent-internet-access" sx={{ display: 'grid', gap: 2 }}>
            {summary && (
                <Typography data-testid="access-summary" sx={{ fontSize: 14 }}>
                    {summary}
                </Typography>
            )}
            {rows.length === 0 ? (
                <Typography sx={{ color: 'text.secondary', fontSize: 14, py: 3 }}>{emptyText}</Typography>
            ) : (
                <Box sx={{ overflowX: 'auto' }}>
                    <Table size="medium" sx={{ '& td, & th': { fontSize: 14 } }}>
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ width: 40, p: 0 }} />
                                {['Time', 'Chat', 'Call', 'Via', 'Result'].map((t) => (
                                    <TableCell key={t} sx={{ fontWeight: 500 }}>
                                        {t}
                                    </TableCell>
                                ))}
                                <TableCell sx={{ fontWeight: 500 }} align="right">
                                    Data
                                </TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {rows.map((row) => {
                                const { call, chat } = row;
                                const ev = internetEvent(call);
                                const expanded = openId === call.id;
                                return (
                                    <Fragment key={call.id}>
                                        <TableRow
                                            hover
                                            ref={expanded ? rowRef : null}
                                            data-testid="access-row"
                                            onClick={() => setOpen(expanded ? 0 : call.id)}
                                            sx={{
                                                cursor: 'pointer',
                                                '& > td': { borderBottom: expanded ? 0 : undefined },
                                                ...(expanded && {
                                                    bgcolor: '#f4f7f5',
                                                    '& > td:first-of-type': {
                                                        boxShadow: `inset 3px 0 0 ${agentColors.green}`,
                                                    },
                                                }),
                                            }}
                                        >
                                            <TableCell sx={{ p: 0, pl: 0.5 }}>
                                                <IconButton size="small" aria-label={expanded ? 'Collapse' : 'Expand'}>
                                                    {expanded ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                                                </IconButton>
                                            </TableCell>
                                            <TableCell
                                                sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}
                                            >
                                                {isToday(call.created_at)
                                                    ? ''
                                                    : `${new Date(call.created_at).toLocaleDateString('en-GB')} `}
                                                {formatClock(call.created_at)}
                                            </TableCell>
                                            <TableCell>
                                                <Typography
                                                    noWrap
                                                    title={chat.title}
                                                    sx={{
                                                        fontSize: 14,
                                                        maxWidth: 190,
                                                        ...(chat.deleted && {
                                                            color: 'text.secondary',
                                                            fontStyle: 'italic',
                                                        }),
                                                    }}
                                                >
                                                    {activityChatName(chat)}
                                                </Typography>
                                            </TableCell>
                                            <TableCell sx={{ minWidth: 220 }} data-testid="activity-internet">
                                                <AccessCallCell event={ev} />
                                            </TableCell>
                                            <TableCell sx={{ color: 'text.secondary' }}>{ev.via}</TableCell>
                                            <TableCell>
                                                <AccessResultCell event={ev} />
                                            </TableCell>
                                            <TableCell
                                                align="right"
                                                sx={{
                                                    whiteSpace: 'nowrap',
                                                    color: 'text.secondary',
                                                    fontVariantNumeric: 'tabular-nums',
                                                }}
                                            >
                                                {ev.data}
                                            </TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell
                                                colSpan={7}
                                                sx={{ p: 0, borderBottom: expanded ? undefined : 0 }}
                                            >
                                                <Collapse in={expanded} timeout="auto" unmountOnExit>
                                                    <AccessDetails row={row} />
                                                </Collapse>
                                            </TableCell>
                                        </TableRow>
                                    </Fragment>
                                );
                            })}
                        </TableBody>
                    </Table>
                </Box>
            )}
        </Box>
    );
}
