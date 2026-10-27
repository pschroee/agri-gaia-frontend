// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The words of the plan card (A-E4, design `prototyp/entwuerfe/autonomous-plan/README.md`). Pure functions, so
// the wording the design fixes can be checked without rendering the card; the components only compose them.
//
// Two wordings the design shows are left out because the gateway does not deliver their data (the plan's
// *Haltepunkte*, "the draft wants fields E1/E2 do not carry"): the time a plan was paused at (the plans table has
// no paused_at; only a cancelled or completed plan carries `ended_at`) and one line per failed attempt (only the
// step's last `result` survives). Where the card names a time, it is a time the gateway sends.

import {
    createdStay,
    createdSubject,
    createdSingular,
    currentStepIndex,
    doneSteps,
    durationText,
    stepMain,
    isAutonomous,
    Plan,
    PlanStep,
    StepRef,
} from './plan';

/** Why the gateway paused a plan: the user's own pause, an abort, a lost login, a budget or a restart. */
export type PauseReason = 'user' | 'abort' | 'login' | 'budget_turns' | 'budget_cost' | 'restart' | 'failed_calls' | '';

/** Local time hh:mm. */
const clock = (iso: string | undefined): string => {
    const t = iso ? Date.parse(iso) : NaN;
    if (Number.isNaN(t)) return '';
    return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
};

/** Local date and time, for a plan that ends on another day. */
const dayClock = (t: number): string =>
    new Date(t).toLocaleString([], {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });

/**
 * The chip in the card's header (design): "Needs approval", "Running", "Waiting for platform" (in the 400 px panel
 * only "Waiting"), "Needs input", "Paused", "Completed", "Failed", "Cancelled".
 */
export function planChip(plan: Plan, layout: 'panel' | 'page', pending: ReadonlySet<string>): string {
    switch (plan.state) {
        case 'proposed':
            return plan.approving ? 'Approving…' : 'Needs approval';
        case 'approved':
            if (plan.steps.some((s) => !!s.parked_approval && pending.has(s.parked_approval as string))) {
                return 'Needs input';
            }
            if (plan.steps.some((s) => s.state === 'waiting'))
                return layout === 'panel' ? 'Waiting' : 'Waiting for platform';
            return 'Running';
        case 'paused':
            return 'Paused';
        case 'completed':
            return 'Completed';
        case 'failed':
            return 'Failed';
        case 'cancelled':
            return 'Cancelled';
        case 'rejected':
            return 'Not approved';
        case 'expired':
            return 'Expired';
        default:
            return 'Replaced';
    }
}

/** The title of the pause banner, one wording per reason (L2 and the design decisions). */
export function pauseTitle(reason: string): string {
    switch (reason as PauseReason) {
        case 'abort':
            return 'Paused – you stopped the agent';
        case 'login':
            return 'Paused – platform login lost';
        case 'budget_turns':
            return 'Paused – turn budget used up';
        case 'budget_cost':
            return 'Paused – model cost limit reached';
        case 'restart':
            return 'Paused – agent gateway restarted';
        case 'failed_calls':
            return 'Paused – stopped after failed tool calls in a row';
        default:
            return 'Paused by you';
    }
}

/** The text of the pause banner, one wording per reason (L2 and the design decisions). */
export function pauseText(plan: Plan): string {
    const step = currentStepIndex(plan);
    switch ((plan.pause_reason ?? '') as PauseReason) {
        case 'abort':
            return `You stopped the agent. Running platform jobs keep running. Step ${step} starts when you resume.`;
        case 'login':
            return 'Your session expired. The plan resumes by itself when you open any platform page again. The training job keeps running.';
        case 'budget_turns':
        case 'budget_cost':
            return 'The budget cannot be raised. Cancel the plan, or ask the agent for a new plan with a larger budget.';
        case 'restart':
            return 'The gateway restarted and restored this plan. The training job was not affected.';
        case 'failed_calls':
            return `The gateway stopped the agent after too many failed tool calls in a row. Step ${step} starts when you resume.`;
        default:
            return `The training job keeps running on the platform. Step ${step} starts when you resume.`;
    }
}

/**
 * The extra line of a restart pause whose step was on its way when the gateway went down (D3.4): the user has to
 * look at the platform before the plan may repeat the call.
 */
export const RESTART_INTERRUPTED = 'A step was interrupted; check the platform before you resume.';

/** Whether the card offers "Resume": every pause except the two budget reasons (design decision, D1.13). */
export const resumeAllowed = (plan: Plan): boolean =>
    plan.state === 'paused' && plan.pause_reason !== 'budget_turns' && plan.pause_reason !== 'budget_cost';

/** Whether the card offers "Pause": while the plan runs or waits. */
export const pauseAllowed = (plan: Plan): boolean => plan.state === 'approved';

/** Whether the card offers "Cancel plan": every plan that is still running or paused. */
export const cancelAllowed = (plan: Plan): boolean => plan.state === 'approved' || plan.state === 'paused';

/**
 * Whether a step offers "Stop job" (design, D2.9): it observes a platform job and that job runs. Which kinds can be
 * stopped at all is the gateway's rule (it answers 409 otherwise, which the card shows as an error).
 */
export const stopJobAllowed = (step: PlanStep | undefined, jobState: string | undefined): boolean =>
    !!step?.watch_job && jobState === 'running';

/** The title of the failure banner: "Step 3 failed after 2 attempts" (design). */
export function failedTitle(plan: Plan): string {
    const failed = plan.steps.find((s) => s.state === 'failed');
    if (!failed) return 'The plan failed';
    const attempts = failed.attempts ?? 1;
    return `Step ${failed.idx} failed after ${attempts} ${attempts === 1 ? 'attempt' : 'attempts'}`;
}

/** The line under the failure banner: what stays and what did not run (design). */
export function failedText(plan: Plan): string {
    const failed = plan.steps.find((s) => s.state === 'failed');
    if (!failed) return '';
    const n = plan.steps.length;
    const parts: string[] = [];
    parts.push(failed.idx > 1 ? `Steps 1–${failed.idx - 1} are done and stay.` : 'No step before this one ran.');
    if (failed.idx < n) parts.push(`Step ${failed.idx + 1} did not run.`);
    return parts.join(' ');
}

/** What the design offers under a failed plan (W1): no buttons, the way on is the chat. */
export const FAILED_HINT = 'To try again, ask the agent in the chat for a new plan.';

/** "All 4 steps done in 41 min, without further input." (design); '' while the times are missing. */
export function completedText(plan: Plan): string {
    const n = plan.steps.length;
    const began = plan.decided_at ? Date.parse(plan.decided_at) : NaN;
    const ended = plan.ended_at ? Date.parse(plan.ended_at) : NaN;
    const took = Number.isNaN(began) || Number.isNaN(ended) ? '' : ` in ${durationText(ended - began)}`;
    return `All ${n} ${n === 1 ? 'step' : 'steps'} done${took}, without further input.`;
}

/**
 * The sentence of a cancelled plan (W2, design decision): the platform jobs were not stopped unless the user
 * stopped them, and nothing pretends otherwise.
 */
export function cancelledText(plan: Plan): string {
    const at = clock(plan.ended_at);
    const when = at ? ` at ${at}` : '';
    return `Cancelled by you${when}. Running platform jobs were not stopped.`;
}

/** The line of the step the plan was cancelled on (W2), with the job's fate. */
export function cancelledStepLine(plan: Plan, stopped: boolean): string {
    return stopped ? 'Training job stopped' : 'Cancelled · the training job keeps running on the platform';
}

/**
 * The explanation above the decision on a proposed plan. The steps run inside the plan's budget instead of the
 * 30 minutes an interactive plan gets.
 */
export function approvalExplain(plan: Plan): string {
    const n = plan.steps.length;
    const irreversible = plan.steps.filter((s) => s.effect === 'irreversible');
    const within = isAutonomous(plan) ? 'within the budget' : 'for 30 minutes';
    const head = `Approving runs ${
        n === 1 ? 'this step' : `these ${n} steps`
    } in this order with exactly these parameters, ${within}.`;
    if (irreversible.length === 0) return `${head} No step of this plan is irreversible.`;
    const first = irreversible[0].idx;
    const many = irreversible.length > 1;
    return `${head} Step ${first} is irreversible and still asks you on its own${
        many ? ', as do the other irreversible steps' : ''
    }.`;
}

/** What the "Change" button does, under the decision (design). */
export const CHANGE_HINT = 'Change rejects this plan; tell the agent what to change.';

/** The line above an embedded step approval: what rejecting it means (design, L10). */
export function rejectText(plan: Plan, step: PlanStep): string {
    const stay = createdStay(plan);
    const head = `Reject skips step ${step.idx} and ends the plan.`;
    return stay ? `${head} ${stay}` : head;
}

/** The sentence that closes the rights block of a proposed plan (design). */
export const RIGHTS_END_TEXT = 'Rights end when the plan completes, is cancelled or the budget runs out.';

/** The label and the hint of the browser notification checkbox (design). */
export const NOTIFY_LABEL = 'Notify me in the browser';
export const NOTIFY_HINT = 'When the plan completes, fails or needs your input. Your browser asks for permission once.';
export const NOTIFY_ON_TEXT = 'On · completes, fails, needs input';
export const NOTIFY_BLOCKED_TEXT =
    "Notifications are blocked for this site. Allow them in your browser's site settings. You still get the in-app snackbar.";

/** The overlines of the proposed card's blocks (design). */
export const BUDGET_OVERLINE = 'BUDGET';
export const RIGHTS_OVERLINE = 'RIGHTS WHILE IT RUNS';
export const CREATED_OVERLINE = 'CREATED';

/** The rows of the budget block (design, L12). */
export const BUDGET_ROWS = {
    duration: 'Max duration',
    cost: 'Model cost limit',
    turns: 'Turns without you',
    compute: 'Compute calls',
} as const;

/** "2 h · ends today 16:51" (L12): the maximum duration with the time the plan would end at. */
export function maxDurationText(plan: Plan, now: number): string {
    const secs = plan.budget?.max_duration_s ?? 0;
    if (secs <= 0) return '';
    const began = plan.decided_at ? Date.parse(plan.decided_at) : now;
    const ends = began + secs * 1000;
    const sameDay = new Date(ends).toDateString() === new Date(now).toDateString();
    const tomorrow = new Date(now + 24 * 3600 * 1000).toDateString() === new Date(ends).toDateString();
    const h = Math.floor(secs / 3600);
    const m = Math.round((secs % 3600) / 60);
    const dur = m > 0 ? `${h} h ${m} min` : `${h} h`;
    if (sameDay) return `${dur} · ends today ${clock(new Date(ends).toISOString())}`;
    if (tomorrow) return `${dur} · ends tomorrow ${clock(new Date(ends).toISOString())}`;
    return `${dur} · ends ${dayClock(ends)}`;
}

/** "0.42 USD": one value of the budget block. */
export const moneyText = (v: number): string => `${v.toFixed(2)} USD`;

/** "2 (training)": the compute calls with the kinds the plan uses (L12); "0" without any. */
export function computeText(plan: Plan): string {
    const used = plan.usage?.compute_used ?? 0;
    if (used === 0) return '0';
    // the gateway names no kinds per call; a training is the only compute call the cards know
    const kinds = plan.steps.some((step) => step.effect === 'compute') ? ['training'] : [];
    return kinds.length === 0 ? String(used) : `${used} (${kinds.join(', ')})`;
}

/** The line of a right in the rights block (L13): the gateway's text, unchanged. */
export const rightText = (text: string): string => text;

/** The addition on an irreversible step's row (design). */
export const IRREVERSIBLE_HINT = 'asks you each time';

/** The addition on a compute step's row in a proposed plan (L6). */
export function computeStepLine(plan: Plan, step: PlanStep): string {
    const usage = plan.usage;
    const max = usage?.compute_max ?? 0;
    const left = Math.max(0, max - (usage?.compute_used ?? 0));
    if (step.effect !== 'compute' || max <= 0) return '';
    return `Uses compute time · ${left} of ${max} compute calls left`;
}

/** The addition on a step the plan does not cover (L6, D2.8). */
export const ASKS_AGAIN = 'Asks you again before it runs';

/** Why a step asks again, by the gateway's code (#219). Unknown or missing code: the plain ASKS_AGAIN. */
export function uncoveredText(step: PlanStep): string {
    switch (step.uncovered_reason) {
        case 'irreversible':
            return `${ASKS_AGAIN}: it cannot be undone`;
        case 'image_origin':
            return `${ASKS_AGAIN}: it starts an image on a device that this plan does not build`;
        case 'runs_code':
            return `${ASKS_AGAIN}: it runs code the gateway cannot check`;
        default:
            return ASKS_AGAIN;
    }
}

/** Where the image of a covered deployment start comes from (#219); '' without a traced origin. */
export function imageOriginText(step: PlanStep): string {
    const origin = step.image_origin;
    if (!origin) return '';
    if (origin.plan_id) {
        return `Covered by this approval: the image was built in step ${origin.step} of the plan this one replaces`;
    }
    return `Covered by this approval: the image is built in step ${origin.step}`;
}

/** The line over the decision buttons: which steps ask again on their own; '' when none (#219). */
export function uncoveredSummary(plan: Plan): string {
    const idx = plan.steps.filter((s) => !s.covered && s.state !== 'done').map((s) => s.idx);
    if (idx.length === 0) return '';
    if (idx.length === 1) return `Step ${idx[0]} asks you again on its own`;
    const list = `${idx.slice(0, -1).join(', ')} and ${idx[idx.length - 1]}`;
    return `Steps ${list} ask you again on their own`;
}

/**
 * "Waiting for your approval · waiting 4 min": how long the step has waited, from the approval's own time.
 * Without a usable time only the first part.
 */
export function waitingForApproval(createdAt: string | undefined, now: number): string {
    const since = createdAt ? Date.parse(createdAt) : NaN;
    if (Number.isNaN(since)) return 'Waiting for your approval';
    return `Waiting for your approval · waiting ${durationText(now - since)}`;
}

/** The line about the agent's own words on a card (design): what the gateway did not check. */
export const AGENT_TITLE_LABEL = "Agent's title – not verified";
export const AGENT_NOTE_LABEL = "Agent's note – not verified";

/** The info banner of a plan that waits for the platform (design). */
export const WAITING_INFO =
    'The training runs on the platform. The agent is idle while it waits and uses no turns or model cost.';

/** The collapsed log switch (design). */
export const LOG_SWITCH = 'Log · last 20 lines';

/** How many lines of a job's log tail the card shows. */
export const LOG_LINES = 20;

/** The last LOG_LINES lines of a log tail, newest last. */
export function logTail(text: string | undefined, lines: number = LOG_LINES): string {
    const all = (text ?? '').split('\n').filter((l) => l !== '');
    return all.slice(-lines).join('\n');
}

// --- the status tab (design) ---------------------------------------------------------------------

export const RUNNING_PLANS = 'RUNNING PLANS';
export const STATUS_EMPTY = 'No plans running.';
export const STATUS_COLUMNS = ['Plan', 'Chat', 'Step', 'Progress', 'Budget left', 'Open'] as const;

/** "3 across 3 chats · updated 15:14:02" (design). */
export function runningPlansLine(count: number, chats: number, updatedAt: string): string {
    return `${count} across ${chats} ${chats === 1 ? 'chat' : 'chats'} · updated ${updatedAt}`;
}

/** The progress cell of the status table (L21). */
export function statusProgress(plan: Plan, now: number): string {
    const step = plan.steps.find((s) => s.state === 'running' || s.state === 'waiting');
    if (plan.state === 'paused') return `Paused since ${clock(plan.ended_at) || '—'}`;
    if (!step) return `${doneSteps(plan)}/${plan.steps.length}`;
    const runtime = step.started_at ? durationText(now - Date.parse(step.started_at)) : '';
    if (typeof step.progress === 'number') {
        const eta = step.eta ? Date.parse(step.eta) : NaN;
        const left = Number.isNaN(eta) ? '' : ` · ~${Math.max(0, Math.ceil((eta - now) / 60000))} min left`;
        return `${step.progress} %${left}`;
    }
    return runtime ? `Runtime ${runtime}` : `step ${step.idx}`;
}

/** The "Waiting for you · 4 min" cell of a plan that needs input (design, L21). */
export function statusWaiting(createdAt: string | undefined, now: number): string {
    const since = createdAt ? Date.parse(createdAt) : NaN;
    return Number.isNaN(since) ? 'Waiting for you' : `Waiting for you · ${durationText(now - since)}`;
}

// --- the plan indicator and the notifications (design) -------------------------------------------

/** The short word of the plan indicator's label per state (design, L18). */
export function indicatorWord(plan: Plan, pending: ReadonlySet<string>): string {
    switch (plan.state) {
        case 'approved':
            if (plan.steps.some((s) => !!s.parked_approval && pending.has(s.parked_approval as string)))
                return 'Needs input';
            return plan.steps.some((s) => s.state === 'waiting') ? 'waiting' : 'running';
        case 'paused':
            return 'Paused';
        case 'completed':
            return 'Completed';
        case 'failed':
            return 'Failed';
        case 'cancelled':
            return 'Cancelled';
        default:
            return plan.state;
    }
}

/**
 * The label of the plan chip (issue #221): the steps done of all ("Plan 3/10"), the bare numbers on a phone and where
 * the chat has a training search. The same count as the ring and as "2/6 tasks".
 */
export function indicatorLabel(plan: Plan, variant: 'panel' | 'page' | 'mobile'): string {
    const n = `${doneSteps(plan)}/${plan.steps.length}`;
    return variant === 'mobile' ? n : `Plan ${n}`;
}

/** Whether a step of the plan runs or waits for the platform, or the plan is being approved: the ring moves (issue #250). */
export const planActive = (plan: Plan): boolean =>
    (plan.state === 'proposed' && !!plan.approving) ||
    (plan.state === 'approved' && plan.steps.some((s) => s.state === 'running' || s.state === 'waiting'));

/** "Step 3/3 running: Create a training container · 4 min" while a step runs; undefined otherwise. */
export function runningStepTooltip(plan: Plan, now: number): string | undefined {
    if (plan.state !== 'approved') return undefined;
    const step = plan.steps.find((s) => s.state === 'running' || s.state === 'waiting');
    if (!step) return undefined;
    const since = Date.parse(step.step_started_at ?? '');
    const mins = Number.isNaN(since) ? 0 : Math.floor((now - since) / 60000);
    const time = mins >= 1 ? durationText(mins * 60000) : '';
    const minutes = time ? ` · ${time}` : '';
    const word = step.state === 'waiting' ? 'waiting' : 'running';
    return `Step ${step.idx}/${plan.steps.length} ${word}: ${stepMain(step).head}${minutes}`;
}

/** The tooltip and aria-label of the plan indicator (L18), with the design's closing invitation. */
export function indicatorTooltip(plan: Plan, pending: ReadonlySet<string>): string {
    const i = currentStepIndex(plan);
    const n = plan.steps.length;
    const tail = ' · click to show the plan';
    if (
        plan.state === 'approved' &&
        plan.steps.some((s) => !!s.parked_approval && pending.has(s.parked_approval as string))
    ) {
        return `Step ${i} of ${n} needs your approval${tail}`;
    }
    switch (plan.state) {
        case 'approved':
            return plan.steps.some((s) => s.state === 'waiting')
                ? `Plan waiting for the platform · step ${i} of ${n}${tail}`
                : `Plan running · step ${i} of ${n}${tail}`;
        case 'paused':
            return `Plan paused · step ${i} of ${n}${tail}`;
        case 'failed':
            return `Plan failed at step ${i} of ${n}${tail}`;
        case 'completed':
            return `Plan completed · ${n} of ${n} steps${tail}`;
        case 'cancelled':
            return `Plan cancelled at step ${i} of ${n}${tail}`;
        case 'proposed':
            return plan.approving
                ? `Plan with ${n} ${n === 1 ? 'step' : 'steps'} is being approved${tail}`
                : `Plan with ${n} ${n === 1 ? 'step' : 'steps'} waits for your approval${tail}`;
        default:
            return `Plan · step ${i} of ${n}${tail}`;
    }
}

/** One row of the budget block: its label and value (L12). */
export type BudgetRow = { label: string; value: string };

/** The rows of a proposed plan's budget block: only what the plan actually carries (L12). */
export function budgetRowsOf(plan: Plan, now: number): BudgetRow[] {
    const rows: BudgetRow[] = [];
    const duration = maxDurationText(plan, now);
    if (duration) rows.push({ label: BUDGET_ROWS.duration, value: duration });
    const maxCost = plan.budget?.max_llm_cost ?? 0;
    if (maxCost > 0) rows.push({ label: BUDGET_ROWS.cost, value: moneyText(maxCost) });
    const turns = plan.budget?.max_auto_turns ?? 0;
    if (turns > 0) rows.push({ label: BUDGET_ROWS.turns, value: String(turns) });
    rows.push({ label: BUDGET_ROWS.compute, value: computeText(plan) });
    return rows;
}

/**
 * The dialog text before a plan is cancelled (design decision, D1.10/D4 and L14): the steps that will not run, that
 * the platform keeps working, and what stays. Without a running job and without created objects it is the first
 * sentence alone.
 */
export function cancelConfirmText(plan: Plan): string {
    const from = currentStepIndex(plan);
    const n = plan.steps.length;
    const parts: string[] = [];
    if (from > 0 && from <= n) parts.push(`Steps ${from}–${n} will not run.`);
    if (plan.steps.some((s) => s.state === 'waiting' || s.state === 'running')) {
        parts.push('The training job keeps running on the platform; stop it with Stop job if you no longer need it.');
    }
    const subject = createdSubject(plan);
    if (subject) {
        parts.push(`${subject} from earlier steps ${createdSingular(plan) ? 'stays' : 'stay'} on the platform.`);
    }
    return parts.length > 0 ? parts.join(' ') : 'This plan will not run any further step.';
}

/** "Step 1 created dataset 66 "mnist-train"": what a placeholder of a later step resolved to. */
export function stepRefText(r: StepRef): string {
    const res = r.resource.toLowerCase();
    const noun = res.startsWith('dataset')
        ? 'dataset'
        : res.startsWith('model')
          ? 'model'
          : res.startsWith('training')
            ? 'training container'
            : res.startsWith('deployment') || res.startsWith('container_deployment')
            ? 'deployment'
            : res.startsWith('image') || res.startsWith('container')
              ? 'image'
              : 'resource';
    const label = r.label?.trim();
    const repeats = !!label && label.toLowerCase() === `${noun} ${r.id}`;
    return `Step ${r.step} created ${noun} ${r.id}${label && !repeats ? ` "${r.label}"` : ''}`;
}
