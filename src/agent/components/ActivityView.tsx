// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';

import {
    activityFigures,
    activityQuery,
    activityRows,
    formatDuration,
    mergePages,
    OUTCOME_FILTERS,
    Period,
    PERIOD_PHRASE,
    PERIODS,
} from '../activity';
import { AgentApiError, agentApi } from '../api';
import { Effect } from '../format';
import type { ActivityOutcome, ActivityPage, Approval } from '../types';
import ActivityTable from './ActivityTable';
import EffectChip from './EffectChip';
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
    { effect: 'read', text: 'GET' },
    { effect: 'write', text: 'POST, PUT, PATCH' },
    { effect: 'compute', text: 'training start' },
    { effect: 'irreversible', text: 'DELETE' },
];

/**
 * Activity of the agent across all of the user's chats: key figures of the period and every platform call with its
 * effect, result and duration. Everything comes from the gateway's GET /activity in pages of PAGE_SIZE; the figures
 * cover the whole period, the table the pages loaded so far.
 */
export default function ActivityView({ refreshKey }: { refreshKey: number }) {
    const [period, setPeriod] = useState<Period>('7d');
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
        setLoading(true);
        setError(undefined);
        try {
            const [p, approvals] = await Promise.all([
                agentApi.activity(activityQuery({ period, outcome })),
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
    }, [period, outcome]);

    useEffect(() => {
        void load();
    }, [load, refreshKey]);

    const loadMore = async () => {
        if (!page?.next_before) return;
        const gen = generation.current;
        setLoadingMore(true);
        try {
            const next = await agentApi.activity(activityQuery({ period, outcome, before: page.next_before }));
            if (gen === generation.current) setPage((prev) => (prev ? mergePages(prev, next) : next));
        } catch (e) {
            if (gen === generation.current) setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoadingMore(false);
        }
    };

    const rows = useMemo(() => (page ? activityRows(page) : []), [page]);
    const f = page ? activityFigures(page) : undefined;
    const when = PERIOD_PHRASE[period];
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
                    value={outcome}
                    displayEmpty
                    onChange={(e) => setOutcome(e.target.value as ActivityOutcome | '')}
                    inputProps={{ 'aria-label': 'Result' }}
                    sx={{ minWidth: 200, fontSize: 14 }}
                >
                    {OUTCOME_FILTERS.map((o) => (
                        <MenuItem key={o.value || 'all'} value={o.value} sx={{ fontSize: 14 }}>
                            {o.label}
                        </MenuItem>
                    ))}
                </Select>
                {loading && <CircularProgress size={16} sx={{ ml: 'auto' }} />}
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 2 }}>
                <Kpi
                    value={dash(f?.total)}
                    label={`platform calls ${when}`}
                    hint={f ? `in ${f.chats} ${f.chats === 1 ? 'chat' : 'chats'}` : undefined}
                />
                <Kpi value={dash(f?.runs)} label={`agent runs ${when}`} />
                <Kpi value={pending.length} label="waiting for approval" highlight={pending.length > 0} />
                <Kpi value={dash(f?.blocked)} label={`blocked by the delegation ${when}`} />
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
            {error && <Alert severity="warning">{error}</Alert>}
            {page && (
                <ActivityTable
                    rows={rows}
                    emptyText={
                        outcome
                            ? `No platform calls with this result ${when}.`
                            : period === 'all'
                            ? 'The agent has not called the platform yet.'
                            : `The agent has not called the platform ${when}.`
                    }
                />
            )}
            {page && rows.length > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                        {outcome
                            ? `Shows ${rows.length} ${rows.length === 1 ? 'call' : 'calls'} with this result.`
                            : `Shows ${rows.length} of ${f?.total ?? rows.length} ${
                                  f?.total === 1 ? 'call' : 'calls'
                              }.`}
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
