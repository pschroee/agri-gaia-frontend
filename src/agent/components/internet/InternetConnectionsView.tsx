// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Link from '@mui/material/Link';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import BlockIcon from '@mui/icons-material/Block';
import CheckIcon from '@mui/icons-material/Check';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

import { activityChatName } from '../../activity';
import { formatClock, isToday } from '../../format';
import { type ConnectionFilter, type GrantBrief, useConnections } from '../../internet';
import {
    connectionData,
    connectionResult,
    connectionsSummaryText,
    connectionTarget,
    grantChip,
    NO_BLOCKED_TEXT,
    NO_CONNECTIONS_TEXT,
    originText,
    showMoreText,
    unlistedText,
    WARNING_AREA_COLOR,
    WARNING_TEXT_COLOR,
} from '../../internetView';
import type { Connection, ConnectionsPage } from '../../internet';
import { agentColors, MONO } from '../tokens';

/** Time of a connection: the date when it is not from today, the clock with seconds. */
export function connectionTime(iso: string): string {
    return `${isToday(iso) ? '' : `${new Date(iso).toLocaleDateString('en-GB')} `}${formatClock(iso, true)}`;
}

/** Target column (A12): an ecosystem chip for packages, the name in monospace, the detail line below. */
export function TargetCell({ c }: { c: Connection }) {
    const t = connectionTarget(c);
    return (
        <Box sx={{ minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                {t.chip && (
                    <Chip
                        size="small"
                        variant="outlined"
                        label={t.chip}
                        sx={{ height: 18, fontSize: 11, borderRadius: '4px', color: 'text.secondary' }}
                    />
                )}
                <Typography sx={{ fontFamily: MONO, fontSize: '12.5px !important', overflowWrap: 'anywhere' }}>
                    {t.name}
                </Typography>
            </Box>
            {t.detail && (
                <Typography noWrap title={t.detail} sx={{ fontSize: 12, color: 'text.secondary' }}>
                    {t.detail}
                </Typography>
            )}
        </Box>
    );
}

/** Result column: "allowed", or "blocked · not in the list"; the reason falls back to the code in words. */
export function ResultCell({ c }: { c: Connection }) {
    const r = connectionResult(c);
    return (
        <Box
            data-testid="connection-result"
            sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                fontSize: 13,
                color: r.blocked ? agentColors.red : agentColors.ok,
            }}
        >
            {r.blocked ? <BlockIcon sx={{ fontSize: 16 }} /> : <CheckIcon sx={{ fontSize: 16 }} />}
            <span>{r.word}</span>
            {r.reason && <Box component="span" sx={{ color: 'text.secondary' }}>{`· ${r.reason}`}</Box>}
        </Box>
    );
}

/** The chip of an approval: its name, outlined; full access in the warning colour. */
export function ApprovalChip({ brief, onClick }: { brief: GrantBrief | undefined; onClick?: () => void }) {
    const label = grantChip(brief);
    if (!brief || !label) return <Typography sx={{ color: 'text.disabled', fontSize: 13 }}>–</Typography>;
    const full = brief.kind === 'full';
    return (
        <Chip
            size="small"
            variant="outlined"
            label={label.toUpperCase()}
            onClick={onClick}
            sx={{
                height: 20,
                fontSize: 11,
                letterSpacing: 0.5,
                borderRadius: '4px',
                color: full ? WARNING_TEXT_COLOR : agentColors.green,
                borderColor: full ? WARNING_AREA_COLOR : agentColors.greenLine,
                bgcolor: full ? '#fff3e0' : agentColors.greenTint,
            }}
        />
    );
}

/** The "Show N more" button of a connection list; nothing when the rest is empty. */
export function ShowMore({
    page,
    hasMore,
    loading,
    onMore,
}: {
    page: ConnectionsPage;
    hasMore: boolean;
    loading: boolean;
    onMore: () => void;
}) {
    const text = showMoreText(page.total, page.connections.length);
    if (!hasMore || !text) return null;
    return (
        <Button
            size="small"
            onClick={onMore}
            disabled={loading}
            endIcon={<ExpandMoreIcon />}
            sx={{ alignSelf: 'flex-start', mt: 1 }}
        >
            {loading ? 'Loading …' : text.toUpperCase()}
        </Button>
    );
}

/**
 * The connections through the web proxy across the user's chats (Activity › Internet connections, issue #175): a summary
 * line over the whole filter, the table with Time, Chat, From, Target, Data, Result and Approval, collapsed rows ("214
 * requests"), the line for the data of a full access that no listed connection accounts for, and "Show N more".
 */
export default function InternetConnectionsView({
    filter,
    onShowBlocked,
    onOpenGrant,
}: {
    filter: ConnectionFilter;
    /** The click on the blocked figure of the summary: narrows the table to the blocked ones. */
    onShowBlocked?: () => void;
    /** The click on an Approval chip: opens the access row of this grant. */
    onOpenGrant?: (grantId: number) => void;
}) {
    const h = useConnections(filter);
    const { page } = h;
    const s = page.summary;
    // Data of a full access is no connection of the web proxy: it is not listed, and it is not blocked data either.
    const unlisted = !filter.result && !filter.origin ? page.unlisted : [];
    const empty = !h.loading && page.connections.length === 0 && unlisted.length === 0;

    const summary = connectionsSummaryText(s);
    const cut = summary.lastIndexOf(' · ');
    const head = s.blocked > 0 && cut >= 0 ? summary.slice(0, cut + 3) : summary;

    return (
        <Box data-testid="agent-connections" sx={{ display: 'grid', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 14, minHeight: 24 }}>
                <span data-testid="connections-summary">{head}</span>
                {s.blocked > 0 && (
                    <Link
                        component="button"
                        type="button"
                        underline="hover"
                        onClick={onShowBlocked}
                        disabled={!onShowBlocked}
                        aria-label={`${s.blocked} blocked, show only these`}
                        sx={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 0.5,
                            color: agentColors.red,
                            fontWeight: 500,
                            fontSize: 14,
                        }}
                    >
                        <BlockIcon sx={{ fontSize: 16 }} />
                        {`${s.blocked} blocked`}
                    </Link>
                )}
                {h.loading && <CircularProgress size={14} sx={{ ml: 1 }} />}
            </Box>
            {h.error && <Alert severity="warning">{h.error}</Alert>}
            {empty ? (
                <Typography data-testid="connections-empty" sx={{ color: 'text.secondary', fontSize: 14, py: 3 }}>
                    {filter.result === 'blocked' ? NO_BLOCKED_TEXT : NO_CONNECTIONS_TEXT}
                </Typography>
            ) : (
                <Box sx={{ overflowX: 'auto' }}>
                    <Table size="small" sx={{ '& td, & th': { fontSize: 13 } }}>
                        <TableHead>
                            <TableRow>
                                {['Time', 'Chat', 'From', 'Target', 'Data', 'Result', 'Approval'].map((t) => (
                                    <TableCell key={t} sx={{ fontWeight: 500, fontSize: '14px !important' }}>
                                        {t}
                                    </TableCell>
                                ))}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {page.connections.map((c) => (
                                <TableRow key={c.id} hover data-testid="connection-row">
                                    <TableCell sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                                        {connectionTime(c.started_at)}
                                    </TableCell>
                                    <TableCell>
                                        <Typography noWrap sx={{ fontSize: 13, maxWidth: 170 }}>
                                            {activityChatName(page.chats[c.chat_id] ?? { title: '', deleted: false })}
                                        </Typography>
                                    </TableCell>
                                    <TableCell sx={{ color: 'text.secondary' }}>{originText(c.origin)}</TableCell>
                                    <TableCell sx={{ minWidth: 200 }}>
                                        <TargetCell c={c} />
                                    </TableCell>
                                    <TableCell sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}>
                                        {connectionData(c)}
                                    </TableCell>
                                    <TableCell>
                                        <ResultCell c={c} />
                                    </TableCell>
                                    <TableCell>
                                        <ApprovalChip
                                            brief={c.grant_id ? page.grants[String(c.grant_id)] : undefined}
                                            onClick={
                                                c.grant_id && onOpenGrant
                                                    ? () => onOpenGrant(c.grant_id as number)
                                                    : undefined
                                            }
                                        />
                                    </TableCell>
                                </TableRow>
                            ))}
                            {unlisted.map((u) => (
                                <TableRow key={`unlisted-${u.grant_id}`} data-testid="connection-unlisted">
                                    <TableCell sx={{ color: 'text.disabled' }}>–</TableCell>
                                    <TableCell>
                                        <Typography noWrap sx={{ fontSize: 13, maxWidth: 170 }}>
                                            {activityChatName(page.chats[u.chat_id] ?? { title: '', deleted: false })}
                                        </Typography>
                                    </TableCell>
                                    <TableCell sx={{ color: 'text.secondary' }}>Any program</TableCell>
                                    <TableCell colSpan={3} sx={{ color: WARNING_TEXT_COLOR }}>
                                        {unlistedText(u)}
                                    </TableCell>
                                    <TableCell>
                                        <ApprovalChip
                                            brief={
                                                page.grants[String(u.grant_id)] ?? {
                                                    kind: 'full',
                                                    domains: [],
                                                    packages: [],
                                                }
                                            }
                                            onClick={onOpenGrant ? () => onOpenGrant(u.grant_id) : undefined}
                                        />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Box>
            )}
            <ShowMore page={page} hasMore={h.hasMore} loading={h.loading} onMore={() => void h.loadMore()} />
        </Box>
    );
}
