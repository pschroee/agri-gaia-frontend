// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The card of a training search in the chat (gateway issue #168, design "SearchCard"): the budget meters, the trial
// that runs (epoch, time left, curve, GPU), the user's controls and, after the end, the winner with the final test.
// It stands under the tool call that proposed the search (`search.tool_call_id`) and follows the stream. Everything
// on it is the gateway's data; the agent's own words are the note, marked as not verified.
//
// Panel and phone: the stop buttons become icon buttons, the budget grid is two by two, the hint is a field under
// the card. Dialogs are full screen below 600 px.

import { useMemo } from 'react';
import { Link as RouterLink, useInRouterContext } from 'react-router-dom';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import StarIcon from '@mui/icons-material/Star';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';

import { useAgentOptional } from '../../AgentContext';
import { mergeSeries, useTrialDetail } from '../../experiments';
import type { ExperimentsActions, ExperimentsState, Search, Trial } from '../../experiments';
import { formatClock } from '../../format';
import { logTailLines } from '../../searchView';
import {
    bestTrialOf,
    budgetMeters,
    directionText,
    durationText,
    endText,
    epochPercent,
    epochText,
    etaText,
    metricWords,
    nextIdx,
    openTrialOf,
    paramsLine,
    scoreText,
    searchView,
    testView,
    trialStateView,
    trialsOf,
    winnerOf,
} from '../../searchView';
import type { AssessCheck } from '../../types';
import { useNow } from '../../useNow';
import { AgentNote, LogBox, Meters, SearchStateChip, Spinner, TrialStateMark, WayTag } from './SearchParts';
import { SearchControls } from './SearchControls';
import { Sparkline } from './Sparkline';
import { ReconnectingHint, emptyState } from './TrialChartEmpty';
import { Technical } from '../PlanCard';
import { MONO } from '../tokens';

export type SearchLayout = 'panel' | 'page';

/** What a search card needs on top of the search: the chat's book, the controls, the checks and the layout. */
export type SearchEnv = {
    chatId?: string;
    experiments: ExperimentsState;
    actions: ExperimentsActions;
    /** The result checks of the chat: the final test of a search is one of them (`holdout.check_id`). */
    checks: AssessCheck[];
    layout: SearchLayout;
};

// "visually hidden" for the live region: out of sight, no space, no overflow of its box (#209)
const srOnly = {
    position: 'absolute',
    width: '1px',
    height: '1px',
    margin: '-1px',
    padding: 0,
    border: 0,
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    whiteSpace: 'nowrap',
} as const;

const wayLabel = (s: Search): string => (s.path === 'notebook' ? 'your notebook code' : 'platform template');

/** The anchor id of a card, for the chip and the popover to scroll to. */
export const searchCardId = (searchId: string): string => `agent-search-card-${searchId}`;

/** "Open in Experiments": selects the chat, closes the panel and goes to the tab. Without a router a plain label. */
export function OpenInExperiments({ chatId, searchId }: { chatId?: string; searchId?: string }) {
    const inRouter = useInRouterContext();
    const agent = useAgentOptional();
    const label = (
        <>
            Open in Experiments
            <ArrowForwardIcon sx={{ fontSize: 18, ml: 0.5 }} aria-hidden />
        </>
    );
    if (!inRouter) return <Button size="small">{label}</Button>;
    const to = `/ai-agent?tab=experiments${searchId ? `&search=${encodeURIComponent(searchId)}` : ''}`;
    return (
        <Button
            size="small"
            component={RouterLink}
            to={to}
            onClick={() => {
                if (chatId) agent?.selectChat(chatId);
                agent?.setPanelOpen(false);
            }}
        >
            {label}
        </Button>
    );
}

/** One fact under the epoch line: a small label and its value. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{label}</Typography>
            <Box sx={{ fontSize: 13, minWidth: 0, overflowWrap: 'anywhere' }}>{children}</Box>
        </Box>
    );
}

/** The trial that runs: parameters, epoch with the time left, the curve of the target metric, GPU and the best so far. */
function RunningTrial({ search, trial, list, env, now }: { search: Search; trial: Trial; list: Trial[]; env: SearchEnv; now: number }) {
    const stopping = !!env.experiments.stopping[trial.id];
    const { detail } = useTrialDetail(env.chatId, trial);
    const series = useMemo(() => mergeSeries(detail, env.experiments.progress[trial.id]), [detail, env.experiments.progress, trial.id]);
    const o = search.objective;
    const words = metricWords(o);
    const best = bestTrialOf(search, list);
    const view = trialStateView(trial, stopping);
    const pct = epochPercent(trial);
    const eta = etaText(trial.eta, now);
    const lastGpu = series.gpu[series.gpu.length - 1] ?? trial.gpu ?? undefined;
    const last = series.epochs.filter((e) => typeof e[o.metric] === 'number').pop();
    const spec = Object.keys(search.space ?? {});
    return (
        <Box data-testid="agent-search-trial" data-trial-id={trial.id} sx={{ display: 'flex', flexDirection: 'column', gap: 1, pt: 1.5, borderTop: 1, borderColor: 'divider', minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography sx={{ fontSize: 13, fontWeight: 500 }}>{`Trial ${trial.idx}`}</Typography>
                <WayTag path={trial.path} />
                <Box sx={{ flex: 1 }} />
                <TrialStateMark view={view} size={16} />
            </Box>
            <Typography sx={{ fontFamily: MONO, fontSize: 12, color: 'text.secondary', overflowWrap: 'anywhere' }}>{paramsLine(trial.params, spec)}</Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, position: 'relative' }}>
                {/* a screen reader hears the epoch and the state, not every GPU sample */}
                <Box aria-live="polite" data-testid="agent-search-trial-live" sx={srOnly}>
                    {`Trial ${trial.idx} · ${stopping ? 'stopping' : epochText(trial).toLowerCase()}`}
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, fontSize: 13 }}>
                    <span>{trial.state === 'declared' ? 'Starting' : epochText(trial)}</span>
                    {eta && <Typography component="span" sx={{ fontSize: 13, color: 'text.secondary' }}>{eta}</Typography>}
                </Box>
                <Box
                    role="progressbar"
                    aria-label={`Trial ${trial.idx} epochs`}
                    aria-valuenow={trial.epoch ?? 0}
                    aria-valuemin={0}
                    aria-valuemax={trial.epochs ?? 0}
                    aria-valuetext={`Trial ${trial.idx} · ${epochText(trial).toLowerCase()}`}
                    sx={{ height: 4, borderRadius: 2, bgcolor: 'action.hover', overflow: 'hidden' }}
                >
                    <Box sx={{ height: 4, width: `${pct ?? 0}%`, bgcolor: 'primary.main', transition: 'width .3s' }} />
                </Box>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px 16px', alignItems: 'end' }}>
                <Fact label={`${words.short.charAt(0).toUpperCase()}${words.short.slice(1)} per epoch`}>
                    {series.epochs.length > 0 ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Sparkline
                                epochs={series.epochs}
                                metric={o.metric}
                                label={`${words.label} of trial ${trial.idx}: last ${scoreText(last?.[o.metric] as number | undefined, o)} at epoch ${last?.epoch ?? '–'}`}
                            />
                            <Typography component="span" sx={{ fontSize: 13, fontWeight: 500 }}>{scoreText(last?.[o.metric] as number | undefined, o)}</Typography>
                        </Box>
                    ) : (
                        <Typography component="span" sx={{ fontSize: 13, color: 'text.secondary' }}>
                            {emptyState(trial, 'figures').title}
                        </Typography>
                    )}
                </Fact>
                <Fact label="GPU">
                    {lastGpu ? (
                        <>{`${Math.round(lastGpu.util)} % · ${(lastGpu.mem_used_mb / 1024).toFixed(1)} of ${Math.round(lastGpu.mem_total_mb / 1024)} GB`}</>
                    ) : (
                        <Typography component="span" sx={{ fontSize: 13, color: 'text.secondary' }}>{emptyState(trial, 'gpu').title}</Typography>
                    )}
                </Fact>
                <Fact label="Best so far">
                    {best && typeof best.score === 'number' ? (
                        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                            <StarIcon sx={{ fontSize: 16, color: 'primary.main' }} aria-hidden />
                            {`${scoreText(best.score, o)} · trial ${best.idx}`}
                        </Box>
                    ) : (
                        <Typography component="span" sx={{ fontSize: 13, color: 'text.secondary' }}>no finished trial yet</Typography>
                    )}
                </Fact>
            </Box>
            <AgentNote text={trial.note} />
        </Box>
    );
}

/** A failed trial inside a running search: its parameters, the end of its log and the sentence that the search goes on. */
function FailedTrial({ search, trial, list, env }: { search: Search; trial: Trial; list: Trial[]; env: SearchEnv }) {
    const { detail } = useTrialDetail(env.chatId, trial);
    const lines = logTailLines(detail?.log_tail, 5);
    return (
        <Box data-testid="agent-search-trial" data-trial-id={trial.id} sx={{ display: 'flex', flexDirection: 'column', gap: 1, pt: 1.5, borderTop: 1, borderColor: 'divider', minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography sx={{ fontSize: 13, fontWeight: 500 }}>{`Trial ${trial.idx}`}</Typography>
                <WayTag path={trial.path} />
                <Box sx={{ flex: 1 }} />
                <TrialStateMark view={trialStateView(trial)} size={18} />
            </Box>
            <Typography sx={{ fontFamily: MONO, fontSize: 12, color: 'text.secondary', overflowWrap: 'anywhere' }}>
                {paramsLine(trial.params, Object.keys(search.space ?? {}))}
                {typeof trial.duration_s === 'number' ? ` · ${durationText(trial.duration_s)}` : ''}
            </Typography>
            {lines.length > 0 ? (
                <LogBox lines={lines} label={`End of the log of trial ${trial.idx}`} wrap />
            ) : trial.error ? (
                <Typography sx={{ fontFamily: MONO, fontSize: 11.5, color: 'error.dark', overflowWrap: 'anywhere' }}>{trial.error}</Typography>
            ) : null}
            <Box role="status" sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 12, color: 'text.secondary' }}>
                <Spinner size={10} />
                {`The search continues. The agent is choosing trial ${nextIdx(list)}.`}
            </Box>
        </Box>
    );
}

/** The last trial of a search that waits for the agent's next choice. */
function Between({ search, list }: { search: Search; list: Trial[] }) {
    const o = search.objective;
    const last = list[list.length - 1];
    const best = bestTrialOf(search, list);
    let summary = '';
    if (last) {
        const done = last.state === 'done' ? 'finished' : last.state;
        summary = `Trial ${last.idx} ${done}`;
        if (last.state === 'done') {
            summary += ` · ${metricWords(o).short} ${scoreText(last.score, o)}`;
            if (typeof last.duration_s === 'number') summary += ` · ${durationText(last.duration_s)}`;
            if (best && best.idx !== last.idx) summary += ` · no improvement on trial ${best.idx}`;
        }
    }
    return (
        <Box role="status" sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, pt: 1.5, borderTop: 1, borderColor: 'divider' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 13 }}>
                <Spinner size={12} />
                <Box component="span" sx={{ fontWeight: 500 }}>{`The agent is choosing trial ${nextIdx(list)}`}</Box>
            </Box>
            {summary && <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{summary}</Typography>}
        </Box>
    );
}

/** The end of a search: the winner, the final test and the reason; or the failure with the best finished trial. */
function Result({ search, list, checks }: { search: Search; list: Trial[]; checks: AssessCheck[] }) {
    const o = search.objective;
    const words = metricWords(o);
    const winner = winnerOf(search, list) ?? bestTrialOf(search, list);
    const check = checks.find((c) => c.check_id && c.check_id === search.holdout?.check_id);
    const test = testView(search, list, check);
    const failed = search.end_reason === 'start_failed';
    const adopted = search.end_reason === 'adopted';
    const reason = endText(search, list);
    const bad = list.filter((t) => t.state === 'failed').pop();
    return (
        <Box data-testid="agent-search-result" sx={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, ...(failed ? {} : { pt: 1.5, borderTop: 1, borderColor: 'divider' }) }}>
            {failed && (
                <Alert severity="error" sx={{ fontSize: 13 }}>
                    {reason}
                </Alert>
            )}
            {winner ? (
                <>
                    {failed ? (
                        <Typography sx={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                            <StarIcon sx={{ fontSize: 16, color: 'primary.main' }} aria-hidden />
                            {`Best finished trial: trial ${winner.idx} · ${words.short} ${scoreText(winner.score, o)} · ${test?.kind === 'none' ? 'no final test' : 'final test pending'}`}
                        </Typography>
                    ) : (
                        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
                            <StarIcon sx={{ fontSize: 18, color: 'primary.main', alignSelf: 'center' }} aria-hidden />
                            <Typography sx={{ fontSize: 13, fontWeight: 500 }}>{`Winner · Trial ${winner.idx}${adopted ? ' (adopted by you)' : ''}`}</Typography>
                            <Box sx={{ flex: 1 }} />
                            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{words.label.replace('Validation', 'Val.')}</Typography>
                            <Typography sx={{ fontSize: 16, fontWeight: 500 }}>{scoreText(winner.score, o)}</Typography>
                        </Box>
                    )}
                    {!failed && <Typography sx={{ fontFamily: MONO, fontSize: 12, color: 'text.secondary', overflowWrap: 'anywhere' }}>{paramsLine(winner.params, Object.keys(search.space ?? {}))}</Typography>}
                    {!failed && test && <TestLine test={test} />}
                </>
            ) : (
                <Typography sx={{ fontSize: 13, color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <InfoOutlinedIcon sx={{ fontSize: 18 }} aria-hidden />
                    No finished trial – no final test.
                </Typography>
            )}
            {!failed && reason && <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{reason}</Typography>}
            {search.end_reason === 'ended_by_agent' && <AgentNote text={search.end_note} collapsible={false} testId="agent-search-end-note" />}
            {failed && (
                <Technical
                    text={[`end_reason: ${search.end_reason}`, bad ? `trial ${bad.idx} (${bad.state}): ${bad.error ?? 'no error text'}` : ''].filter(Boolean).join('\n')}
                    testId="agent-search-technical"
                />
            )}
        </Box>
    );
}

/** The line about the final test under the winner. */
export function TestLine({ test }: { test: NonNullable<ReturnType<typeof testView>> }) {
    if (test.kind === 'measured') {
        return (
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, flexWrap: 'wrap' }}>
                <VerifiedOutlinedIcon sx={{ fontSize: 18, color: 'success.main' }} aria-hidden />
                <Typography sx={{ flex: 1, minWidth: 180, fontSize: 13 }}>
                    <b style={{ fontWeight: 500 }}>{`Test accuracy ${scoreText(test.accuracy)}`}</b>
                    {`${test.images ? ` on ${test.images} held-back images` : ''} · measured by the gateway`}
                </Typography>
                {test.verdict && (
                    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', height: 22, px: 1, border: 1, borderColor: test.verdict === 'usable' ? 'success.main' : 'warning.main', borderRadius: 11, fontSize: 12, color: test.verdict === 'usable' ? 'success.dark' : 'warning.dark' }}>
                        {test.verdict.replace('_', ' ')}
                    </Box>
                )}
            </Box>
        );
    }
    if (test.kind === 'none')
        return (
            <Typography sx={{ fontSize: 13, color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <InfoOutlinedIcon sx={{ fontSize: 18 }} aria-hidden />
                {test.text}
            </Typography>
        );
    return (
        <Box role="status" sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 13 }}>
            <Spinner size={12} />
            <span>
                <b style={{ fontWeight: 500 }}>{test.text.split(' · ')[0]}</b>
                {test.text.includes(' · ') ? ` · ${test.text.split(' · ').slice(1).join(' · ')}` : ''}
            </span>
        </Box>
    );
}

/** The card of one training search. Searches that wait for the approval or were refused are not shown here. */
export default function SearchCard({ search, env }: { search: Search; env: SearchEnv }) {
    const compact = env.layout === 'panel' || useMediaQuery('(max-width: 599.95px)');
    const list = useMemo(() => trialsOf(env.experiments.trials, search.id), [env.experiments.trials, search.id]);
    const view = searchView(search, list);
    const open = openTrialOf(list);
    const live = !view.ended;
    const now = useNow(live, 15000);
    const o = search.objective;
    const words = metricWords(o);
    const meters = budgetMeters(search, list, env.experiments.stopping);
    if (search.state !== 'running' && search.state !== 'ended') return null;
    const failedTrial = view.state === 'failedTrial' ? list[list.length - 1] : undefined;
    const lastAt = env.experiments.lastAt ? formatClock(env.experiments.lastAt, true) : undefined;

    return (
        <Box
            id={searchCardId(search.id)}
            role="region"
            tabIndex={-1}
            aria-label={`Training search ${search.title}`}
            data-testid="agent-search-card"
            data-search-id={search.id}
            data-search-state={view.state}
            sx={{
                bgcolor: '#fff',
                border: 1,
                borderColor: 'divider',
                borderLeft: 3,
                borderLeftColor: 'primary.main',
                borderRadius: 1,
                px: 1.5,
                py: 1.5,
                display: 'flex',
                flexDirection: 'column',
                gap: 1.5,
                minWidth: 0,
                boxSizing: 'border-box',
            }}
        >
            {env.experiments.reconnecting && <ReconnectingHint since={lastAt} />}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: compact ? 'nowrap' : 'wrap', minHeight: 30 }}>
                <Typography noWrap title={search.title} sx={{ fontSize: 14, fontWeight: 500, minWidth: 0, flex: '0 1 auto' }}>
                    {`Training search · ${search.title}`}
                </Typography>
                <SearchStateChip kind={view.kind} label={view.chip} />
                <Box sx={{ flex: 1 }} />
                {live && env.chatId && !compact && (
                    <SearchControls chatId={env.chatId} variant="card" part="stop" search={search} trial={open} actions={env.actions} compact={false} />
                )}
            </Box>
            {live && env.chatId && compact && (
                <Box sx={{ display: 'flex', alignItems: 'center', mt: -0.5 }}>
                    <SearchControls chatId={env.chatId} variant="card" part="stop" search={search} trial={open} actions={env.actions} compact />
                </Box>
            )}
            <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: -0.75 }}>
                {`${words.label} · ${directionText(o)} · ${wayLabel(search)}`}
            </Typography>
            <Meters meters={meters} />
            {view.state === 'running' && open && <RunningTrial search={search} trial={open} list={list} env={env} now={now} />}
            {view.state === 'between' && <Between search={search} list={list} />}
            {failedTrial && <FailedTrial search={search} trial={failedTrial} list={list} env={env} />}
            {view.ended && <Result search={search} list={list} checks={env.checks} />}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap', mx: -0.75, mb: -0.5 }}>
                {live && env.chatId && <SearchControls chatId={env.chatId} variant="card" part="adjust" search={search} trial={open} bestIdx={bestTrialOf(search, list)?.idx} actions={env.actions} compact={compact} />}
                <Box sx={{ flex: 1 }} />
                <OpenInExperiments chatId={env.chatId} searchId={search.id} />
            </Box>
        </Box>
    );
}
