// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';

import {
    accessSummaryOf,
    activityFigures,
    activityParams,
    activityQuery,
    activityRows,
    connectionFilterOf,
    formatDuration,
    internetActivityParams,
    isInternetKind,
    KIND_FILTERS,
    KindFilter,
    mergePages,
    OUTCOME_FILTERS,
    Period,
    PERIOD_PHRASE,
    PERIODS,
    shownText,
} from '../activity';
import { AgentApiError, agentApi } from '../api';
import { Effect } from '../format';
import type { ActivityOutcome, ActivityPage, Approval } from '../types';
import { useConnections } from '../internet';
import ActivityTable from './ActivityTable';
import EffectChip from './EffectChip';
import InternetAccessView from './internet/InternetAccessView';
import InternetConnectionsView from './internet/InternetConnectionsView';
import { agentColors } from './tokens';

export function Kpi({
    value,
    label,
    highlight,
    hint,
}: {
    value: number | string;
    label: string;
    highlight?: boolean;
    /** Smaller second line, e.g. what a figure is based on. */
    hint?: string;
}) {
    return (
        <Box
            sx={{
                border: 1,
                borderColor: highlight ? agentColors.amberLine : 'divider',
                bgcolor: highlight ? agentColors.amberTint : '#fff',
                borderRadius: 1,
                px: 2,
                py: 1.75,
            }}
        >
            <Typography
                sx={{ fontSize: 26, lineHeight: 1.2, color: highlight ? agentColors.amberText : 'text.primary' }}
            >
                {value}
            </Typography>
            <Typography sx={{ fontSize: 13, color: highlight ? agentColors.amberText : 'text.secondary', mt: 0.5 }}>
                {label}
            </Typography>
            {hint && <Typography sx={{ fontSize: 12, color: 'text.disabled', mt: 0.25 }}>{hint}</Typography>}
        </Box>
    );
}

const LEGEND: { effect: Effect; text: string }[] = [
    { effect: 'read', text: 'reads only, runs without asking' },
    { effect: 'write', text: 'changes data, needs your approval' },
    { effect: 'compute', text: 'uses compute time (training), needs your approval' },
    { effect: 'irreversible', text: 'cannot be undone, always needs your approval' },
];

/**
 * Activity of the agent across all of the user's chats: key figures of the period and every platform call with its
 * effect, result and duration, plus the internet access (requests, ends and switches; gateway issues #37 and #175) and,
 * as its own view, the connections through the web proxy. Everything comes from the gateway's GET /activity in pages of PAGE_SIZE; the figures
 * cover the platform calls of the whole period (never the internet switches), the table the pages loaded so far.
 */
export default function ActivityView({ refreshKey }: { refreshKey: number }) {
    const [search] = useSearchParams();
    // A link from a step detail carries the chat and the tool call of one step (issue L6/#123). It is read once when
    // the view opens; "Show all" drops it here — the URL keeps it, so a reload shows the same entry again.
    const [focus, setFocus] = useState(() => activityParams(search.toString()));
    // The linked call lies where the step ran, which may be outside the default period; the link looks for one entry,
    // so it starts at all of them.
    const [period, setPeriod] = useState<Period>(() => (focus.call || focus.chat ? 'all' : '7d'));
    // A link into the internet views (issue #175): `?kind=internet|connections&result=blocked&chat=<id>`.
    const [internetLink] = useState(() => internetActivityParams(search.toString()));
    const [kind, setKind] = useState<KindFilter>(() => internetLink.kind ?? 'all');
    const [connResult, setConnResult] = useState<'' | 'allowed' | 'blocked'>(() => internetLink.result ?? '');
    const [connOrigin, setConnOrigin] = useState<'' | 'pi' | 'exec' | 'pkg'>('');
    // The grant a click on an Approval chip of the connection table opens in the Internet access view.
    const [grantFocus, setGrantFocus] = useState<number>();
    const [outcome, setOutcome] = useState<ActivityOutcome | ''>('');
    const [page, setPage] = useState<ActivityPage>();
    const [pending, setPending] = useState<Approval[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string>();
    const [unsupported, setUnsupported] = useState(false);
    // Only the newest request may set the state (a slow answer for an old filter is dropped).
    const generation = useRef(0);

    const load = useCallback(async () => {
        const gen = ++generation.current;
        // The connections have their own route and their own table (InternetConnectionsView).
        if (kind === 'connections') {
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(undefined);
        try {
            const [p, approvals] = await Promise.all([
                agentApi.activity(activityQuery({ period, kind, outcome, chat: focus.chat, call: focus.call })),
                agentApi.pendingApprovals().catch(() => [] as Approval[]),
            ]);
            if (gen !== generation.current) return;
            setPage(p);
            setUnsupported(false);
            setPending(Array.isArray(approvals) ? approvals : []);
        } catch (e) {
            if (gen !== generation.current) return;
            setPage(undefined);
            if (e instanceof AgentApiError && e.status === 404) setUnsupported(true);
            else setError(e instanceof Error ? e.message : String(e));
        } finally {
            if (gen === generation.current) setLoading(false);
        }
    }, [period, kind, outcome, focus]);

    useEffect(() => {
        void load();
    }, [load, refreshKey]);

    const loadMore = async () => {
        if (!page?.next_before) return;
        const gen = generation.current;
        setLoadingMore(true);
        try {
            const next = await agentApi.activity(
                activityQuery({ period, kind, outcome, chat: focus.chat, call: focus.call, before: page.next_before }),
            );
            if (gen === generation.current) setPage((prev) => (prev ? mergePages(prev, next) : next));
        } catch (e) {
            if (gen === generation.current) setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoadingMore(false);
        }
    };

    const rows = useMemo(() => (page ? activityRows(page, outcome ? 'platform' : kind) : []), [page, kind, outcome]);
    const f = page ? activityFigures(page) : undefined;
    const when = PERIOD_PHRASE[period];
    const internetView = isInternetKind(kind);
    // Blocked connections of the period for the summary line of the Internet access view (A16).
    const blockedConns = useConnections(
        connectionFilterOf({ period, chat: focus.chat, result: 'blocked', limit: 1 }),
        kind === 'internet',
    );
    const dash = (v: number | undefined) => (f ? v ?? 0 : '–');

    if (unsupported) {
        return (
            <Alert severity="info">
                This version of the agent gateway does not report activity across chats (GET /activity). Update the
                gateway to see the platform calls here.
            </Alert>
        );
    }

    return (
        <Box data-testid="agent-activity" sx={{ display: 'grid', gap: 3 }}>
            {(focus.call || focus.chat) && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Typography data-testid="agent-activity-focus" sx={{ fontSize: 12, color: 'text.secondary' }}>
                        {kind === 'connections'
                            ? 'Opened from the chat: shows the internet connections of this chat.'
                            : kind === 'internet'
                            ? 'Opened from the chat: shows the internet access of this chat.'
                            : focus.call
                            ? 'Opened from a step: shows the platform calls of this step.'
                            : 'Opened from a step: shows the platform calls of this chat.'}
                    </Typography>
                    <Link
                        component="button"
                        type="button"
                        underline="hover"
                        onClick={() => setFocus({})}
                        sx={{ fontSize: 12, color: agentColors.green }}
                    >
                        Show all
                    </Link>
                </Box>
            )}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                <ToggleButtonGroup
                    size="small"
                    exclusive
                    value={period}
                    onChange={(_, v: Period | null) => v && setPeriod(v)}
                    aria-label="Period"
                >
                    {PERIODS.map((p) => (
                        <ToggleButton key={p.value} value={p.value} sx={{ px: 1.75, textTransform: 'none' }}>
                            {p.label}
                        </ToggleButton>
                    ))}
                </ToggleButtonGroup>
                <Select
                    size="small"
                    value={kind}
                    onChange={(e) => {
                        const k = e.target.value as KindFilter;
                        setKind(k);
                        // Results of platform calls do not apply to the internet views.
                        if (isInternetKind(k)) setOutcome('');
                    }}
                    inputProps={{ 'aria-label': 'Show' }}
                    sx={{ minWidth: 180, fontSize: 14 }}
                >
                    {KIND_FILTERS.map((k) => (
                        <MenuItem key={k.value} value={k.value} sx={{ fontSize: 14 }}>
                            {k.label}
                        </MenuItem>
                    ))}
                </Select>
                <Select
                    size="small"
                    value={outcome}
                    displayEmpty
                    disabled={internetView}
                    onChange={(e) => setOutcome(e.target.value as ActivityOutcome | '')}
                    inputProps={{ 'aria-label': 'Result of platform calls' }}
                    sx={{ minWidth: 200, fontSize: 14 }}
                >
                    {OUTCOME_FILTERS.map((o) => (
                        <MenuItem key={o.value || 'all'} value={o.value} sx={{ fontSize: 14 }}>
                            {o.label}
                        </MenuItem>
                    ))}
                </Select>
                {kind === 'connections' && (
                    <>
                        <Select
                            size="small"
                            value={connResult}
                            displayEmpty
                            onChange={(e) => setConnResult(e.target.value as '' | 'allowed' | 'blocked')}
                            inputProps={{ 'aria-label': 'Result of connections' }}
                            sx={{ minWidth: 170, fontSize: 14 }}
                        >
                            <MenuItem value="" sx={{ fontSize: 14 }}>
                                All results
                            </MenuItem>
                            <MenuItem value="allowed" sx={{ fontSize: 14 }}>
                                allowed
                            </MenuItem>
                            <MenuItem value="blocked" sx={{ fontSize: 14 }}>
                                blocked
                            </MenuItem>
                        </Select>
                        <Select
                            size="small"
                            value={connOrigin}
                            displayEmpty
                            renderValue={(v) =>
                                `From: ${{ '': 'all', pi: 'web tools', exec: 'commands', pkg: 'packages' }[v]}`
                            }
                            onChange={(e) => setConnOrigin(e.target.value as '' | 'pi' | 'exec' | 'pkg')}
                            inputProps={{ 'aria-label': 'From' }}
                            sx={{ minWidth: 170, fontSize: 14 }}
                        >
                            <MenuItem value="" sx={{ fontSize: 14 }}>
                                From: all
                            </MenuItem>
                            <MenuItem value="pi" sx={{ fontSize: 14 }}>
                                Web tools
                            </MenuItem>
                            <MenuItem value="exec" sx={{ fontSize: 14 }}>
                                Commands
                            </MenuItem>
                            <MenuItem value="pkg" sx={{ fontSize: 14 }}>
                                Packages
                            </MenuItem>
                        </Select>
                    </>
                )}
                {loading && <CircularProgress size={16} sx={{ ml: 'auto' }} />}
            </Box>
            {!internetView && (
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 2 }}>
                    <Kpi
                        value={dash(f?.total)}
                        label={`platform calls ${when}`}
                        hint={f ? `in ${f.chats} ${f.chats === 1 ? 'chat' : 'chats'}` : undefined}
                    />
                    <Kpi value={dash(f?.runs)} label={`agent runs ${when}`} />
                    <Kpi value={pending.length} label="waiting for approval" highlight={pending.length > 0} />
                    <Kpi value={dash(f?.blocked)} label={`blocked by the gateway ${when}`} />
                    <Kpi value={dash(f?.rejected)} label={`rejected by you ${when}`} />
                    <Kpi
                        value={f ? formatDuration(f.avg) : '–'}
                        label="average duration"
                        hint={
                            f && f.measured > 0
                                ? `95 % within ${formatDuration(f.p95)} · ${f.measured} measured`
                                : 'none measured'
                        }
                    />
                </Box>
            )}
            {!internetView && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                    <Typography
                        sx={{ fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: 'text.disabled' }}
                    >
                        Effect
                    </Typography>
                    {LEGEND.map((l) => (
                        <Box key={l.effect} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                            <EffectChip effect={l.effect} />
                            <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>{l.text}</Typography>
                        </Box>
                    ))}
                </Box>
            )}
            {error && kind !== 'connections' && <Alert severity="warning">{error}</Alert>}
            {kind === 'connections' && (
                <InternetConnectionsView
                    filter={connectionFilterOf({ period, chat: focus.chat, result: connResult, origin: connOrigin })}
                    onShowBlocked={() => setConnResult('blocked')}
                    onOpenGrant={(id) => {
                        setGrantFocus(id);
                        setKind('internet');
                    }}
                />
            )}
            {kind === 'internet' && page && (
                <InternetAccessView
                    rows={rows}
                    focusGrant={grantFocus}
                    summary={accessSummaryOf(
                        rows.map((r) => r.call),
                        blockedConns.page.summary.blocked,
                    )}
                    emptyText={`No internet access ${when}.`}
                />
            )}
            {kind !== 'connections' && kind !== 'internet' && page && (
                <ActivityTable
                    rows={rows}
                    focus={focus}
                    emptyText={
                        focus.call
                            ? 'This step made no call the activity logs. Older entries of it may have been deleted with their chat.'
                            : outcome
                            ? `No platform calls with this result ${when}.`
                            : kind === 'all'
                            ? `No platform calls or internet access ${when}.`
                            : period === 'all'
                            ? 'The agent has not called the platform yet.'
                            : `The agent has not called the platform ${when}.`
                    }
                />
            )}
            {page && rows.length > 0 && kind !== 'connections' && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                        {shownText(rows, f?.total, kind, outcome)}
                    </Typography>
                    {page.next_before ? (
                        <Button size="small" onClick={() => void loadMore()} disabled={loadingMore}>
                            {loadingMore ? 'Loading …' : 'Load more'}
                        </Button>
                    ) : null}
                </Box>
            )}
        </Box>
    );
}
