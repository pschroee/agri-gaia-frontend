// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// What the plan dialog, the panel view and the plan card say about the steps of a plan (issue #221): the line under a
// step's title, what a step waits for, the arguments with their placeholders resolved, the times, the result check of a
// deployment and the head line of the dialog. Pure logic (unit-tested); the rows are components/plan/.

import { figuresOf } from './assess';
import { isSecretKey, REDACTED } from './stepDetail';
import { currentStepIndex, doneSteps, outputLink, planLabel, stepPhase } from './plan';
import type { EpochFigures, Plan, PlanStep, StepPhase } from './plan';
import type { WatchJob } from './jobs';
import { uncoveredText } from './planText';
import type { AssessCheck, DeploymentFigures } from './types';

/** Placeholder of a later step for the object an earlier one created: `{{step5.id}}`. */
const PLACEHOLDER = /\{\{step([1-9][0-9]?)\.id\}\}/g;

/** States in which the plan is on a step: the rows highlight the step `currentIdx` names. */
const CURRENT_STATES: Plan['state'][] = ['approved', 'paused', 'failed'];

/** The step a running plan is on (highlighted, opened); undefined once the plan is over or before it started. */
export function currentIdx(plan: Plan): number | undefined {
    if (!CURRENT_STATES.includes(plan.state) || plan.steps.length === 0) return undefined;
    return currentStepIndex(plan);
}

// --- times --------------------------------------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0');

/** Local time as hh:mm (24 h). */
export function clock(t: number): string {
    const d = new Date(t);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Local time as hh:mm:ss (24 h). */
export function clockSeconds(t: number): string {
    const d = new Date(t);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** A duration as hh:mm:ss. */
export function hms(ms: number): string {
    const s = Math.max(0, Math.round(ms / 1000));
    return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** "45 s", "23 min", "1 h 12 min": the coarse duration of the head line. */
export function coarse(ms: number): string {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return `${s} s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    return m % 60 > 0 ? `${h} h ${m % 60} min` : `${h} h`;
}

const parse = (v: string | undefined): number | undefined => {
    if (!v) return undefined;
    const t = Date.parse(v);
    return Number.isNaN(t) ? undefined : t;
};

/** The times of a step: its start (the gateway's own, else the job's), its end and the duration so far or in all. */
export type StepTimes = { started?: number; finished?: number; durationMs?: number };

export function stepTimes(step: PlanStep, job?: WatchJob, now: number = Date.now()): StepTimes {
    const started = parse(step.step_started_at) ?? parse(job?.started_at) ?? parse(step.started_at);
    const finished = step.state === 'done' || step.state === 'failed' ? parse(step.done_at) : undefined;
    if (started === undefined) return { ...(finished !== undefined ? { finished } : {}) };
    if (finished !== undefined) return { started, finished, durationMs: Math.max(0, finished - started) };
    const live = step.state === 'running' || step.state === 'waiting';
    return { started, ...(live ? { durationMs: Math.max(0, now - started) } : {}) };
}

/** The meta cell at the right of a step row: the runtime of a live step, the duration of a finished one. */
export function stepMeta(step: PlanStep, job: WatchJob | undefined, now: number): string {
    const t = stepTimes(step, job, now);
    return t.durationMs === undefined ? '' : coarse(t.durationMs);
}

/** The head line of the dialog: "3 of 10 steps done · started 15:51 · running for 23 min". */
export function planHeadLine(plan: Plan, now: number): string {
    const head = `${doneSteps(plan)} of ${plan.steps.length} steps done`;
    const began = parse(plan.decided_at);
    if (plan.mode !== 'autonomous' || began === undefined) return `${head} · ${planLabel(plan, now)}`;
    const ended = parse(plan.ended_at);
    if (ended !== undefined) return `${head} · started ${clock(began)} · took ${coarse(ended - began)}`;
    return `${head} · started ${clock(began)} · running for ${coarse(now - began)}`;
}

// --- the live part of a step ------------------------------------------------------------------------------------

/** The step with the job's fresher figures laid over it (the job arrives by its own event). */
export function withJob(step: PlanStep, job: WatchJob | undefined): PlanStep {
    if (!job) return step;
    return {
        ...step,
        ...(job.progress !== undefined ? { progress: job.progress } : {}),
        ...(job.message ? { progress_msg: job.message } : {}),
        ...(job.eta ? { eta: job.eta } : {}),
        ...(job.log_tail ? { log_tail: job.log_tail } : {}),
        ...(job.started_at ? { started_at: job.started_at } : {}),
        ...(job.last_epoch ? { last_epoch: job.last_epoch } : {}),
    };
}

/** Up to `max` figures of an epoch, those whose name has `val` first; each as the name and three significant digits. */
export function metricPairs(e: EpochFigures | undefined, max: number): { key: string; value: string }[] {
    const values = e?.values ?? {};
    const keys = Object.keys(values).filter((k) => Number.isFinite(values[k]));
    const ordered = [...keys.filter((k) => k.includes('val')), ...keys.filter((k) => !k.includes('val'))];
    return ordered.slice(0, max).map((key) => ({ key, value: values[key].toPrecision(3) }));
}

/** "Epoch 3 of 10 · val_accuracy 0.912 · loss 0.231" (at most two figures); '' without an epoch. */
export function epochLine(e: EpochFigures | undefined): string {
    if (!e || !Number.isFinite(e.epoch)) return '';
    const head = e.epochs && e.epochs > 0 ? `Epoch ${e.epoch} of ${e.epochs}` : `Epoch ${e.epoch}`;
    return [head, ...metricPairs(e, 2).map((m) => `${m.key} ${m.value}`)].join(' · ');
}

// --- placeholders, arguments and the request --------------------------------------------------------------------

/** The noun of a created object as the lines name it. */
export function resourceNoun(resource: string | undefined): string {
    const res = (resource ?? '').toLowerCase();
    if (res.startsWith('dataset')) return 'dataset';
    if (res.startsWith('model')) return 'model';
    if (res.startsWith('training')) return 'training container';
    if (res.startsWith('deployment') || res.startsWith('container_deployment') || res.startsWith('container-deployment'))
        return 'deployment';
    if (res.startsWith('image') || res.startsWith('container')) return 'image';
    return 'resource';
}

/** The numbers of the steps a text names with `{{stepN.id}}`. */
function placeholderNumbers(text: string): number[] {
    return [...new Set([...text.matchAll(PLACEHOLDER)].map((m) => Number(m[1])))];
}

/** Everything of a step that may carry a placeholder, as one text. */
function placeholderText(step: PlanStep): string {
    return [step.path ?? '', JSON.stringify(step.args ?? ''), JSON.stringify(step.query ?? ''), JSON.stringify(step.body ?? ''), JSON.stringify(step.form ?? '')].join(' ');
}

/** The steps a step needs: the numbers its placeholders name that are not done yet, ascending. */
export function unfinishedRefs(plan: Plan, step: PlanStep): number[] {
    return placeholderNumbers(placeholderText(step))
        .filter((n) => {
            const ref = plan.steps.find((s) => s.idx === n);
            return !ref || ref.state !== 'done';
        })
        .sort((a, b) => a - b);
}

/** The path with every placeholder of a done step replaced by its object; undefined while nothing changed. */
export function resolvedPath(step: PlanStep, plan: Plan): string | undefined {
    const path = step.path ?? '';
    const out = path.replace(PLACEHOLDER, (m, n: string) => {
        const ref = plan.steps.find((s) => s.idx === Number(n));
        return ref && ref.state === 'done' && ref.created_id ? ref.created_id : m;
    });
    return out === path ? undefined : out;
}

function queryText(q: Record<string, unknown> | undefined): string {
    if (!q || Object.keys(q).length === 0) return '';
    return '?' + new URLSearchParams(Object.entries(q).map(([k, v]) => [k, String(v)])).toString();
}

/** The call of a step as one line: "PUT /container-deployments/{{step9.id}}/deploy". */
export function requestLine(step: PlanStep): string {
    return `${step.method} ${step.path}${queryText(step.query)}`.trim();
}

/** The call with its placeholders resolved, when some are: "PUT /container-deployments/6/deploy". */
export function resolvedRequest(step: PlanStep, plan: Plan): string | undefined {
    const path = resolvedPath(step, plan);
    return path === undefined ? undefined : `${step.method} ${path}${queryText(step.query)}`.trim();
}

/** What a placeholder in a value stands for: the object, or "not known yet". */
export type ArgRef = { step: number; known: boolean; text: string; href?: string };

/** One row of the arguments table. */
export type ArgRow = { name: string; value: string; ref?: ArgRef };

const MAX_VALUE = 120;

/** A value as the table shows it: text as it is, anything else as compact JSON of at most 120 characters. */
function valueText(v: unknown): string {
    if (typeof v === 'string') return v;
    if (v === null || v === undefined) return '';
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    const json = JSON.stringify(v);
    return json.length > MAX_VALUE ? `${json.slice(0, MAX_VALUE - 1)}…` : json;
}

function refOf(value: string, plan: Plan): ArgRef | undefined {
    const m = /\{\{step([1-9][0-9]?)\.id\}\}/.exec(value);
    if (!m) return undefined;
    const n = Number(m[1]);
    const ref = plan.steps.find((s) => s.idx === n);
    if (!ref || ref.state !== 'done' || !ref.created_id) {
        return { step: n, known: false, text: `→ not known yet (step ${n})` };
    }
    const device = ref.args?.device_id;
    const href = outputLink({
        resource: ref.created_resource ?? '',
        id: ref.created_id,
        ...(typeof device === 'string' || typeof device === 'number' ? { device_id: String(device) } : {}),
    });
    return { step: n, known: true, text: `→ ${resourceNoun(ref.created_resource)} ${ref.created_id}`, ...(href ? { href } : {}) };
}

function rowsOf(prefix: string, obj: Record<string, unknown>, plan: Plan): ArgRow[] {
    return Object.keys(obj).map((k) => {
        const secret = isSecretKey(k);
        const value = secret ? REDACTED : valueText(obj[k]);
        const ref = secret ? undefined : refOf(value, plan);
        return { name: prefix ? `${prefix} · ${k}` : k, value, ...(ref ? { ref } : {}) };
    });
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * The rows of a step's arguments: the tool's `args`, else the keys of the body, then the query and the form. A secret
 * key shows `[redacted]`; a placeholder names the object it stands for, or says it is not known yet.
 */
export function argRows(step: PlanStep, plan: Plan): ArgRow[] {
    const rows: ArgRow[] = [];
    if (step.args && Object.keys(step.args).length > 0) rows.push(...rowsOf('', step.args, plan));
    else if (isRecord(step.body)) rows.push(...rowsOf('', step.body, plan));
    else if (step.body !== undefined && step.body !== null) rows.push(...rowsOf('', { body: step.body }, plan));
    if (step.query && Object.keys(step.query).length > 0) rows.push(...rowsOf('query', step.query, plan));
    if (step.form && Object.keys(step.form).length > 0) rows.push(...rowsOf('form', step.form, plan));
    return rows;
}

// --- what a step waits for and says -----------------------------------------------------------------------------

/** The words per job kind (the gateway's kinds and the names the plan uses for them). */
const JOB_WAIT: Record<string, string> = {
    task: 'The platform task to finish',
    platform_task: 'The platform task to finish',
    training: 'The training run to finish',
    training_run: 'The training run to finish',
    image: 'The image build to finish',
    image_build: 'The image build to finish',
    edge_deployment: 'The device to start the container',
    assessment: 'The check to finish',
    notebook_run: 'The notebook run to finish',
};

const GENERIC_JOB = 'The platform job to finish';

/** Whether a step is finished for the purpose of "waits for step N". */
const finished = (s: PlanStep) => s.state === 'done' || s.state === 'skipped';

/** The step an open step waits for: the highest unfinished placeholder, else the step before it; undefined when none. */
export function waitsForStep(plan: Plan, step: PlanStep): number | undefined {
    const refs = unfinishedRefs(plan, step).filter((n) => n < step.idx);
    if (refs.length > 0) return Math.max(...refs);
    const earlier = plan.steps.some((s) => s.idx < step.idx && !finished(s));
    return earlier ? step.idx - 1 : undefined;
}

/**
 * What the step waits for, in one phrase after "Waiting for": the user's approval, the platform job, the user to
 * resume the plan, an earlier step or the agent. undefined for a step that is over or waits for nothing.
 */
export function waitingFor(
    plan: Plan,
    step: PlanStep,
    pending: ReadonlySet<string>,
    job: WatchJob | undefined,
    working?: boolean,
): string | undefined {
    if (plan.state === 'proposed') return 'Your approval of the plan';
    if (step.state === 'done' || step.state === 'failed' || step.state === 'skipped') return undefined;
    if (plan.state === 'cancelled' || plan.state === 'failed') return undefined;
    if (step.parked_approval && pending.has(step.parked_approval)) return 'Your approval of this step in the chat';
    if (step.state === 'waiting') return JOB_WAIT[job?.kind ?? ''] ?? GENERIC_JOB;
    if (step.state === 'running') return undefined;
    if (plan.state === 'paused') {
        const reason = plan.pause_reason ?? '';
        if (reason === 'login') return 'You to sign in again';
        if (reason.startsWith('budget')) return 'You to resume the plan (budget reached)';
        return 'You to resume the plan';
    }
    if (plan.state !== 'approved') return undefined;
    const n = waitsForStep(plan, step);
    if (n !== undefined) return `Step ${n} to finish`;
    return working ? 'The agent to make the call' : "The agent's next turn";
}

/** The line of a step that asks you again, with the reason where the gateway names one: the wording of #219. */
export const askLine = (step: PlanStep): string => uncoveredText(step);

/** The words for the first line of a result (a failed step's message). */
const firstLine = (text: string | undefined): string => (text ?? '').split('\n').find((l) => l.trim() !== '')?.trim() ?? '';

/** How a subline is drawn. */
export type SublineTone = 'muted' | 'red' | 'amber';

/** What the line under a step's title says (design): the epoch, the message, the object created, the error, the reason. */
export function stepSubline(
    plan: Plan,
    step: PlanStep,
    phase: StepPhase,
    job: WatchJob | undefined,
): { text: string; tone: SublineTone } {
    if (phase === 'failed') {
        const line = firstLine(step.result);
        return { text: line || 'Failed', tone: 'red' };
    }
    if (!step.covered && (phase === 'approval' || phase === 'open' || phase === 'starting' || phase === 'queued')) {
        return { text: askLine(step), tone: 'amber' };
    }
    if (phase === 'running' || phase === 'paused') {
        const live = withJob(step, job);
        const epoch = epochLine(live.last_epoch);
        if (epoch) return { text: epoch, tone: 'muted' };
        const msg = (live.progress_msg ?? '').trim();
        return { text: msg || (phase === 'paused' ? 'Paused' : 'Running'), tone: 'muted' };
    }
    if (phase === 'done') {
        if (step.created_id) return { text: `Created ${resourceNoun(step.created_resource)} ${step.created_id}`, tone: 'muted' };
        return { text: 'Done', tone: 'muted' };
    }
    if (phase === 'open' || phase === 'queued' || phase === 'starting') {
        const n = waitsForStep(plan, step);
        return { text: n !== undefined ? `Waiting for step ${n}` : '', tone: 'muted' };
    }
    return { text: '', tone: 'muted' };
}

/** The phase of a step (shared with the card); re-exported so a row needs one import. */
export const phaseOf = stepPhase;

// --- the check of a deployment ----------------------------------------------------------------------------------

/** The id of the deployment a step creates or starts, from its result or its resolved path; undefined for any other. */
export function deploymentIdOf(step: PlanStep, plan: Plan): number | undefined {
    if (resourceNoun(step.created_resource) === 'deployment' && step.created_id) {
        const n = Number(step.created_id);
        return Number.isFinite(n) ? n : undefined;
    }
    const path = resolvedPath(step, plan) ?? step.path ?? '';
    const m = /\/container-deployments\/(\d+)(?:\/|$)/.exec(path);
    return m ? Number(m[1]) : undefined;
}

/** The check of a deployment and what it measured, in the words of the step's "Checks" block. */
export type StepCheck = { line: string; device: string; checkId: string; toolCallId?: string };

export function stepCheck(step: PlanStep, plan: Plan, checks: readonly AssessCheck[] | undefined): StepCheck | undefined {
    if (!checks || checks.length === 0) return undefined;
    const id = deploymentIdOf(step, plan);
    if (id === undefined) return undefined;
    const check = [...checks]
        .reverse()
        .find((c) => c.kind === 'deployment' && c.report && (figuresOf(c) as DeploymentFigures | undefined)?.deployment?.id === id);
    if (!check) return undefined;
    const fig = figuresOf(check) as DeploymentFigures;
    const parts = [fig.ready ? 'Ready' : 'Not ready'];
    if (fig.requests > 0) {
        parts.push(`${fig.requests} test ${fig.requests === 1 ? 'request' : 'requests'}`);
        if (fig.roundtrip_ms && Number.isFinite(fig.roundtrip_ms.median))
            parts.push(`median ${Math.round(fig.roundtrip_ms.median)} ms`);
        if (fig.argmax_same !== null && fig.argmax_same !== undefined)
            parts.push(`same top class ${fig.argmax_same}/${fig.requests}`);
    } else {
        parts.push('no test requests sent');
    }
    const device = fig.device?.name ? `${fig.device.name}${fig.device.simulated ? ' (simulated)' : ''}` : '';
    return { line: parts.join(' · '), device, checkId: check.check_id, ...(check.tool_call_id ? { toolCallId: check.tool_call_id } : {}) };
}

// --- the activity of a step -------------------------------------------------------------------------------------

/** Query for the calls of one plan step: `?plan=<id>&step=<n>&limit=20` (gateway issue #221). */
export function activityQuery(planId: string, idx: number): string {
    const q = new URLSearchParams({ plan: planId, step: String(idx), limit: '20' });
    return `?${q.toString()}`;
}
