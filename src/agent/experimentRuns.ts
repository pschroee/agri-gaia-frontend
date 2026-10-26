// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The overview of all runs of the tab "Experiments" (gateway issue #222): the rows of GET /api/experiments, the words
// of their state and progress, and the address of a detail. Pure functions; the only effect is `fetchExperimentRuns`.

import type { ProgressCellProps } from './components/overview/ProgressCell';
import type { OverviewState } from './components/overview/overviewUrl';
import { periodSince } from './activity';
import type { Search, SearchObjective, Trial } from './experiments';
import { formatClock, isToday } from './format';
import { AGENT_BASE } from './login';
import type { WatchJob } from './jobs';
import { durationText, etaText, metricWords, scoreText } from './searchView';

export type RunKind = 'training_search' | 'training_run' | 'notebook_run';
/** One state word for all kinds of run (the gateway's `runState`). */
export type RunState = 'running' | 'waiting' | 'done' | 'failed' | 'stopped';

export type RunProgress = {
    /** Number of the open trial of a search. */
    trial?: number | null;
    /** Trials the budget allows (`max_runs`). */
    trials?: number | null;
    trials_done?: number | null;
    epoch?: number | null;
    epochs?: number | null;
    eta?: string | null;
    message?: string;
};

export type RunScore = { metric: SearchObjective['metric']; mode: SearchObjective['mode']; value?: number | null; trial?: number | null };

/** One row of the overview (gateway `RunRow`). */
export type RunRow = {
    kind: RunKind;
    /** Search `s…`, trial `t…`, notebook job `w…`. */
    id: string;
    chat_id: string;
    chat_title: string;
    title: string;
    state: RunState;
    path?: string;
    started_at?: string | null;
    ended_at?: string | null;
    duration_s?: number | null;
    progress?: RunProgress;
    score?: RunScore | null;
    /** First line of the error, at most 200 characters. */
    error?: string;
    plan_id?: string;
    /** Number of the plan step, counted from 1 like `idx` of a plan step and `step_idx` of a job. */
    plan_step?: number | null;
    tool_call_id?: string;
    link?: string;
    stopped_by?: 'user' | 'agent' | '';
    search?: Search;
    trial?: Trial;
    job?: WatchJob;
};

export type RunPage = {
    runs: RunRow[];
    total: number;
    offset: number;
    limit: number;
    counts: Partial<Record<RunState, number>>;
    chats: { id: string; title: string; runs: number }[];
    truncated: boolean;
};

export const KIND_LABEL: Record<RunKind, string> = {
    training_search: 'Training search',
    training_run: 'Training run',
    notebook_run: 'Notebook run',
};

export const STATE_LABEL: Record<RunState, string> = {
    running: 'Running',
    waiting: 'Waiting for approval',
    done: 'Done',
    failed: 'Failed',
    stopped: 'Stopped',
};

export const RUN_STATES: RunState[] = ['running', 'waiting', 'done', 'failed', 'stopped'];
export const RUN_KINDS: RunKind[] = ['training_search', 'training_run', 'notebook_run'];

/** Keys of the filters in the address; `in_chat` because `chat` names the chat of an open detail. */
export const OVERVIEW_KEYS = ['status', 'kind', 'in_chat'];

export const OVERVIEW_DEFAULTS: OverviewState = {
    period: 'all',
    filters: { status: '', kind: '', in_chat: '' },
    sort: undefined,
    page: 0,
    size: 25,
};

/** Columns the gateway sorts by; the ids of the sortable columns are the same words. */
export const SORT_KEYS = ['started', 'duration', 'title', 'state', 'chat'];

// ---------------------------------------------------------------------------------------------------------------
// The request
// ---------------------------------------------------------------------------------------------------------------

/** Query string of GET /experiments for a state of the overview (times as RFC 3339 in UTC without milliseconds). */
export function runsQuery(s: OverviewState, now = new Date()): string {
    const q = new URLSearchParams();
    if (s.filters.status) q.set('state', s.filters.status);
    if (s.filters.kind) q.set('kind', s.filters.kind);
    if (s.filters.in_chat) q.set('chat', s.filters.in_chat);
    const since = periodSince(s.period, now);
    if (since) q.set('since', since.toISOString().replace(/\.\d{3}Z$/, 'Z'));
    if (s.sort && SORT_KEYS.includes(s.sort.by)) {
        q.set('sort', s.sort.by);
        q.set('order', s.sort.order);
    }
    if (s.page > 0) q.set('offset', String(s.page * s.size));
    q.set('limit', String(s.size));
    return `?${q.toString()}`;
}

/** The page of runs; an error carries the gateway's own words. */
export async function fetchExperimentRuns(query: string, signal?: AbortSignal): Promise<RunPage> {
    const res = await fetch(`${AGENT_BASE}/api/experiments${query}`, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
        signal,
    });
    if (!res.ok) {
        let text = `${res.status} ${res.statusText}`.trim();
        try {
            const body = (await res.json()) as { error?: string };
            if (typeof body.error === 'string' && body.error) text = body.error;
        } catch {
            // keep the status line
        }
        throw new Error(text);
    }
    const body = (await res.json()) as Partial<RunPage>;
    return {
        runs: Array.isArray(body.runs) ? body.runs : [],
        total: typeof body.total === 'number' ? body.total : 0,
        offset: typeof body.offset === 'number' ? body.offset : 0,
        limit: typeof body.limit === 'number' ? body.limit : 25,
        counts: body.counts ?? {},
        chats: Array.isArray(body.chats) ? body.chats : [],
        truncated: !!body.truncated,
    };
}

// ---------------------------------------------------------------------------------------------------------------
// States, as the gateway's `runState` maps them (used where a detail has the raw object only)
// ---------------------------------------------------------------------------------------------------------------

export function searchRunState(s: Pick<Search, 'state' | 'end_reason'>): RunState {
    if (s.state === 'proposed') return 'waiting';
    if (s.state === 'running') return 'running';
    if (s.state === 'ended') return s.end_reason === 'start_failed' ? 'failed' : s.end_reason === 'stopped_by_user' ? 'stopped' : 'done';
    return 'done';
}

export function trialRunState(t: Pick<Trial, 'state'>): RunState {
    if (t.state === 'declared' || t.state === 'running') return 'running';
    if (t.state === 'failed') return 'failed';
    if (t.state === 'stopped') return 'stopped';
    return 'done';
}

export function jobRunState(j: Pick<WatchJob, 'state' | 'stopped_by'>): RunState {
    if (j.state === 'running') return 'running';
    if (j.state === 'failed') return 'failed';
    return j.stopped_by ? 'stopped' : 'done';
}

export type RunStateView = { label: string; icon: 'spinner' | 'waiting' | 'done' | 'failed' | 'stopped'; tone: 'primary' | 'attention' | 'ok' | 'error' | 'muted' };

/** Symbol, word and tone of a state; never the colour alone. */
export function runStateView(state: RunState): RunStateView {
    switch (state) {
        case 'running':
            return { label: STATE_LABEL.running, icon: 'spinner', tone: 'primary' };
        case 'waiting':
            return { label: STATE_LABEL.waiting, icon: 'waiting', tone: 'attention' };
        case 'done':
            return { label: STATE_LABEL.done, icon: 'done', tone: 'ok' };
        case 'failed':
            return { label: STATE_LABEL.failed, icon: 'failed', tone: 'error' };
        default:
            return { label: STATE_LABEL.stopped, icon: 'stopped', tone: 'muted' };
    }
}

// ---------------------------------------------------------------------------------------------------------------
// The cells
// ---------------------------------------------------------------------------------------------------------------

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** "plan step 4" for a run an agent plan started (`plan_step` counts from 1 like the plan's `idx`). */
export const planStepText = (r: Pick<RunRow, 'plan_id' | 'plan_step'>): string | undefined =>
    r.plan_id ? (r.plan_step ? `plan step ${r.plan_step}` : 'plan step') : undefined;

/** Second line of the "Run" cell: "Training search · template", "Training run · <what ran>", "Notebook run · prep.py". */
export function runSubline(r: RunRow): string {
    const parts: string[] = [KIND_LABEL[r.kind]];
    if (r.kind === 'training_search') parts.push(r.path === 'notebook' ? 'notebook' : 'template');
    else if (r.kind === 'training_run') {
        const what = r.trial?.name;
        if (what) parts.push(what);
    } else if (r.title) parts.push(r.title);
    const step = planStepText(r);
    if (step) parts.push(step);
    return parts.join(' · ');
}

const firstLine = (s: string | undefined): string => (s ?? '').split('\n')[0].trim();

/** "Stopped by you" / "Stopped by the agent"; plain "Stopped" when nobody is named. */
export function stoppedText(r: Pick<RunRow, 'stopped_by' | 'trial' | 'job' | 'search'>): string {
    const by = r.stopped_by || r.trial?.stopped_by || r.job?.stopped_by || (r.search?.end_reason === 'stopped_by_user' ? 'user' : '');
    return by === 'user' ? 'Stopped by you' : by === 'agent' ? 'Stopped by the agent' : 'Stopped';
}

const clampPercent = (v: number): number => Math.max(0, Math.min(100, v));

/** The "Progress" cell of a row (texts and bar as the plan of issue #222 words them). */
export function runProgress(r: RunRow, now = Date.now()): ProgressCellProps {
    const p = r.progress ?? {};
    const epochOf = (): string | undefined => {
        if (!num(p.epoch)) return undefined;
        return num(p.epochs) ? `epoch ${p.epoch}/${p.epochs}` : `epoch ${p.epoch}`;
    };
    if (r.state === 'waiting') return { label: 'Waits for your approval', tone: 'attention' };
    if (r.state === 'failed') {
        const msg = firstLine(r.error);
        return { label: msg || 'Failed', tone: 'failed', title: msg || undefined };
    }
    if (r.state === 'stopped') return { label: stoppedText(r) };
    if (r.state === 'done') {
        if (r.kind === 'training_search') {
            const n = p.trials_done ?? p.trial;
            return { label: num(n) ? `${n} trial${n === 1 ? '' : 's'}` : 'Done' };
        }
        const epochs = p.epochs ?? p.epoch;
        if (r.kind === 'training_run' && num(epochs)) return { label: `${epochs} epoch${epochs === 1 ? '' : 's'}` };
        return { label: firstLine(p.message) || 'Done' };
    }
    // running
    const eta = etaText(p.eta, now);
    if (r.kind === 'training_search') {
        if (!num(p.trial)) return { label: 'Choosing the first trial', indeterminate: true };
        const head = num(p.trials) ? `Trial ${p.trial} of ${p.trials}` : `Trial ${p.trial}`;
        const ep = epochOf();
        const frac = num(p.epoch) && num(p.epochs) && p.epochs > 0 ? p.epoch / p.epochs : 0;
        let value: number | undefined;
        if (num(p.trials) && p.trials > 0) value = clampPercent((((p.trials_done ?? 0) + frac) / p.trials) * 100);
        else if (num(p.epoch) && num(p.epochs) && p.epochs > 0) value = clampPercent(frac * 100);
        return { label: ep ? `${head} · ${ep}` : head, value, indeterminate: value === undefined, sub: eta };
    }
    if (num(p.epoch)) {
        const label = num(p.epochs) ? `Epoch ${p.epoch} of ${p.epochs}` : `Epoch ${p.epoch}`;
        const known = num(p.epochs) && p.epochs > 0;
        return { label, value: known ? clampPercent((p.epoch / (p.epochs as number)) * 100) : undefined, indeterminate: !known, sub: eta };
    }
    if (r.kind === 'training_run') return { label: 'Starting', indeterminate: true };
    return { label: firstLine(p.message) || 'Running', indeterminate: true };
}

/** "val. acc. 0.91" (the words of the metric, the figure with its usual decimals); "–" without a value. */
export function scoreCell(r: Pick<RunRow, 'score'>): string {
    const s = r.score;
    if (!s || !num(s.value)) return '–';
    const o: SearchObjective = { metric: s.metric, mode: s.mode };
    return `${metricWords(o).short} ${scoreText(s.value, o)}`;
}

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });

/** "15:51" for today, "24 Oct 15:51" before; "–" without a time. */
export function startedText(iso: string | null | undefined, now = Date.now()): string {
    if (!iso) return '–';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '–';
    const clock = formatClock(iso);
    return isToday(iso, new Date(now)) ? clock : `${dateFmt.format(d)} ${clock}`;
}

/**
 * Seconds a row has run: the gateway's figure from the last answer plus the time since it arrived, for a running row;
 * the plain figure otherwise (undefined when unknown).
 */
export function liveDuration(r: Pick<RunRow, 'state' | 'duration_s' | 'started_at'>, fetchedAt: number | undefined, now: number): number | undefined {
    if (r.state !== 'running') return num(r.duration_s) ? r.duration_s : undefined;
    if (num(r.duration_s) && fetchedAt !== undefined) return r.duration_s + Math.max(0, now - fetchedAt) / 1000;
    if (r.started_at) {
        const t = Date.parse(r.started_at);
        if (Number.isFinite(t)) return Math.max(0, (now - t) / 1000);
    }
    return num(r.duration_s) ? r.duration_s : undefined;
}

export const durationCell = (seconds: number | undefined): string => durationText(seconds);

// ---------------------------------------------------------------------------------------------------------------
// The address of a detail
// ---------------------------------------------------------------------------------------------------------------

/** The parameters that open a detail; "Back to overview" removes exactly these. */
export const DETAIL_KEYS = ['chat', 'run', 'trial', 'search'];

export function runKindOf(id: string): RunKind | undefined {
    if (/^s/.test(id)) return 'training_search';
    if (/^t/.test(id)) return 'training_run';
    if (/^w/.test(id)) return 'notebook_run';
    return undefined;
}

export type DetailRef = { chatId: string; runId: string; trialId?: string };

/**
 * The detail an address asks for: `chat` + `run` (+ `trial`). The older link `?search=<id>` counts as `run`; without
 * `chat` the chat that is selected is meant. Undefined for the overview.
 */
export function detailOf(params: URLSearchParams, selectedChatId?: string): DetailRef | undefined {
    const runId = params.get('run') || params.get('search');
    if (!runId) return undefined;
    const chatId = params.get('chat') || selectedChatId;
    if (!chatId) return undefined;
    return { chatId, runId, trialId: params.get('trial') || undefined };
}

/** The address of a run's detail, keeping every other parameter (the state of the overview). */
export function openRunParams(p: URLSearchParams, chatId: string, runId: string): URLSearchParams {
    const out = new URLSearchParams(p);
    for (const k of DETAIL_KEYS) out.delete(k);
    out.set('chat', chatId);
    out.set('run', runId);
    return out;
}

/** The overview again: only the parameters of the detail go. */
export function closeRunParams(p: URLSearchParams): URLSearchParams {
    const out = new URLSearchParams(p);
    for (const k of DETAIL_KEYS) out.delete(k);
    return out;
}
