// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Plans of the agent (issue #70): several platform calls approved with one decision. The gateway stores a plan with
// its steps and sends it over GET /chats/{id}/plans and the SSE event `plan`. Pure logic here (unit-tested); the card
// is components/PlanCard.tsx.

import { AGENT_BASE } from './login';
import type { AgentPart, Step, TranscriptItem } from './transcript';
import type { Approval } from './types';
import type { UploadManifest } from './uploads';
import { answerSteps } from './answer';

export type PlanState =
    | 'proposed'
    | 'approved'
    | 'rejected'
    | 'expired'
    | 'completed'
    | 'failed'
    | 'superseded'
    /** An autonomous plan the user paused (autonomy E1/E4). */
    | 'paused'
    /** An autonomous plan the user cancelled; its platform jobs keep running (D1.10). */
    | 'cancelled';

/** Step states the gateway stores (autonomy E1/E2); "waiting" is a step whose platform job the gateway observes. */
export type PlanStepState = 'open' | 'running' | 'waiting' | 'done' | 'failed' | 'skipped';

/** The mode of a plan: "autonomous" carries a budget and a derived grant (E1); absent on older gateways. */
export type PlanMode = 'interactive' | 'autonomous';

/** Budget of an autonomous plan (D4.5), as the gateway stores it. */
export type PlanBudget = {
    max_duration_s: number;
    max_llm_cost: number;
    max_auto_turns: number;
};

/** What an autonomous plan has used of its budget (gateway A-E4, D4.5); absent for interactive plans. */
export type PlanUsage = {
    llm_cost: number;
    auto_turns: number;
    compute_used: number;
    compute_max: number;
};

/** One right of the plan's grant, as the gateway wrote it ("create dataset"), with its effect class. */
export type GrantEntry = { effect: 'read' | 'write' | 'compute' | 'irreversible'; text: string };

/** A rule of the raw grant the gateway stores with an autonomous plan (`delegation.Delegation`). */
export type GrantRule = { action: string; resource: string; ids?: string[] };

/** The grant as the gateway sends it (E1): the rules, without a structured summary in words. */
export type PlanGrant = { rules?: GrantRule[]; expires_at?: string };

/**
 * An object a platform job produced (gateway A-E2), as the observer read it. `size` is in bytes where the kind knows
 * it (the result files of a notebook run, own code C-E4) and missing where it does not.
 */
export type WatchOutput = { resource: string; id: string; label?: string; size?: number };

export type PlanStep = {
    idx: number;
    /**
     * What the step does, written by the gateway from the stored step and platform state it read when the plan was
     * proposed (gateway issue #72): first line the action, then one detail per line. Missing on older plans.
     */
    summary?: string;
    /**
     * The same summary as it was proposed (gateway issue L2/#119): set when the re-read at the moment of the approval
     * found another platform state. The step shows it as "As proposed".
     */
    summary_proposed?: string;
    /** The agent's note on the step: not verified by the gateway (gateway issue #72). */
    agent_note?: string;
    /** The same note from a gateway before #72. */
    description?: string;
    tool?: string;
    /** Arguments of a tool step with steps (matched on the tool and these arguments). */
    args?: Record<string, unknown>;
    method: string;
    path: string;
    query?: Record<string, unknown>;
    body?: unknown;
    body_sha256?: string;
    form?: Record<string, unknown>;
    form_sha256?: string;
    files?: { field: string; path: string; sha256: string }[];
    /**
     * The summary of the step's uploads (gateway issue #172), instead of `files`: number, size, folders, file types
     * and the SHA-256 over the list of every file. The list itself is fetched when the user opens it.
     */
    uploads?: UploadManifest;
    /** Effect class; irreversible steps are never covered by the plan. */
    effect: 'write' | 'compute' | 'irreversible';
    /** Covered by the approval of the plan (false: the step asks for its own approval). */
    covered: boolean;
    state: PlanStepState;
    result?: string;
    created_resource?: string;
    created_id?: string;
    done_at?: string;
    /** The route asks for every single call (gateway G1.1): never covered by a plan. */
    confirm_each?: boolean;
    /** How often an autonomous plan may repeat this step, and how often it was claimed (D1.6). */
    max_attempts?: number;
    attempts?: number;
    /**
     * The approval a step of an autonomous plan was parked on (gateway D2.8). It stays on the step after the
     * decision, so whether the step still waits is decided by that approval's state (see pendingStepOf).
     */
    parked_approval?: string;
    /** The platform job the step waits for (gateway A-E2); its progress is read with the step. */
    watch_job?: string;
    /** Progress of that job: the percent, its line, the estimated end, its log tail and what it produced. */
    progress?: number;
    progress_msg?: string;
    eta?: string;
    log_tail?: string;
    outputs?: WatchOutput[];
    started_at?: string;
};

export type Plan = {
    id: string;
    chat_id: string;
    approval_id?: string;
    /** The plan's title as the agent wrote it: not verified by the gateway (gateway issue #72). */
    agent_title?: string;
    /** The same title from a gateway before #72. */
    title?: string;
    session?: string;
    tool_call_id?: string;
    via: string;
    state: PlanState;
    /** Set by the client while the user's approval is on its way; never sent by the gateway (issue #166). */
    approving?: boolean;
    created_at: string;
    decided_at?: string;
    expires_at?: string;
    /** End of an autonomous plan (completed, failed, cancelled); absent while it runs. */
    ended_at?: string;
    /** "autonomous" carries a budget and a derived grant; absent or "interactive" otherwise (E1). */
    mode?: PlanMode;
    budget?: PlanBudget;
    /** What the plan has used of its budget (E4, D4.5); the gateway writes it with the plan. */
    usage?: PlanUsage;
    /**
     * One entry per right the plan carries, in the gateway's order (D4.4/E1). A gateway that sends no structured
     * summary sends the raw `grant` instead (see grantRows).
     */
    grant_summary?: GrantEntry[];
    /** The delegation the plan was approved with, as the gateway stores it (E1). */
    grant?: PlanGrant;
    /** Why a paused plan is paused: user, abort, login, budget_turns, budget_cost, restart (E1/E3). */
    pause_reason?: string;
    /** The plan this one superseded (D1.12). */
    replaces?: string;
    /** Turns the plan has taken without the user (also inside usage). */
    auto_turns?: number;
    steps: PlanStep[];
};

export type StepStatus = 'done' | 'approval' | 'open' | 'running' | 'failed';

export const STEP_LABEL: Record<StepStatus, string> = {
    done: 'Done',
    approval: 'Needs approval',
    open: 'Open',
    running: 'Running',
    failed: 'Failed',
};

/** The agent's title of a plan (unverified), from either gateway version; '' when there is none. */
export const agentTitle = (plan: Plan): string => (plan.agent_title ?? plan.title ?? '').trim();

/** The agent's note on a step (unverified), from either gateway version; '' when there is none. */
export const agentNote = (step: PlanStep): string => (step.agent_note ?? step.description ?? '').trim();

/** "1 step", "2 steps". */
export const stepCount = (n: number): string => (n === 1 ? '1 step' : `${n} steps`);

/**
 * Did the platform change behind the summary since it was proposed (gateway issue L2/#119)? Then the card shows the
 * new summary with a hint and the old one as "As proposed", and the next click decides. Only a pending approval can
 * be in that state: the gateway keeps the mark until the decision, and a gateway before L2 never sets it.
 */
export function summaryChanged(a: Pick<Approval, 'state' | 'summary_changed_at'>): boolean {
    return a.state === 'pending' && !!a.summary_changed_at;
}

/** A summary written by the gateway: the action (first line) and its details. */
export type SummaryParts = { head: string; details: string[] };

/** Splits a gateway summary; undefined when there is none (older entries). */
export function summaryParts(summary: string | undefined): SummaryParts | undefined {
    if (!summary || summary.trim() === '') return undefined;
    const [head, ...details] = summary.split('\n');
    return { head, details: details.filter((l) => l.trim() !== '') };
}

/**
 * The main line of a step: the gateway's summary, or, for a step from before the gateway wrote summaries, the call
 * itself ("PATCH /datasets/16"). Never the agent's note. `fromGateway` tells which one it is.
 */
export function stepMain(step: PlanStep): SummaryParts & { fromGateway: boolean } {
    const parts = summaryParts(step.summary);
    if (parts) return { ...parts, fromGateway: true };
    return { head: `${step.method} ${step.path}${queryText(step.query)}`, details: [], fromGateway: false };
}

function queryText(q: Record<string, unknown> | undefined): string {
    if (!q || Object.keys(q).length === 0) return '';
    return '?' + new URLSearchParams(Object.entries(q).map(([k, v]) => [k, String(v)])).toString();
}

/** Technical details of a step, for the collapsed part of the card: the call, the tool's arguments, body, form, files. */
export function stepTechnical(step: PlanStep): string {
    const parts = [`${step.method} ${step.path}${queryText(step.query)}`];
    if (step.tool) {
        parts.push(`tool ${step.tool}` + (step.args ? ` with ${JSON.stringify(step.args, null, 2)}` : ''));
    }
    if (step.body !== undefined && step.body !== null) parts.push(`body ${JSON.stringify(step.body, null, 2)}`);
    if (step.form && Object.keys(step.form).length > 0) parts.push(`form: ${JSON.stringify(step.form, null, 2)}`);
    if (step.uploads)
        parts.push(`files: ${step.uploads.files} (manifest sha256 ${step.uploads.manifest_sha256}); the full list is shown above`);
    else if (step.files && step.files.length > 0)
        parts.push(step.files.map((f) => `file ${f.field}: ${f.path}  sha256 ${f.sha256}`).join('\n'));
    return parts.join('\n');
}

/** Status of one step as the card shows it: an open step that is not covered waits for its own approval. */
export function stepStatus(step: PlanStep): StepStatus {
    if (step.state === 'done') return 'done';
    if (step.state === 'running') return 'running';
    if (step.state === 'failed') return 'failed';
    return step.covered ? 'open' : 'approval';
}

/** Short line under the plan's title: its state, with the expiry time once approved (local time, 24 h). */
export function planLabel(plan: Plan, now: number): string {
    switch (plan.state) {
        case 'proposed':
            return plan.approving ? 'Approving…' : 'Waiting for your approval';
        case 'approved': {
            const until = plan.expires_at ? Date.parse(plan.expires_at) : NaN;
            if (Number.isNaN(until) || until <= now) return 'Expired';
            const time = new Date(until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
            return `Approved · valid until ${time}`;
        }
        case 'completed':
            return 'Completed';
        case 'rejected':
            return 'Not approved';
        case 'expired':
            return 'Expired';
        case 'failed':
            return 'Stopped: a step failed';
        case 'paused':
            return 'Paused';
        case 'cancelled':
            return 'Cancelled by you';
        case 'superseded':
            return 'Replaced by a newer plan';
        default:
            return plan.state;
    }
}

/** The plan list with `p` set: replaces the plan of the same id, else inserts it by `created_at` (oldest first). */
export function upsertPlan(list: Plan[], p: Plan): Plan[] {
    const i = list.findIndex((x) => x.id === p.id);
    if (i >= 0) return list.map((x, j) => (j === i ? p : x));
    const at = Date.parse(p.created_at);
    const out = [...list];
    let pos = out.length;
    while (pos > 0 && Date.parse(out[pos - 1].created_at) > at) pos -= 1;
    out.splice(pos, 0, p);
    return out;
}

/**
 * The plans a fetch returned, merged with the ones the stream knows: for ids in `keep` (an event arrived since the fetch
 * began) the current plan wins, also when the fetch lacks it; every other plan is the fetched one (issue #166).
 */
export function mergeFetchedPlans(fetched: Plan[], current: Plan[], keep: ReadonlySet<string>): Plan[] {
    let out = fetched;
    for (const c of current) if (keep.has(c.id)) out = upsertPlan(out, c);
    return out;
}

/** Marks the proposed plans whose approval the user has just given (the POST is still on its way). */
export function withApproving(plans: Plan[], approvalIds: ReadonlySet<string>): Plan[] {
    if (approvalIds.size === 0) return plans;
    return plans.map((p) => (p.state === 'proposed' && p.approval_id && approvalIds.has(p.approval_id) ? { ...p, approving: true } : p));
}

/**
 * Plans of a chat. A chat without the route (an older gateway, 404) has none; any other failure is thrown.
 */
export async function fetchPlans(chatId: string): Promise<Plan[]> {
    const res = await fetch(`${AGENT_BASE}/api/chats/${encodeURIComponent(chatId)}/plans`, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
    });
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return (await res.json()) as Plan[];
}

/**
 * The active autonomous plans of several chats, newest first (the status tab lists them across chats, L22). A chat
 * whose plans cannot be read contributes nothing instead of failing the whole list.
 */
export async function fetchActivePlans(chatIds: string[]): Promise<Plan[]> {
    const lists = await Promise.allSettled(chatIds.map((id) => fetchPlans(id)));
    const out: Plan[] = [];
    for (const l of lists) if (l.status === 'fulfilled') out.push(...l.value.filter(isAutonomous));
    return out;
}

/** The plans the status tab lists: running, waiting for the platform, paused or waiting for the user (L22). */
export function runningPlans(plans: Plan[], pending: ReadonlySet<string>): Plan[] {
    return plans
        .filter((p) => p.state === 'approved' || p.state === 'paused' || needsInput(p, pending))
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

/** The step whose ID or call ID is `callId` (the plan's tool_call_id); undefined when the answer has none. */
function stepOf(parts: AgentPart[], callId: string): Step | undefined {
    return answerSteps(parts).find((s) => s.id === callId || s.callId === callId);
}

/**
 * A plan and the place it was proposed at (L8): the step of the `propose_plan` call. `afterCallId` is that step's
 * ID (a subagent's step carries the call ID apart from it); missing for a plan without a tool call (gateway F28) —
 * it then stays in `rest`, before the running answer, as before.
 */
export type PlacedPlan = Plan & { afterCallId?: string };

/**
 * Places the plans of a chat: with the answer whose tool steps contain the plan's tool call (a step's id, or its
 * call ID for a subagent's step), the rest in `rest`. mainOnly: only plans of the main session (not of subagents).
 */
export function placePlans(
    items: TranscriptItem[],
    plans: Plan[],
    mainOnly: boolean,
): { byItem: Map<string, PlacedPlan[]>; rest: PlacedPlan[] } {
    const byItem = new Map<string, PlacedPlan[]>();
    const rest: PlacedPlan[] = [];
    const mainSessions = ['', 'main'];
    for (const p of plans) {
        if (mainOnly && p.session !== undefined && !mainSessions.includes(p.session)) continue;
        const id = p.tool_call_id;
        const owner = id ? items.find((it) => it.kind === 'agent' && stepOf(it.parts, id) !== undefined) : undefined;
        const step = owner && owner.kind === 'agent' && id ? stepOf(owner.parts, id) : undefined;
        const placed: PlacedPlan = step ? { ...p, afterCallId: step.callId ?? step.id } : { ...p };
        if (owner) byItem.set(owner.key, [...(byItem.get(owner.key) ?? []), placed]);
        else rest.push(placed);
    }
    return { byItem, rest };
}

/**
 * Places the plans of one answer at the part they belong to (L8): the index of the part each plan goes right after
 * (the part holding its step), and the plans without such a part — they stay under the whole answer, as before.
 */
export function plansByPart(
    parts: AgentPart[],
    plans: PlacedPlan[],
): { byPart: Map<number, PlacedPlan[]>; rest: PlacedPlan[] } {
    const byPart = new Map<number, PlacedPlan[]>();
    const rest: PlacedPlan[] = [];
    for (const p of plans) {
        const after = p.afterCallId;
        const i =
            after === undefined
                ? -1
                : parts.findIndex(
                      (part) => part.type === 'steps' && part.steps.some((s) => s.id === after || s.callId === after),
                  );
        if (i < 0) rest.push(p);
        else byPart.set(i, [...(byPart.get(i) ?? []), p]);
    }
    return { byPart, rest };
}

// --- Autonomous plans (A-E4): state, progress, budget and created objects -------------------------

/** An autonomous plan carries a budget and a derived grant (gateway E1); an older gateway sends no mode. */
export const isAutonomous = (plan: Plan): boolean => plan.mode === 'autonomous';

/** How long the plan indicator stays after an end state (design: 10 minutes). */
export const PLAN_TAIL_MS = 10 * 60 * 1000;

/** Newest by created_at; without a usable date the gateway's order decides (the last one). */
function newestByCreated(plans: Plan[]): Plan {
    let best = plans[plans.length - 1];
    let bestAt = -Infinity;
    for (const p of plans) {
        const at = Date.parse(p.created_at);
        if (!Number.isNaN(at) && at >= bestAt) {
            best = p;
            bestAt = at;
        }
    }
    return best;
}

/**
 * The plan the chat header shows (design, D4.2): an autonomous plan that runs, waits or is paused, else one that
 * ended less than PLAN_TAIL_MS ago. A proposed plan is not shown — the approval covers it — and neither is a plan
 * that ended longer ago, so the header goes quiet again.
 */
export function activePlan(plans: Plan[], now: number): Plan | undefined {
    const auto = plans.filter(isAutonomous);
    const live = auto.filter((p) => p.state === 'approved' || p.state === 'paused');
    if (live.length > 0) return newestByCreated(live);
    const recent = auto.filter((p) => {
        const at = p.ended_at ? Date.parse(p.ended_at) : NaN;
        return !Number.isNaN(at) && now - at < PLAN_TAIL_MS;
    });
    return recent.length > 0 ? newestByCreated(recent) : undefined;
}

/**
 * The step the plan is on (L15): the running or waiting one, else the failed, else the next open, else the last
 * done. A completed plan counts all its steps.
 */
export function currentStepIndex(plan: Plan): number {
    if (plan.steps.length === 0) return 0;
    if (plan.state === 'completed') return plan.steps.length;
    const running = plan.steps.find((s) => s.state === 'running' || s.state === 'waiting');
    if (running) return running.idx;
    if (plan.state === 'failed') {
        const failed = plan.steps.find((s) => s.state === 'failed');
        if (failed) return failed.idx;
    }
    const open = plan.steps.find((s) => s.state === 'open');
    if (open) return open.idx;
    const done = [...plan.steps].reverse().find((s) => s.state === 'done');
    return done ? done.idx : 1;
}

/** The step the plan is on; undefined without steps. */
export function currentStep(plan: Plan): PlanStep | undefined {
    const i = currentStepIndex(plan);
    return plan.steps.find((s) => s.idx === i) ?? plan.steps[0];
}

/** How many steps are done (the numerator of "Plan 2/4"). */
export const doneSteps = (plan: Plan): number => plan.steps.filter((s) => s.state === 'done').length;

/**
 * The short title of a step (L17): the first line of the gateway's summary up to its first quotation mark, without
 * trailing spaces ("Run training \"EfficientNet-B0\" …" → "Run training"); without one the whole first line. Never
 * the agent's text.
 */
export function stepTitle(step: PlanStep | undefined): string {
    if (!step) return '';
    const head = stepMain(step).head.split('\n')[0];
    const i = head.search(/["“”]/);
    return (i >= 0 ? head.slice(0, i) : head).trim();
}

/** The plan's short line for tables and tooltips: the title of the step it is on. */
export const planHeadline = (plan: Plan): string => stepTitle(currentStep(plan));

/**
 * The step of a running plan that waits for the user's own approval (gateway D2.8): it carries the parked
 * approval and that approval is still pending. The gateway keeps the mark on the step after the decision, so the
 * pending list decides, not the field alone.
 */
export function pendingStepOf(plan: Plan, pending: ReadonlySet<string>): PlanStep | undefined {
    return plan.steps.find((s) => !!s.parked_approval && pending.has(s.parked_approval));
}

/** The ids of the approvals that are still pending, as the plan helpers take them. */
export function pendingIdsOf(approvals: readonly { id: string; state: string }[]): ReadonlySet<string> {
    return new Set(approvals.filter((a) => a.state === 'pending').map((a) => a.id));
}

/** The plan waits for the user: a step of a running plan has an approval still to decide (D4.3 needs_input). */
export const needsInput = (plan: Plan, pending: ReadonlySet<string>): boolean =>
    plan.state === 'approved' && pendingStepOf(plan, pending) !== undefined;

/** The plan waits for the platform: it runs and one of its steps waits for an observed platform job (A-E2). */
export const awaitingPlatform = (plan: Plan): boolean =>
    plan.state === 'approved' && plan.steps.some((s) => s.state === 'waiting');

/** What the card shows for one step, the plan's state included (design: Open, Queued, Done, Running, Paused, …). */
export type StepPhase =
    | 'done'
    | 'approval'
    | 'open'
    | 'starting'
    | 'queued'
    | 'running'
    | 'paused'
    | 'failed'
    | 'notrun'
    | 'stopped';

export const PHASE_LABEL: Record<StepPhase, string> = {
    done: 'Done',
    approval: 'Needs approval',
    open: 'Open',
    starting: 'Starting…',
    queued: 'Queued',
    running: 'Running',
    paused: 'Paused',
    failed: 'Failed',
    notrun: 'Not run',
    stopped: 'Stopped',
};

/** No step runs or waits and this one is the first that is not finished: it is the one that starts next. */
function isNextToStart(plan: Plan, step: PlanStep): boolean {
    if (plan.steps.some((s) => s.state === 'running' || s.state === 'waiting')) return false;
    const first = [...plan.steps]
        .sort((a, b) => a.idx - b.idx)
        .find((s) => s.state !== 'done' && s.state !== 'skipped');
    return first?.idx === step.idx;
}

export function stepPhase(plan: Plan, step: PlanStep, working = false): StepPhase {
    if (step.state === 'done') return 'done';
    if (step.state === 'failed') return 'failed';
    if (step.state === 'skipped') return 'stopped';
    if (plan.state === 'cancelled') {
        return step.state === 'running' || step.state === 'waiting' ? 'stopped' : 'notrun';
    }
    if (step.state === 'running' || step.state === 'waiting') return plan.state === 'paused' ? 'paused' : 'running';
    if (plan.state === 'failed') return 'notrun';
    if (!step.covered) return 'approval';
    // The agent is working and this step is next: the gateway marks it running once the call arrives, about one
    // model turn later (issue #176).
    if (working && (plan.state === 'approved' || plan.approving) && isNextToStart(plan, step)) return 'starting';
    return plan.state === 'paused' ? 'queued' : 'open';
}

/** "11 min 20 s", "18 min", "2 h 4 min": a duration as the card's lines read it; '' when there is none. */
export function durationText(ms: number): string {
    if (!Number.isFinite(ms) || ms < 0) return '';
    const s = Math.round(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const rest = s % 60;
    if (h > 0) return m > 0 ? `${h} h ${m} min` : `${h} h`;
    // the seconds are always named when they are there; the design reads "Runtime 11 min 20 s" (A-E4).
    if (m > 0) return rest > 0 ? `${m} min ${rest} s` : `${m} min`;
    return `${rest} s`;
}

/** "1h 12m", "18m", "45s": the compact form of the budget line. */
export function shortDuration(ms: number): string {
    const s = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m`;
    return `${s}s`;
}

/** "~12 min left": the estimated rest of a running step, rounded up to whole minutes. */
export const leftText = (ms: number): string => `~${Math.max(0, Math.ceil(ms / 60000))} min left`;

/** How long a step has been running; '' without a start.
 */
export function stepRuntime(step: PlanStep, now: number): string {
    const started = step.started_at ? Date.parse(step.started_at) : NaN;
    return Number.isNaN(started) ? '' : durationText(now - started);
}

/**
 * The line under a step's progress bar (design): the runtime and, with an estimate of the gateway, the time left.
 * Without an estimate it says so instead of guessing.
 */
export function stepTimeLine(step: PlanStep, now: number): string {
    const runtime = stepRuntime(step, now);
    if (!runtime) return '';
    const eta = step.eta ? Date.parse(step.eta) : NaN;
    return Number.isNaN(eta) ? `Runtime ${runtime} · time left unknown` : `Runtime ${runtime} · ${leftText(eta - now)}`;
}

/** The one line above the runtime: what the platform reported, else the design's waiting line. */
export function stepMessage(step: PlanStep): string {
    const msg = (step.progress_msg ?? '').trim();
    if (msg) return msg;
    return step.state === 'waiting' ? 'Waiting for the platform · no progress reported' : '';
}

/** The end of an autonomous plan, as a time; NaN while it has none or the time is unusable. */
function planEndsAt(plan: Plan): number {
    const secs = plan.budget?.max_duration_s ?? 0;
    const from = plan.decided_at ? Date.parse(plan.decided_at) : Date.parse(plan.created_at);
    if (Number.isNaN(from) || secs <= 0) return NaN;
    return from + secs * 1000;
}

/** Local time hh:mm, as the card's budget line reads it. */
const clockText = (t: number) =>
    new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

/** The lead of the budget line: the time left, or when and how the plan ended (design). */
function budgetLead(plan: Plan, now: number): string {
    const ended = plan.ended_at ? Date.parse(plan.ended_at) : NaN;
    if (!Number.isNaN(ended)) {
        if (plan.state === 'completed') {
            const began = plan.decided_at ? Date.parse(plan.decided_at) : NaN;
            const took = Number.isNaN(began) ? '' : ` · ${durationText(ended - began)}`;
            return `Finished ${clockText(ended)}${took}`;
        }
        if (plan.state === 'failed') return `Stopped ${clockText(ended)}`;
        if (plan.state === 'cancelled') return `Cancelled ${clockText(ended)}`;
    }
    const ends = planEndsAt(plan);
    return !Number.isNaN(ends) && ends > now ? `${shortDuration(ends - now)} left` : '';
}

const money = (v: number) => v.toFixed(2);

/**
 * The compact budget line of the card's header (D4.5, design): "1h 12m left · 0.42/1.50 USD · 3/20 turns", plus
 * "1/2 compute calls" while the chat has used some. Parts without data are left out; '' when there is none.
 */
export function budgetLine(plan: Plan, now: number): string {
    if (!isAutonomous(plan)) return '';
    const parts: string[] = [];
    const lead = budgetLead(plan, now);
    if (lead) parts.push(lead);
    const budget = plan.budget;
    const usage = plan.usage;
    if (budget && budget.max_llm_cost > 0 && usage)
        parts.push(`${money(usage.llm_cost)}/${money(budget.max_llm_cost)} USD`);
    if (budget && budget.max_auto_turns > 0 && usage) parts.push(`${usage.auto_turns}/${budget.max_auto_turns} turns`);
    if (usage && usage.compute_max > 0 && usage.compute_used > 0)
        parts.push(`${usage.compute_used}/${usage.compute_max} compute calls`);
    return parts.join(' · ');
}

/** What kind of object a step's output is, as the CREATED block names it (design: Dataset, Model, Image). */
export type OutputKind = 'dataset' | 'model' | 'image';

export function outputKind(output: WatchOutput): OutputKind | undefined {
    const res = output.resource.toLowerCase();
    if (res.startsWith('dataset')) return 'dataset';
    if (res.startsWith('model')) return 'model';
    if (res.startsWith('image') || res.startsWith('container')) return 'image';
    return undefined;
}

/**
 * The platform page an output of a step lives on (design: created objects as links). The dataset page selects a
 * dataset with `/data?dataset=<id>`; a model has its own page; a container image has only the registry list. An
 * unknown kind or a missing id: no link, so the caller shows plain text.
 */
export function outputLink(output: WatchOutput): string | undefined {
    const id = (output.id ?? '').trim();
    if (!id) return undefined;
    switch (outputKind(output)) {
        case 'dataset':
            return `/data?dataset=${encodeURIComponent(id)}`;
        case 'model':
            return `/models/${encodeURIComponent(id)}`;
        case 'image':
            return '/container-images';
        default:
            return undefined;
    }
}

/** The objects the plan has produced so far, in the order of its steps, without duplicates. */
export function planOutputs(plan: Plan): WatchOutput[] {
    const out: WatchOutput[] = [];
    const seen = new Set<string>();
    for (const step of plan.steps) {
        for (const o of step.outputs ?? []) {
            const key = `${outputKind(o) ?? o.resource}:${o.id}`;
            if (!o.id || seen.has(key)) continue;
            seen.add(key);
            out.push(o);
        }
    }
    return out;
}

/** The kinds of object a plan has produced, as the sentences name them: "Dataset and model"; '' without any. */
export function createdSubject(plan: Plan): string {
    const kinds = [...new Set(planOutputs(plan).map(outputKind))].filter((k): k is OutputKind => !!k);
    if (kinds.length === 0) return '';
    const names = kinds.map((k) => (k === 'dataset' ? 'Dataset' : k === 'model' ? 'model' : 'image'));
    const last = names[names.length - 1];
    const head = names.slice(0, -1).join(', ');
    return head ? `${head} and ${last}` : last;
}

/** Whether that subject names one kind, so its verb is singular. */
export const createdSingular = (plan: Plan): boolean =>
    planOutputs(plan).length > 0 && [...new Set(planOutputs(plan).map(outputKind))].filter(Boolean).length === 1;

/** The effect class of a rule of the raw grant; an unknown action counts as a read. */
function effectOfAction(action: string): GrantEntry['effect'] {
    return action === 'write' || action === 'compute' || action === 'irreversible' ? action : 'read';
}

/**
 * The rights of a proposed plan as its block lists them, one row per right (L13). The gateway's `grant_summary`
 * wins where it sends one; a gateway of E1 sends the raw grant instead, and the rows are formed from its rules
 * then ("write dataset", "read everything"). An unreadable grant leaves the block empty, so the card leaves it
 * out rather than showing rights it cannot vouch for.
 */
export function grantRows(plan: Plan): GrantEntry[] {
    if (plan.grant_summary && plan.grant_summary.length > 0) return plan.grant_summary;
    const rules = plan.grant?.rules ?? [];
    return rules
        .filter((r) => typeof r?.action === 'string' && typeof r?.resource === 'string')
        .map((r) => {
            const all = (r.ids ?? []).length === 0 || (r.ids ?? []).includes('*');
            const ids = all ? '' : ` (${(r.ids ?? []).join(', ')})`;
            const text = r.action === 'read' && all ? 'read everything' : `${r.action} ${r.resource}${ids}`;
            return { effect: effectOfAction(r.action), text };
        });
}

/** "Dataset and model stay." / "Dataset stays." — '' when the plan produced nothing (L10). */
export function createdStay(plan: Plan): string {
    const subject = createdSubject(plan);
    if (!subject) return '';
    return `${subject} ${createdSingular(plan) ? 'stays' : 'stay'}.`;
}
