// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The overview of the tab "Experiments" (gateway issue #222): every run of the user across all chats in one table,
// running ones first, with how far they are; the chat is only a link. The state (filters, sort, page) lives in the
// address; the rows are polled (5 s while something runs, 30 s otherwise).

import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { RunPage, RunRow } from '../../experimentRuns';
import {
    OVERVIEW_DEFAULTS,
    OVERVIEW_KEYS,
    RUN_KINDS,
    RUN_STATES,
    STATE_LABEL,
    bestValue,
    durationCell,
    fetchExperimentRuns,
    liveDuration,
    planLinkText,
    runProgress,
    runSubline,
    runsQuery,
    startedText,
} from '../../experimentRuns';
import { chatTitle } from '../../format';
import { useNow } from '../../useNow';
import OverviewFilterBar from '../overview/OverviewFilterBar';
import type { FilterSelect } from '../overview/OverviewFilterBar';
import OverviewTable from '../overview/OverviewTable';
import type { OverviewColumn, OverviewSort } from '../overview/OverviewTable';
import ProgressCell from '../overview/ProgressCell';
import { isDefault, readOverview, writeOverview } from '../overview/overviewUrl';
import type { OverviewState } from '../overview/overviewUrl';
import { useLivePolling } from '../overview/useLivePolling';
import { agentColors, MONO } from '../tokens';
import RunStateCell from './RunStateCell';
import { usePlanDialog } from './usePlanDialog';

type Props = {
    onOpenRun: (row: RunRow) => void;
    onOpenChat: (chatId: string) => void;
};

const isActive = (d: RunPage | undefined): boolean => (d?.counts.running ?? 0) + (d?.counts.waiting ?? 0) > 0;

/** "2 running · 1 waiting for your approval · 57 runs", with the running part in green. */
function Summary({ page }: { page: RunPage }) {
    const running = page.counts.running ?? 0;
    const waiting = page.counts.waiting ?? 0;
    if (page.total === 0 && running === 0 && waiting === 0) return null;
    const parts: React.ReactNode[] = [];
    if (running > 0)
        parts.push(
            <Box key="r" component="span" sx={{ color: agentColors.green, fontWeight: 500 }}>
                {running} running
            </Box>,
        );
    if (waiting > 0) parts.push(<span key="w">{waiting} waiting for your approval</span>);
    if (page.total > 0) parts.push(<span key="t">{page.total} run{page.total === 1 ? '' : 's'}</span>);
    return (
        <>
            {parts.map((p, i) => (
                <span key={i}>
                    {i > 0 && ' · '}
                    {p}
                </span>
            ))}
        </>
    );
}

export default function ExperimentsOverview({ onOpenRun, onOpenChat }: Props) {
    const [params, setParams] = useSearchParams();
    const state = useMemo(() => readOverview(params, OVERVIEW_KEYS, OVERVIEW_DEFAULTS), [params]);
    const stateKey = JSON.stringify(state);
    const stateRef = useRef(state);
    stateRef.current = state;

    const poll = useLivePolling<RunPage>((signal) => fetchExperimentRuns(runsQuery(stateRef.current, new Date()), signal), {
        key: stateKey,
        active: isActive,
    });
    const page = poll.data;
    const anyRunning = (page?.counts.running ?? 0) > 0;
    const now = useNow(anyRunning, 1000);
    const { openPlan, dialog: planDialog } = usePlanDialog(onOpenChat);

    const update = (patch: Partial<OverviewState>, resetPage = true) => {
        const next: OverviewState = { ...state, ...patch, page: resetPage ? 0 : patch.page ?? state.page };
        setParams(writeOverview(params, next, OVERVIEW_DEFAULTS), { replace: true });
    };
    const reset = () => update({ ...OVERVIEW_DEFAULTS, filters: { ...OVERVIEW_DEFAULTS.filters } });

    // A page that no longer exists (runs ended or left the filter meanwhile) goes back to the first one.
    useEffect(() => {
        if (page && page.runs.length === 0 && page.total > 0 && state.page > 0) update({ page: 0 });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page?.total, page?.runs.length]);

    const selects: FilterSelect[] = [
        {
            id: 'status',
            label: 'Status',
            value: state.filters.status,
            options: [
                { value: '', label: 'All states' },
                ...RUN_STATES.map((s) => ({ value: s, label: STATE_LABEL[s], count: page?.counts[s] ?? 0 })),
            ],
        },
        {
            id: 'kind',
            label: 'Kind',
            value: state.filters.kind,
            options: [
                { value: '', label: 'All kinds' },
                ...RUN_KINDS.map((k) => ({ value: k, label: { training_search: 'Training searches', training_run: 'Training runs', notebook_run: 'Notebook runs' }[k] })),
            ],
        },
        {
            id: 'in_chat',
            label: 'Chat',
            value: state.filters.in_chat,
            minWidth: 240,
            options: [
                { value: '', label: 'All chats' },
                ...(page?.chats ?? []).map((c) => ({ value: c.id, label: chatTitle(c), count: c.runs })),
                ...(state.filters.in_chat && !page?.chats.some((c) => c.id === state.filters.in_chat)
                    ? [{ value: state.filters.in_chat, label: 'Selected chat' }]
                    : []),
            ],
        },
    ];

    // Widths and thresholds of #241: at 694 px (1 024 with the side nav open) Status, Run and Progress remain.
    const columns: OverviewColumn<RunRow>[] = [
        { id: 'state', label: 'Status', width: 130, sortable: true, render: (r) => <RunStateCell state={r.state} /> },
        {
            id: 'title',
            label: 'Run',
            sortable: true,
            render: (r) => (
                <Box sx={{ minWidth: 0 }}>
                    <Typography noWrap title={r.title} sx={{ fontSize: 14, fontWeight: 500 }}>
                        {r.title}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline', minWidth: 0 }}>
                        <Typography noWrap title={runSubline(r)} sx={{ fontSize: 12, color: 'text.secondary', flex: '1 1 auto', minWidth: 0 }}>
                            {runSubline(r)}
                        </Typography>
                        {r.plan_id && (
                            <Link
                                component="button"
                                type="button"
                                underline="hover"
                                data-testid="run-plan-link"
                                aria-label={`Show plan of ${r.title}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    openPlan(r.chat_id, r.plan_id as string, r.chat_title);
                                }}
                                sx={{ fontSize: 12, color: agentColors.green, flex: 'none', whiteSpace: 'nowrap' }}
                            >
                                {planLinkText(r)}
                            </Link>
                        )}
                    </Box>
                </Box>
            ),
        },
        { id: 'progress', label: 'Progress', width: 190, render: (r, n) => <ProgressCell {...runProgress(r, n)} /> },
        {
            id: 'best',
            label: 'Best value',
            width: 110,
            hideBelow: 760,
            align: 'right',
            render: (r) => {
                const best = bestValue(r);
                if (!best) return <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>–</Typography>;
                return (
                    <Tooltip title={best.title ?? ''} placement="top">
                        <Box data-testid="run-best" sx={{ textAlign: 'right', minWidth: 0 }}>
                            <Typography noWrap sx={{ fontFamily: MONO, fontSize: 13, fontWeight: 500 }}>
                                {best.value}
                            </Typography>
                            <Typography noWrap sx={{ fontSize: 11, color: 'text.secondary' }}>
                                {best.metric}
                            </Typography>
                        </Box>
                    </Tooltip>
                );
            },
        },
        { id: 'started', label: 'Started', width: 110, hideBelow: 1100, sortable: true, defaultOrder: 'desc', render: (r, n) => <Typography noWrap sx={{ fontSize: 14 }}>{startedText(r.started_at, n)}</Typography> },
        {
            id: 'duration',
            label: 'Duration',
            width: 110,
            hideBelow: 1000,
            align: 'right',
            sortable: true,
            defaultOrder: 'desc',
            render: (r, n) => <Typography noWrap sx={{ fontSize: 14 }}>{durationCell(liveDuration(r, poll.fetchedAt, n))}</Typography>,
        },
        {
            id: 'chat',
            label: 'Chat',
            width: 160,
            hideBelow: 900,
            sortable: true,
            render: (r) => (
                <Link
                    component="button"
                    type="button"
                    underline="hover"
                    title={r.chat_title}
                    onClick={(e) => {
                        e.stopPropagation();
                        onOpenChat(r.chat_id);
                    }}
                    sx={{ fontSize: 14, color: agentColors.green, maxWidth: '100%', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}
                >
                    {chatTitle({ title: r.chat_title })}
                </Link>
            ),
        },
    ];

    const filtered = !isDefault({ ...OVERVIEW_DEFAULTS, filters: state.filters, period: state.period }, OVERVIEW_DEFAULTS);
    const empty = filtered ? (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }} data-testid="overview-empty">
            <ScienceOutlinedIcon sx={{ fontSize: 36, color: 'text.disabled' }} />
            <Typography sx={{ fontWeight: 500, mt: 1 }}>No runs match these filters.</Typography>
            <Button variant="outlined" size="small" sx={{ mt: 2 }} onClick={reset}>
                Reset filters
            </Button>
        </Paper>
    ) : (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }} data-testid="overview-empty">
            <ScienceOutlinedIcon sx={{ fontSize: 36, color: 'text.disabled' }} />
            <Typography sx={{ fontWeight: 500, mt: 1 }}>No experiments yet</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Training searches, training runs and notebook runs the agent starts in any of your chats appear here.
            </Typography>
        </Paper>
    );

    return (
        <Box data-testid="experiments-overview" sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'minmax(0, 1fr)' }}>
            {planDialog}
            <OverviewFilterBar
                period={state.period}
                onPeriod={(period) => update({ period })}
                selects={selects}
                onSelect={(id, value) => update({ filters: { ...state.filters, [id]: value } })}
                showReset={!isDefault(state, OVERVIEW_DEFAULTS)}
                onReset={reset}
                status={{ refreshing: poll.refreshing, live: isActive(page), fetchedAt: poll.fetchedAt, failed: poll.failed }}
            />
            {page && (
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 2, flexWrap: 'wrap', fontSize: 13, color: 'text.secondary' }} data-testid="overview-summary">
                    <Box>
                        <Summary page={page} />
                    </Box>
                    {!state.sort && page.total > 0 && (
                        <Typography sx={{ fontSize: 12, color: agentColors.muted, ml: 'auto' }}>Running first, then newest</Typography>
                    )}
                </Box>
            )}
            <OverviewTable<RunRow>
                columns={columns}
                rows={page?.runs ?? []}
                rowKey={(r) => `${r.chat_id}/${r.id}`}
                rowLabel={(r) => r.title}
                rowTone={(r) => (r.state === 'running' ? 'active' : r.state === 'waiting' ? 'attention' : undefined)}
                rowData={(r) => ({ id: r.id, kind: r.kind, state: r.state })}
                onOpen={onOpenRun}
                sort={state.sort}
                onSort={(sort: OverviewSort) => update({ sort })}
                page={state.page}
                pageSize={state.size}
                total={page?.total ?? 0}
                onPage={(p, size) => update({ page: p, size }, false)}
                loading={poll.loading}
                error={poll.error && !page ? `Could not load the experiments: ${poll.error}` : undefined}
                onRetry={poll.reload}
                empty={empty}
                now={now}
                ariaLabel="Runs of all chats"
            />
        </Box>
    );
}
