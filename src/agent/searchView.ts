// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// What the cards, the chip and the tab of a training search say (gateway issue #168): the words, the numbers and the
// states, derived from the gateway's data in pure functions so a test can pin them down. The texts follow the design
// (prototyp/entwuerfe/training-search) and the decisions at the issue (A1–A20, G1–G21).

import type {
    EndReason,
    EpochRow,
    GpuPoint,
    ParamSpec,
    Search,
    SearchBudget,
    SearchHoldout,
    SearchObjective,
    Trial,
    TrialState,
} from './experiments';
import { formatClock } from './format';
import { shellWords } from './stepDetail';
import type { AssessCheck } from './types';

// ---------------------------------------------------------------------------------------------------------------
// Numbers and names
// ---------------------------------------------------------------------------------------------------------------

type MetricWords = { label: string; short: string; abbr: string };

const METRIC_WORDS: Record<string, MetricWords> = {
    val_acc: { label: 'Validation accuracy', short: 'val. accuracy', abbr: 'Val. acc.' },
    val_loss: { label: 'Validation loss', short: 'val. loss', abbr: 'Val. loss' },
    val_f1: { label: 'Validation F1', short: 'val. F1', abbr: 'Val. F1' },
};

/** The words for the metric of a search: "Validation accuracy", "val. accuracy", "Val. acc.". */
export const metricWords = (o: SearchObjective | undefined): MetricWords => METRIC_WORDS[o?.metric ?? 'val_acc'] ?? METRIC_WORDS.val_acc;

export const directionText = (o: SearchObjective | undefined): string => (o?.mode === 'min' ? 'lower is better' : 'higher is better');

/** The label of the target field of the budget dialog: "Val. accuracy at least", "Val. loss at most". */
export function targetFieldLabel(o: SearchObjective | undefined): string {
    const short = metricWords(o).short;
    return `${short.charAt(0).toUpperCase()}${short.slice(1)} ${o?.mode === 'min' ? 'at most' : 'at least'}`;
}

/** The sign before a goal: at least for a metric to maximise, at most for one to minimise (A16). */
export const goalSign = (o: SearchObjective | undefined): string => (o?.mode === 'min' ? '≤' : '≥');

/** The value of the target metric: two decimals for accuracy and F1, three for a loss; "–" without a value. */
export function scoreText(v: number | null | undefined, o?: SearchObjective): string {
    if (typeof v !== 'number' || !Number.isFinite(v)) return '–';
    return v.toFixed(o?.metric === 'val_loss' ? 3 : 2);
}

/** A number as a person writes a hyper-parameter: 3e-4, 0.05, 32, 1.5e6. */
export function compactNumber(n: number): string {
    if (!Number.isFinite(n)) return String(n);
    if (n === 0) return '0';
    const abs = Math.abs(n);
    if (abs < 0.01 || abs >= 1e6) {
        const [m, e] = n.toExponential(2).split('e');
        const mant = m.replace(/\.?0+$/, '');
        return `${mant}e${Number(e)}`;
    }
    return String(Number(n.toPrecision(4)));
}

/** One parameter value: numbers compact, booleans as yes/no, text as it is. */
export function paramValue(v: unknown): string {
    if (typeof v === 'number') return compactNumber(v);
    if (typeof v === 'boolean') return v ? 'yes' : 'no';
    if (v === null || v === undefined) return '–';
    if (typeof v === 'string') return v;
    return JSON.stringify(v);
}

/** The parameters of a trial in one line, with their real names (G9): `learning_rate 3e-4 · batch_size 64`. */
export function paramsLine(params: Record<string, unknown> | undefined, order?: string[]): string {
    const keys = order?.length ? order.filter((k) => params && k in params) : Object.keys(params ?? {});
    for (const k of Object.keys(params ?? {})) if (!keys.includes(k)) keys.push(k);
    return keys.map((k) => `${k} ${paramValue(params?.[k])}`).join(' · ');
}

/** Minutes as "1 h 12 min", "45 min", "3 h". */
export function minutesText(min: number): string {
    const total = Math.max(0, Math.round(min));
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (h === 0) return `${m} min`;
    return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** A bound of a range: on a log scale up to 0.01 in exponential form ("1e-2"), as the design writes it. */
function boundText(n: number, log: boolean): string {
    if (log && n > 0 && n <= 0.01) {
        const [m, e] = n.toExponential(2).split('e');
        return `${m.replace(/\.?0+$/, '')}e${Number(e)}`;
    }
    return compactNumber(n);
}

/** The kind and the bounds of a searched parameter for the table of the approval. */
export function specText(spec: ParamSpec): { kind: string; vals: string } {
    switch (spec.type) {
        case 'float':
        case 'int':
            return {
                kind: `range · ${spec.scale === 'log' ? 'log' : 'linear'}`,
                vals: `${boundText(spec.min ?? 0, spec.scale === 'log')} … ${boundText(spec.max ?? 0, spec.scale === 'log')}`,
            };
        case 'choice':
            return { kind: 'values', vals: (spec.values ?? []).map(paramValue).join(' · ') };
        case 'bool':
            return { kind: 'yes/no', vals: 'yes · no' };
        default:
            return { kind: spec.type, vals: '' };
    }
}

/** A 2:1 thinned copy of the points, so a sparkline of a long run stays light. */
export function thin<T>(list: T[], max: number): T[] {
    if (list.length <= max) return list;
    const step = list.length / max;
    return Array.from({ length: max }, (_, i) => list[Math.min(list.length - 1, Math.floor(i * step))]);
}

// ---------------------------------------------------------------------------------------------------------------
// Trials
// ---------------------------------------------------------------------------------------------------------------

export const trialsOf = (trials: Trial[], searchId: string): Trial[] =>
    trials.filter((t) => t.search_id === searchId).sort((a, b) => a.idx - b.idx);

export const isOpen = (t: Pick<Trial, 'state'>): boolean => t.state === 'declared' || t.state === 'running';

export const openTrialOf = (list: Trial[]): Trial | undefined => list.find(isOpen);

/** The best finished trial: the gateway's `best_idx`, else the best score among the finished ones. */
export function bestTrialOf(search: Search, list: Trial[]): Trial | undefined {
    if (typeof search.best_idx === 'number') {
        const t = list.find((x) => x.idx === search.best_idx);
        if (t) return t;
    }
    let best: Trial | undefined;
    for (const t of list) {
        if (t.state !== 'done' || typeof t.score !== 'number') continue;
        if (!best || (search.objective?.mode === 'min' ? t.score < (best.score as number) : t.score > (best.score as number))) best = t;
    }
    return best;
}

export const winnerOf = (search: Search, list: Trial[]): Trial | undefined =>
    typeof search.winner_idx === 'number' ? list.find((t) => t.idx === search.winner_idx) : undefined;

/** The trial of a state, in the words of the table: icon kind, word and tone. Never the colour alone. */
export type StateView = { label: string; icon: 'spinner' | 'done' | 'failed' | 'stopped' | 'refused'; tone: 'primary' | 'ok' | 'error' | 'muted' };

export function trialStateView(t: Pick<Trial, 'state' | 'stopped_by'>, stopping = false): StateView {
    const state: TrialState = t.state;
    if (stopping && (state === 'declared' || state === 'running')) return { label: 'Stopping…', icon: 'spinner', tone: 'muted' };
    switch (state) {
        case 'declared':
            return { label: 'Starting', icon: 'spinner', tone: 'primary' };
        case 'running':
            return { label: 'Running', icon: 'spinner', tone: 'primary' };
        case 'done':
            return { label: 'Done', icon: 'done', tone: 'ok' };
        case 'failed':
            return { label: 'Failed', icon: 'failed', tone: 'error' };
        case 'stopped':
            return { label: 'Stopped', icon: 'stopped', tone: 'muted' };
        default:
            return { label: 'Refused', icon: 'refused', tone: 'error' };
    }
}

/** "Epoch 7/20", "Epoch 7" when the total is unknown, "Starting" before the first epoch. */
export function epochText(t: Pick<Trial, 'epoch' | 'epochs'>): string {
    if (typeof t.epoch !== 'number') return typeof t.epochs === 'number' ? `0/${t.epochs} epochs` : 'Starting';
    return typeof t.epochs === 'number' ? `Epoch ${t.epoch}/${t.epochs}` : `Epoch ${t.epoch}`;
}

/** "7/20" for the table. */
export const epochCell = (t: Pick<Trial, 'epoch' | 'epochs'>): string =>
    typeof t.epoch === 'number' ? `${t.epoch}/${t.epochs ?? '?'}` : '–';

/** The fraction of the epochs done, 0–100; undefined when the total is unknown. */
export function epochPercent(t: Pick<Trial, 'epoch' | 'epochs'>): number | undefined {
    if (typeof t.epochs !== 'number' || t.epochs <= 0) return undefined;
    return Math.max(0, Math.min(100, ((t.epoch ?? 0) / t.epochs) * 100));
}

/** "about 9 min left" from the end the watcher expects; undefined without an estimate. */
export function etaText(eta: string | null | undefined, now = Date.now()): string | undefined {
    if (!eta) return undefined;
    const t = Date.parse(eta);
    if (!Number.isFinite(t)) return undefined;
    const sec = (t - now) / 1000;
    if (sec < 60) return 'less than a minute left';
    const min = Math.round(sec / 60);
    return min < 60 ? `about ${min} min left` : `about ${minutesText(min)} left`;
}

/** "14 min", "41 s", "1 h 05 min" for the duration of a trial. */
export function durationText(seconds: number | undefined): string {
    if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return '–';
    const s = Math.max(0, Math.round(seconds));
    if (s < 60) return `${s} s`;
    return minutesText(s / 60);
}

// ---------------------------------------------------------------------------------------------------------------
// The state of a search
// ---------------------------------------------------------------------------------------------------------------

/** The state the card shows (design: running … failed) plus the states the design leaves to the gateway (A4, A19). */
export type CardState =
    | 'running'
    | 'between'
    | 'failedTrial'
    | 'target'
    | 'budget'
    | 'patience'
    | 'stopped'
    | 'adopted'
    | 'failed'
    | 'limit'
    | 'compute'
    | 'agent';

export type ChipKind = 'live' | 'wait' | 'ok' | 'neutral' | 'error';

export type SearchView = { state: CardState; chip: string; kind: ChipKind; ended: boolean };

const END_VIEW: Record<EndReason, { state: CardState; chip: string; kind: ChipKind }> = {
    target_reached: { state: 'target', chip: 'Target reached', kind: 'ok' },
    budget_runs: { state: 'budget', chip: 'Budget used up', kind: 'ok' },
    budget_time: { state: 'budget', chip: 'Budget used up', kind: 'ok' },
    patience: { state: 'patience', chip: 'No improvement', kind: 'ok' },
    time_limit: { state: 'limit', chip: 'Time limit reached', kind: 'ok' },
    compute_limit: { state: 'compute', chip: 'No compute calls left', kind: 'ok' },
    ended_by_agent: { state: 'agent', chip: 'Ended by the agent', kind: 'ok' },
    stopped_by_user: { state: 'stopped', chip: 'Stopped by you', kind: 'neutral' },
    adopted: { state: 'adopted', chip: 'Trial adopted', kind: 'ok' },
    start_failed: { state: 'failed', chip: 'Failed', kind: 'error' },
};

/** The state of a running or ended search for the card and the table header. */
export function searchView(search: Search, list: Trial[]): SearchView {
    if (search.state === 'ended') {
        const v = END_VIEW[(search.end_reason || 'ended_by_agent') as EndReason] ?? END_VIEW.ended_by_agent;
        return { ...v, ended: true };
    }
    const open = openTrialOf(list);
    if (open) return { state: 'running', chip: 'Running', kind: 'live', ended: false };
    const last = list[list.length - 1];
    if (last?.state === 'failed') return { state: 'failedTrial', chip: 'Running', kind: 'live', ended: false };
    return { state: 'between', chip: 'Choosing next trial', kind: 'live', ended: false };
}

/** The trial the agent is about to choose: one after the last. */
export const nextIdx = (list: Trial[]): number => (list.length ? list[list.length - 1].idx + 1 : 1);

// ---------------------------------------------------------------------------------------------------------------
// The budget
// ---------------------------------------------------------------------------------------------------------------

export type Meter = {
    key: 'runs' | 'time' | 'target' | 'patience';
    label: string;
    /** The line under the label. */
    value: string;
    /** The share of the bar, 0–100; null: no bar fill (a limit that is not set, or the target). */
    pct: number | null;
    /** The limit is reached: nothing more is started because of it. */
    reached: boolean;
    set: boolean;
    /** For `aria-valuetext` of the bar. */
    valueText: string;
};

const isSet = (v: number | null | undefined): v is number => typeof v === 'number';

/** Whether the budget of a search has a given limit set. */
export function budgetSet(b: SearchBudget | undefined): boolean {
    return !!b && (isSet(b.max_runs) || isSet(b.max_compute_minutes) || isSet(b.target) || isSet(b.patience));
}

/** The four meters of a search: runs, compute time, target, patience (G10, G20). */
export function budgetMeters(search: Search, list: Trial[], stopping: Record<string, true> = {}): Meter[] {
    const b = search.budget ?? {};
    const u = search.used ?? { runs: 0, compute_minutes: 0, since_improvement: 0 };
    const o = search.objective;
    const best = bestTrialOf(search, list);
    const open = openTrialOf(list);
    const failed = list.filter((t) => t.state === 'failed').length;
    const stoppedLast = search.state === 'ended' && list[list.length - 1]?.state === 'stopped' ? list[list.length - 1] : undefined;

    let runsNote = '';
    if (open) runsNote = ` · trial ${open.idx} ${stopping[open.id] ? 'stopping' : open.state === 'declared' ? 'starting' : 'running'}`;
    else if (stoppedLast) runsNote = ` · trial ${stoppedLast.idx} stopped`;
    else if (failed > 0) runsNote = ` · ${failed} failed`;
    const runsReached = isSet(b.max_runs) && u.runs >= b.max_runs;

    const timeReached = isSet(b.max_compute_minutes) && u.compute_minutes >= b.max_compute_minutes;
    const goalReached = isSet(b.target) && !!best && typeof best.score === 'number' && (o?.mode === 'min' ? best.score <= b.target : best.score >= b.target);
    const patienceReached = isSet(b.patience) && u.since_improvement >= b.patience;

    return [
        {
            key: 'runs',
            label: 'Runs',
            value: isSet(b.max_runs) ? `${u.runs} of ${b.max_runs}${runsNote}` : `${u.runs}${runsNote} · not set`,
            pct: isSet(b.max_runs) ? Math.min(100, (u.runs / b.max_runs) * 100) : null,
            reached: runsReached,
            set: isSet(b.max_runs),
            valueText: isSet(b.max_runs) ? `${u.runs} of ${b.max_runs} runs` : `${u.runs} runs, no limit`,
        },
        {
            key: 'time',
            label: 'Compute time',
            value: isSet(b.max_compute_minutes)
                ? `${minutesText(u.compute_minutes)} of ${minutesText(b.max_compute_minutes)}`
                : `${minutesText(u.compute_minutes)} · not set`,
            pct: isSet(b.max_compute_minutes) ? Math.min(100, (u.compute_minutes / b.max_compute_minutes) * 100) : null,
            reached: timeReached,
            set: isSet(b.max_compute_minutes),
            valueText: isSet(b.max_compute_minutes)
                ? `${minutesText(u.compute_minutes)} of ${minutesText(b.max_compute_minutes)} compute time`
                : `${minutesText(u.compute_minutes)} compute time, no limit`,
        },
        {
            key: 'target',
            label: 'Target',
            value: isSet(b.target)
                ? `${best && typeof best.score === 'number' ? `best ${scoreText(best.score, o)}` : 'no result yet'} · goal ${goalSign(o)} ${compactNumber(b.target)}`
                : 'not set',
            // the target has no fill: a bar that fills towards the goal would suggest a distance that is not linear (G20)
            pct: null,
            reached: goalReached,
            set: isSet(b.target),
            valueText: isSet(b.target)
                ? goalReached
                    ? `Target ${goalSign(o)} ${compactNumber(b.target)} reached`
                    : `Target ${goalSign(o)} ${compactNumber(b.target)} not reached yet`
                : 'Target not set',
        },
        {
            key: 'patience',
            label: 'Patience',
            value: isSet(b.patience) ? `${u.since_improvement} of ${b.patience} without improvement` : 'not set',
            pct: isSet(b.patience) ? Math.min(100, (u.since_improvement / b.patience) * 100) : null,
            reached: patienceReached,
            set: isSet(b.patience),
            valueText: isSet(b.patience)
                ? `${u.since_improvement} of ${b.patience} runs without improvement`
                : 'Patience not set',
        },
    ];
}

/** The most runs the budget dialog accepts: what is used plus the compute calls the chat has left (G10). */
export const maxRunsCap = (search: Pick<Search, 'used' | 'compute_left'>): number =>
    (search.used?.runs ?? 0) + Math.max(0, search.compute_left ?? 0);

export type BudgetForm = {
    runs: { set: boolean; value: string };
    hours: string;
    minutes: string;
    timeSet: boolean;
    target: { set: boolean; value: string };
    patience: { set: boolean; value: string };
};

export type BudgetErrors = Partial<Record<'runs' | 'time' | 'target' | 'patience', string>>;

const wholeNumber = (s: string): number | undefined => (/^\s*\d+\s*$/.test(s) ? Number(s) : undefined);

/** The form of the budget dialog filled with the budget that is in force. */
export function budgetForm(search: Pick<Search, 'budget'>): BudgetForm {
    const b = search.budget ?? {};
    const min = isSet(b.max_compute_minutes) ? b.max_compute_minutes : undefined;
    return {
        runs: { set: isSet(b.max_runs), value: isSet(b.max_runs) ? String(b.max_runs) : '' },
        hours: min !== undefined ? String(Math.floor(min / 60)) : '',
        minutes: min !== undefined ? String(min % 60).padStart(2, '0') : '',
        timeSet: min !== undefined,
        target: { set: isSet(b.target), value: isSet(b.target) ? String(b.target) : '' },
        patience: { set: isSet(b.patience), value: isSet(b.patience) ? String(b.patience) : '' },
    };
}

/** The errors of a budget form, in the words of the dialog; empty when it can be saved. */
export function budgetErrors(form: BudgetForm, search: Pick<Search, 'used' | 'compute_left' | 'objective'>): BudgetErrors {
    const e: BudgetErrors = {};
    const cap = maxRunsCap(search);
    if (form.runs.set) {
        const n = wholeNumber(form.runs.value);
        if (n === undefined || n < 1) e.runs = 'Enter a whole number of at least 1';
        else if (n > cap) e.runs = `At most ${cap}: ${Math.max(0, search.compute_left ?? 0)} compute calls left in this chat`;
        else if (n > 50) e.runs = 'At most 50';
    }
    if (form.timeSet) {
        const h = form.hours.trim() === '' ? 0 : wholeNumber(form.hours);
        const m = form.minutes.trim() === '' ? 0 : wholeNumber(form.minutes);
        if (h === undefined || m === undefined) e.time = 'Enter whole hours and minutes';
        else if (m > 59) e.time = 'Minutes: 0 to 59';
        else if (h * 60 + m < 1) e.time = 'At least 1 minute';
    }
    if (form.target.set) {
        const v = Number(form.target.value);
        const min = search.objective?.mode === 'min';
        const acc = search.objective?.metric !== 'val_loss';
        if (form.target.value.trim() === '' || !Number.isFinite(v)) e.target = 'Enter a number';
        else if (acc && (v <= 0 || v > 1)) e.target = 'Between 0 and 1';
        else if (min && !acc && v <= 0) e.target = 'Above 0';
    }
    if (form.patience.set) {
        const n = wholeNumber(form.patience.value);
        if (n === undefined || n < 1) e.patience = 'Enter a whole number of at least 1';
    }
    return e;
}

/** The body of `POST …/budget` from a valid form; `null` is "not set". */
export function budgetBody(form: BudgetForm): Required<{ [K in keyof SearchBudget]: NonNullable<SearchBudget[K]> | null }> {
    const min = (wholeNumber(form.hours) ?? 0) * 60 + (wholeNumber(form.minutes) ?? 0);
    return {
        max_runs: form.runs.set ? Number(form.runs.value) : null,
        max_compute_minutes: form.timeSet ? min : null,
        target: form.target.set ? Number(form.target.value) : null,
        patience: form.patience.set ? Number(form.patience.value) : null,
    };
}

// ---------------------------------------------------------------------------------------------------------------
// The end of a search
// ---------------------------------------------------------------------------------------------------------------

function hoursBetween(a: string | null | undefined, b: string | null | undefined): string | undefined {
    const t0 = a ? Date.parse(a) : NaN;
    const t1 = b ? Date.parse(b) : NaN;
    if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) return undefined;
    const h = (t1 - t0) / 3_600_000;
    return Number.isInteger(h) ? String(h) : h.toFixed(1);
}

const list = (nums: number[]): string =>
    nums.length <= 1 ? nums.join('') : `${nums.slice(0, -1).join(', ')} and ${nums[nums.length - 1]}`;

/** "Ended: …", the reason the card and the final result give (A4). Empty for a running search. */
export function endText(search: Search, trials: Trial[]): string {
    if (search.state !== 'ended') return '';
    const o = search.objective;
    const words = metricWords(o);
    const best = bestTrialOf(search, trials);
    const when = search.ended_at ? formatClock(search.ended_at) : '';
    switch (search.end_reason) {
        case 'target_reached': {
            const t = search.budget?.target;
            const hit = best && typeof best.score === 'number' && typeof t === 'number';
            return hit
                ? `Ended: target reached. Trial ${best.idx} reached ${words.short} ${scoreText(best.score, o)} (goal ${goalSign(o)} ${compactNumber(t)}).`
                : 'Ended: target reached.';
        }
        case 'budget_runs': {
            const n = search.budget?.max_runs;
            return typeof n === 'number' ? `Ended: budget used up. Runs limit reached (${n} of ${n}).` : 'Ended: budget used up.';
        }
        case 'budget_time':
            return 'Ended: compute time used up.';
        case 'patience': {
            const n = search.budget?.patience;
            const after = best ? trials.filter((t) => t.state === 'done' && t.idx > best.idx).map((t) => t.idx) : [];
            const shown = typeof n === 'number' ? after.slice(-n) : after;
            if (best && shown.length)
                return `Ended: no improvement. Trial${shown.length > 1 ? 's' : ''} ${list(shown)} did not beat trial ${best.idx}${typeof n === 'number' ? ` (patience ${n} runs)` : ''}.`;
            return 'Ended: no improvement.';
        }
        case 'time_limit': {
            const h = hoursBetween(search.started_at, search.ends_by);
            return h ? `Ended: the search reached its time limit (${h} h).` : 'Ended: the search reached its time limit.';
        }
        case 'compute_limit':
            return 'Ended: no compute calls left in this chat.';
        case 'stopped_by_user': {
            const stopped = trials.filter((t) => t.state === 'stopped' && t.stopped_by === 'user').pop();
            const tail = stopped
                ? `; trial ${stopped.idx} stopped${typeof stopped.epoch === 'number' ? ` at epoch ${stopped.epoch}` : ''} and is not considered`
                : '';
            return `Ended: stopped by you${when ? ` at ${when}` : ''}. The winner is chosen from finished trials${tail}.`;
        }
        case 'adopted': {
            const w = winnerOf(search, trials);
            return `Ended: you adopted ${w ? `trial ${w.idx}` : 'a trial'} as the result${when ? ` at ${when}` : ''}.`;
        }
        case 'start_failed': {
            const bad = trials.filter((t) => t.state === 'failed').pop();
            return `The platform could not run trials. ${bad ? `Trial ${bad.idx} did not start after 2 attempts` : 'A trial did not start after 2 attempts'}, so the search ended.`;
        }
        default:
            return 'Ended by the agent.';
    }
}

/** The final test of a search as the card tells it. */
export type TestView =
    | { kind: 'none'; text: string }
    | { kind: 'pending'; text: string }
    | { kind: 'running'; text: string }
    | { kind: 'measured'; accuracy?: number; images?: number; verdict?: string };

/** What a result check measured on the held-back images: the accuracy, how many images, the verdict. */
export function testResultOf(check: AssessCheck | undefined): { accuracy?: number; images?: number; verdict?: string } | undefined {
    const r = check?.report;
    if (!r || check?.state === 'failed') return undefined;
    const fig = r.figures as { overall?: { accuracy?: number }; accuracy?: number } | undefined;
    const accuracy = fig?.overall?.accuracy ?? fig?.accuracy;
    return { accuracy: typeof accuracy === 'number' ? accuracy : undefined, images: r.measured_images, verdict: r.verdict || undefined };
}

/** The result the gateway copied into `holdout.result`; used while the check is not loaded in the view. */
function resultOfHoldout(r: SearchHoldout['result']): { accuracy?: number; images?: number; verdict?: string } | undefined {
    if (!r || r.state === 'failed') return undefined;
    return { accuracy: r.accuracy, images: r.images, verdict: r.verdict };
}

export function testView(search: Search, trials: Trial[], check?: AssessCheck): TestView | undefined {
    if (search.state !== 'ended') return undefined;
    const ho = search.holdout;
    const winner = winnerOf(search, trials) ?? bestTrialOf(search, trials);
    if (!winner) return { kind: 'none', text: 'No finished trial – no final test.' };
    if (!ho?.available || ho.final_state === 'none') return { kind: 'none', text: 'No test set — the final test is skipped.' };
    if (ho.final_state === 'started') {
        const res = testResultOf(check) ?? resultOfHoldout(ho.result);
        return res ? { kind: 'measured', ...res } : { kind: 'running', text: 'Final test running' };
    }
    const n = ho.images ?? ho.eval_dataset?.images;
    return {
        kind: 'pending',
        text: `Final test pending · runs once for trial ${winner.idx}${n ? ` on ${n} held-back images` : ''}`,
    };
}

// ---------------------------------------------------------------------------------------------------------------
// Missing data in the charts (G1)
// ---------------------------------------------------------------------------------------------------------------

export type Missing = { icon: 'wait' | 'chart' | 'gpu' | 'sync'; title: string; caption: string };

/** Why a figure chart has no curve, in the words of the design; undefined when there is one. */
export function figuresMissing(t: Pick<Trial, 'figures' | 'state'>, epochs: EpochRow[]): Missing | undefined {
    if (epochs.length > 0) return undefined;
    if (t.figures === 'none') return { icon: 'chart', title: 'This training writes no figures', caption: 'This template reports no values per epoch; the log below shows the run.' };
    if (t.state === 'failed' || t.state === 'stopped')
        return { icon: 'chart', title: 'No figures', caption: 'The trial ended before the first epoch finished.' };
    return { icon: 'wait', title: 'No figures yet', caption: 'The first epoch has not finished.' };
}

/** Why the GPU chart has no curve; undefined when there is one. */
export function gpuMissing(t: Pick<Trial, 'gpu_available' | 'state' | 'path'>, gpu: GpuPoint[]): Missing | undefined {
    if (gpu.length > 0) return undefined;
    if (t.gpu_available === false) return { icon: 'gpu', title: 'No GPU in this run', caption: t.path === 'notebook' ? 'It runs on the CPU of your notebook server.' : 'It runs on the CPU of the platform.' };
    if (t.gpu_available === true && isOpen(t as Trial))
        return { icon: 'wait', title: 'No GPU samples yet', caption: 'The first sample comes within a few seconds.' };
    return { icon: 'sync', title: 'GPU data not available', caption: 'The platform sent no GPU figures for this run.' };
}

// ---------------------------------------------------------------------------------------------------------------
// The log
// ---------------------------------------------------------------------------------------------------------------

const ERROR_LINE = /(^|\W)(error|traceback|exception|out of memory|killed|segmentation fault|exit [1-9]\d*|failed)(\W|$)/i;

/** The last `max` lines of a log tail; empty lines at the end are dropped. */
export function logTailLines(text: string | undefined, max = 20): string[] {
    const all = (text ?? '').split('\n');
    while (all.length > 0 && all[all.length - 1].trim() === '') all.pop();
    return all.slice(-max);
}

/** The index of the first line from which the log is marked as an error; -1 when it holds none. */
export function firstErrorLine(lines: string[]): number {
    return lines.findIndex((l) => ERROR_LINE.test(l));
}

// ---------------------------------------------------------------------------------------------------------------
// Tool calls of the search (the lines of a refused call, G2, G14, A10)
// ---------------------------------------------------------------------------------------------------------------

export type SearchTool = 'propose_search' | 'search_next';

const TOOL_NAMES: Record<string, SearchTool> = {
    propose_search: 'propose_search',
    mcp_platform_propose_search: 'propose_search',
    'platform.propose_search': 'propose_search',
    search_next: 'search_next',
    mcp_platform_search_next: 'search_next',
    'platform.search_next': 'search_next',
};

const CLI_COMMANDS: Record<string, SearchTool> = { 'propose-search': 'propose_search', 'search-next': 'search_next' };

/** The search tool a step called: the MCP tool, or `agw-platform propose-search` / `search-next` in a `bash` call. */
export function searchToolOf(step: { tool?: string; name?: string; args?: unknown }): SearchTool | undefined {
    const direct = (step.name && TOOL_NAMES[step.name]) || (step.tool && TOOL_NAMES[step.tool]);
    if (direct) return direct;
    const a = step.args;
    const command = typeof a === 'string' ? a : a && typeof a === 'object' && typeof (a as { command?: unknown }).command === 'string' ? (a as { command: string }).command : undefined;
    if (!command) return undefined;
    const w = shellWords(command);
    for (let i = 0; i < w.length; i++) {
        const cur = w[i];
        if ('sep' in cur || !/(^|\/)agw-platform$/.test(cur.w)) continue;
        const sub = w[i + 1];
        if (sub && !('sep' in sub) && CLI_COMMANDS[sub.w]) return CLI_COMMANDS[sub.w];
    }
    return undefined;
}

/** The gateway's refusal in one line: no exit-code or HTTP noise in front, no more than 240 characters. */
export function refusalText(text: string | undefined): string {
    const lines = (text ?? '')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
    const pick = lines.find((l) => !/^(\$|exit code|http \d)/i.test(l)) ?? lines[0] ?? 'refused';
    const clean = pick.replace(/^(error|refused|invalid|bad request)\s*[:-]\s*/i, '').replace(/^(error|refused)\s*[:-]\s*/i, '');
    return clean.length > 240 ? `${clean.slice(0, 239)}…` : clean;
}
