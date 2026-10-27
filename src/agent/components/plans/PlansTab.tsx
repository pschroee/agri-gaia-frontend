// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The tab "Plans" of /ai-agent (gateway issue #223): the plans of all chats of the user in one table, running ones
// first. A click on a row opens the plan dialog (reading only); the chat is a link. Data and stream come from
// `usePlanOverview`; the words from `plansOverview`. The table and the filter bar are the shared overview blocks.

import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

import { useAgent } from '../../AgentContext';
import { chatTitle, formatRelativeDay } from '../../format';
import { agentTitle, pendingIdsOf, stepCount } from '../../plan';
import {
    MODE_OPTIONS,
    PLANS_EMPTY,
    PLANS_EMPTY_FILTERED,
    STATUS_GROUPS,
    TITLE_HINT,
    budgetCell,
    currentStepCell,
    durationCell,
    planStart,
    progressColor,
    progressOf,
    rowTone,
    statusNote,
} from '../../plansOverview';
import type { PlanListItem } from '../../plansOverview';
import { useNow } from '../../useNow';
import { usePlanOverview } from '../../usePlanOverview';
import PlanDialog from '../plan/PlanDialog';
import PlanStatusCell from './PlanStatusCell';
import OverviewFilterBar from '../overview/OverviewFilterBar';
import OverviewTable, { PAGE_SIZES } from '../overview/OverviewTable';
import type { OverviewColumn } from '../overview/OverviewTable';
import { readOverview, writeOverview } from '../overview/overviewUrl';
import type { OverviewState } from '../overview/overviewUrl';
import { agentColors } from '../tokens';

const FILTER_KEYS = ['status', 'mode', 'chat'];
const DEFAULTS: OverviewState = {
    period: 'all',
    filters: { status: '', mode: '', chat: '' },
    sort: undefined,
    page: 0,
    size: PAGE_SIZES[0],
};

const NOTE_COLOR = { muted: 'text.secondary', amber: agentColors.amberText, red: agentColors.red } as const;

const line = (sx = {}) => ({ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', ...sx });

export default function PlansTab({ onOpenChat }: { onOpenChat: (chatId: string) => void }) {
    const { chats, pendingApprovals } = useAgent();
    const [params, setParams] = useSearchParams();
    const state = useMemo(() => readOverview(params, FILTER_KEYS, DEFAULTS), [params]);
    const { status, mode, chat } = state.filters;
    const overview = usePlanOverview({ status, mode, chat, page: state.page, rowsPerPage: state.size });
    const now = useNow(true, 10000);
    const pending = useMemo(() => pendingIdsOf(pendingApprovals), [pendingApprovals]);
    const [opened, setOpened] = useState<string>();

    const write = (s: OverviewState) => setParams(writeOverview(params, s, DEFAULTS), { replace: false });
    const setFilter = (id: string, value: string) =>
        write({ ...state, filters: { ...state.filters, [id]: value }, page: 0 });
    const filtered = status !== '' || mode !== '' || chat !== '';
    const reset = () => write({ ...state, filters: { status: '', mode: '', chat: '' }, page: 0 });

    const rows = overview.page?.plans ?? [];
    const openedPlan = rows.find((p) => p.id === opened);

    // Widths and thresholds of #241: at 694 px (1 024 with the side nav open) Plan, Status, Progress and Current step remain.
    const columns: OverviewColumn<PlanListItem>[] = [
        {
            id: 'plan',
            label: (
                <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                    Plan
                    <Tooltip title={TITLE_HINT}>
                        <InfoOutlinedIcon sx={{ fontSize: 14, color: 'text.secondary' }} aria-label={TITLE_HINT} />
                    </Tooltip>
                </Box>
            ),
            render: (p) => {
                const title = agentTitle(p);
                return (
                    <Box sx={{ minWidth: 0 }}>
                        <Typography title={title || undefined} sx={line({ fontSize: 14, fontWeight: 500 })}>
                            {title || `Plan · ${stepCount(p.steps.length)}`}
                        </Typography>
                        <Typography sx={line({ fontSize: 12, color: 'text.secondary' })}>
                            {`${p.mode === 'autonomous' ? 'Autonomous' : 'Interactive'} · ${stepCount(p.steps.length)}`}
                        </Typography>
                    </Box>
                );
            },
        },
        {
            id: 'status',
            label: 'Status',
            // wide enough for "Needs approval" with its symbol (issue #250)
            width: 150,
            render: (p) => {
                const note = statusNote(p, pending);
                return (
                    <Box sx={{ minWidth: 0 }}>
                        <PlanStatusCell plan={p} pending={pending} />
                        {note && (
                            <Typography
                                title={note.text}
                                sx={{
                                    // the note wraps to a second line instead of being cut (issue #250)
                                    fontSize: 12,
                                    mt: 0.25,
                                    color: NOTE_COLOR[note.tone],
                                    display: '-webkit-box',
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden',
                                    overflowWrap: 'anywhere',
                                }}
                            >
                                {note.text}
                            </Typography>
                        )}
                    </Box>
                );
            },
        },
        {
            id: 'progress',
            label: 'Progress',
            // the figure never gives way, the bar does (#235)
            width: 150,
            render: (p) => {
                const g = progressOf(p);
                return (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <LinearProgress
                            variant="determinate"
                            value={g.value}
                            color={progressColor(p)}
                            aria-label={`${g.done} of ${g.total} steps done`}
                            sx={{ flex: '1 1 auto', minWidth: 40, maxWidth: 70, height: 6, borderRadius: 3 }}
                        />
                        <Typography
                            data-testid="plan-progress-text"
                            sx={{
                                fontSize: 13,
                                fontVariantNumeric: 'tabular-nums',
                                flex: 'none',
                                whiteSpace: 'nowrap',
                            }}
                        >{`${g.done}/${g.total}`}</Typography>
                    </Box>
                );
            },
        },
        {
            id: 'step',
            label: 'Current step',
            render: (p) => {
                const c = currentStepCell(p, pending);
                return (
                    <Box sx={{ minWidth: 0 }}>
                        <Typography title={c.title} sx={line({ fontSize: 13.5 })}>
                            {c.title}
                        </Typography>
                        {c.sub && (
                            <Typography title={c.sub} sx={line({ fontSize: 12, color: NOTE_COLOR[c.tone] })}>
                                {c.sub}
                            </Typography>
                        )}
                    </Box>
                );
            },
        },
        {
            id: 'started',
            label: 'Started',
            width: 120,
            hideBelow: 1240,
            render: (p) => {
                const at = planStart(p);
                return at === undefined ? (
                    '–'
                ) : (
                    <Typography title={new Date(at).toLocaleString()} sx={line({ fontSize: 13 })}>
                        {formatRelativeDay(new Date(at).toISOString(), new Date(now))}
                    </Typography>
                );
            },
        },
        {
            id: 'duration',
            label: 'Duration',
            // "waiting 50 min" in one line
            width: 124,
            hideBelow: 940,
            render: (p) => (
                <Typography sx={line({ fontSize: 13, fontVariantNumeric: 'tabular-nums' })}>
                    {durationCell(p, now)}
                </Typography>
            ),
        },
        {
            id: 'budget',
            label: 'Budget',
            width: 150,
            // the budget is in the dialog; the chat column gets the room first (issue #250)
            hideBelow: 1600,
            render: (p) => {
                const b = budgetCell(p, now);
                if (!b) return '–';
                return (
                    <Box sx={{ minWidth: 0 }}>
                        <Typography sx={line({ fontSize: 13, fontVariantNumeric: 'tabular-nums' })}>
                            {b.main || '–'}
                        </Typography>
                        {b.sub && (
                            <Typography
                                sx={line({ fontSize: 12, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' })}
                            >
                                {b.sub}
                            </Typography>
                        )}
                    </Box>
                );
            },
        },
        {
            id: 'chat',
            label: 'Chat',
            width: 200,
            hideBelow: 800,
            render: (p) => {
                const title = p.chat_title?.trim() || chatTitle(chats.find((c) => c.id === p.chat_id));
                return (
                    <Link
                        component="button"
                        type="button"
                        underline="hover"
                        aria-label={`Open chat ${title}`}
                        title={title}
                        onClick={(e) => {
                            e.stopPropagation();
                            onOpenChat(p.chat_id);
                        }}
                        onKeyDown={(e) => e.stopPropagation()}
                        sx={{
                            fontSize: 13.5,
                            maxWidth: '100%',
                            textAlign: 'left',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            wordBreak: 'break-word',
                        }}
                    >
                        {title}
                    </Link>
                );
            },
        },
    ];

    const empty = filtered ? (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }} data-testid="plans-empty">
            <Typography color="text.secondary">{PLANS_EMPTY_FILTERED}</Typography>
            <Button size="small" onClick={reset} sx={{ mt: 1 }}>
                Reset filters
            </Button>
        </Paper>
    ) : (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }} data-testid="plans-empty">
            <Typography color="text.secondary">{PLANS_EMPTY}</Typography>
        </Paper>
    );

    const chatOptions = [
        { value: '', label: 'All chats' },
        ...chats.map((c) => ({ value: c.id, label: chatTitle(c) })),
    ];
    const running = overview.page?.running ?? 0;

    return (
        <Box data-testid="plans-tab" sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'minmax(0, 1fr)' }}>
            <OverviewFilterBar
                selects={[
                    {
                        id: 'status',
                        label: 'Status',
                        value: status,
                        minWidth: 180,
                        options: STATUS_GROUPS.map((g) => ({ value: g.value, label: g.label })),
                    },
                    { id: 'mode', label: 'Mode', value: mode, minWidth: 160, options: MODE_OPTIONS },
                    { id: 'chat', label: 'Chat', value: chat, minWidth: 260, options: chatOptions },
                ]}
                onSelect={setFilter}
                showReset={filtered}
                onReset={reset}
                status={{
                    refreshing: false,
                    live: overview.live === 'live',
                    fetchedAt: overview.updatedAt,
                    failed: overview.live === 'reconnecting' && overview.updatedAt !== undefined,
                }}
            />
            {overview.page && (
                <Typography
                    data-testid="plans-running"
                    sx={{ fontSize: 12.5, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}
                >
                    {`${running} running`}
                </Typography>
            )}
            <OverviewTable<PlanListItem>
                testId="plans-table"
                ariaLabel="Plans"
                columns={columns}
                rows={rows}
                rowKey={(p) => p.id}
                rowLabel={(p) => agentTitle(p) || `plan with ${stepCount(p.steps.length)}`}
                rowTone={(p) => rowTone(p, pending)}
                rowData={(p) => ({ 'plan-id': p.id, 'plan-state': p.state })}
                onOpen={(p) => setOpened(p.id)}
                sort={undefined}
                onSort={() => undefined}
                page={state.page}
                pageSize={state.size}
                total={overview.page?.total ?? 0}
                onPage={(page, size) => write({ ...state, page, size })}
                loading={overview.loading}
                error={overview.error ? `Could not load the plans: ${overview.error}` : undefined}
                onRetry={overview.reload}
                empty={empty}
                now={now}
            />
            {openedPlan && (
                <PlanDialog
                    open
                    onClose={() => setOpened(undefined)}
                    chatId={openedPlan.chat_id}
                    plans={[openedPlan]}
                    planId={openedPlan.id}
                    pending={pending}
                    chatTitle={openedPlan.chat_title}
                    onOpenChat={(plan) => onOpenChat(plan.chat_id)}
                />
            )}
        </Box>
    );
}
