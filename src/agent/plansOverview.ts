// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The tab "Plans" of /ai-agent (gateway issue #223): the plans of all chats of the user in one table. What the cells
// say and how the live stream changes the list. Pure logic (unit-tested); the tab is components/plans/PlansTab.tsx.

import { AGENT_BASE } from './login';
import {
    budgetLine,
    currentStep,
    currentStepIndex,
    doneSteps,
    durationText,
    pendingStepOf,
    stepPhase,
    stepTitle,
} from './plan';
import type { Plan } from './plan';
import { stepSubline } from './planDetail';
import type { SublineTone } from './planDetail';
import { pauseTitle } from './planText';

/** A plan of the list: the plan as `GET /chats/{id}/plans` sends it, plus the title of its chat. */
export type PlanListItem = Plan & { chat_title: string };

/** One page of `GET /api/plans`; `running` counts the approved and paused plans whatever the filter. */
export type PlanPage = { plans: PlanListItem[]; total: number; running: number };

/** The status groups of the filter: the value in the address, the label and the plan states it stands for. */
export const STATUS_GROUPS: { value: string; label: string; states: string[] }[] = [
    { value: '', label: 'All', states: [] },
    { value: 'active', label: 'Active', states: ['proposed', 'approved', 'paused'] },
    { value: 'completed', label: 'Completed', states: ['completed'] },
    { value: 'failed', label: 'Failed', states: ['failed'] },
    { value: 'cancelled', label: 'Cancelled', states: ['cancelled'] },
    { value: 'not_run', label: 'Not run', states: ['rejected', 'expired', 'superseded'] },
];

export const MODE_OPTIONS = [
    { value: '', label: 'All' },
    { value: 'autonomous', label: 'Autonomous' },
    { value: 'interactive', label: 'Interactive' },
];

export type PlanFilters = { status: string; mode: string; chat: string };

/** The tooltip of the column "Plan" (the agent's own words are not verified). */
export const TITLE_HINT = "Titles are the agent's own words, not verified by the gateway.";

export const PLANS_EMPTY = 'No plans yet. Plans appear here once the agent proposes one in a chat.';
export const PLANS_EMPTY_FILTERED = 'No plans match these filters.';

/** True for a plan that is still going on: it waits for the user, runs or is paused. */
export const isActive = (p: Pick<Plan, 'state'>): boolean =>
    p.state === 'proposed' || p.state === 'approved' || p.state === 'paused';

/** The query of `GET /api/plans` for the filters and the page (from 0); empty values are left out. */
export function plansQuery(f: PlanFilters & { page: number; rowsPerPage: number }): URLSearchParams {
    const q = new URLSearchParams();
    const states = STATUS_GROUPS.find((g) => g.value === f.status)?.states ?? [];
    if (states.length > 0) q.set('state', states.join(','));
    if (f.mode) q.set('mode', f.mode);
    if (f.chat) q.set('chat', f.chat);
    q.set('limit', String(f.rowsPerPage));
    if (f.page > 0) q.set('offset', String(f.page * f.rowsPerPage));
    return q;
}

export async function fetchPlanPage(q: URLSearchParams, signal?: AbortSignal): Promise<PlanPage> {
    const res = await fetch(`${AGENT_BASE}/api/plans?${q.toString()}`, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
        signal,
    });
    if (!res.ok) {
        let msg = `${res.status} ${res.statusText}`.trim();
        try {
            const body = (await res.json()) as { error?: string };
            if (body.error) msg = body.error;
        } catch {
            // keep the status line
        }
        throw new Error(msg);
    }
    const body = (await res.json()) as Partial<PlanPage>;
    return { plans: body.plans ?? [], total: body.total ?? 0, running: body.running ?? 0 };
}

const time = (v: string | undefined): number | undefined => {
    if (!v) return undefined;
    const t = Date.parse(v);
    return Number.isNaN(t) ? undefined : t;
};

/** The start of a plan: its approval, else its proposal. */
export const planStart = (p: Plan): number | undefined => time(p.decided_at) ?? time(p.created_at);

/** The end of a plan that ran: `ended_at`, else the latest time a step finished; undefined while it goes on. */
export function planEnd(p: Plan): number | undefined {
    if (isActive(p)) return undefined;
    const ended = time(p.ended_at);
    if (ended !== undefined) return ended;
    const done = p.steps.map((s) => time(s.done_at)).filter((t): t is number => t !== undefined);
    return done.length > 0 ? Math.max(...done) : undefined;
}

/** A duration without seconds from one minute on ("45 s", "23 min", "1 h 12 min"). */
export function coarseDuration(ms: number): string {
    if (ms < 60000) return durationText(ms);
    return durationText(Math.round(ms / 60000) * 60000);
}

/** The cell "Duration": the time so far, the whole time, the wait for the approval, or a dash for a plan that never ran. */
export function durationCell(p: Plan, now: number): string {
    const start = planStart(p);
    if (p.state === 'proposed') {
        const created = time(p.created_at);
        return created === undefined ? '–' : `waiting ${coarseDuration(Math.max(0, now - created))}`;
    }
    if (start === undefined) return '–';
    if (p.state === 'approved' || p.state === 'paused') return coarseDuration(Math.max(0, now - start));
    if (p.state === 'rejected' || p.state === 'expired' || p.state === 'superseded') return '–';
    const end = planEnd(p);
    return end === undefined ? '–' : coarseDuration(Math.max(0, end - start));
}

/** The cell "Budget" of an autonomous plan: "0.42 / 1.50 USD" and "3/20 turns · 1h 12m left"; undefined otherwise. */
export function budgetCell(p: Plan, now: number): { main: string; sub: string } | undefined {
    if (p.mode !== 'autonomous') return undefined;
    const parts = budgetLine(p, now).split(' · ');
    const usd = parts.find((x) => x.endsWith(' USD'));
    const turns = parts.find((x) => x.endsWith(' turns'));
    const left = parts.find((x) => x.endsWith(' left'));
    const main = usd ? usd.replace('/', ' / ') : '';
    const sub = [turns, left].filter(Boolean).join(' · ');
    if (!main && !sub) return undefined;
    return { main, sub };
}

/** The first step that waits for the user's own approval: the parked one, or an open step the plan does not cover. */
function stepAwaitingUser(p: Plan, pending: ReadonlySet<string>) {
    const parked = pendingStepOf(p, pending);
    if (parked) return parked;
    if (p.state !== 'approved') return undefined;
    return p.steps.find((s) => s.state === 'open' && !s.covered && stepPhase(p, s) === 'approval');
}

/** The line under the state chip: the pause reason, a step that waits for the user, or the wait for the plan's approval. */
export function statusNote(
    p: Plan,
    pending: ReadonlySet<string>,
): { text: string; tone: 'muted' | 'amber' } | undefined {
    if (p.state === 'paused') return { text: pauseTitle(p.pause_reason ?? ''), tone: 'muted' };
    if (p.state === 'proposed') return { text: 'Waits for your approval', tone: 'amber' };
    const step = stepAwaitingUser(p, pending);
    if (step) return { text: `Step ${step.idx} needs your approval`, tone: 'amber' };
    return undefined;
}

/** The cell "Current step": the step the plan is on and what it says, or how a plan that is over ended. */
export function currentStepCell(
    p: Plan,
    pending: ReadonlySet<string>,
): { title: string; sub: string; tone: SublineTone } {
    const none = (title: string) => ({ title, sub: '', tone: 'muted' as SublineTone });
    switch (p.state) {
        case 'completed':
            return none('All steps done');
        case 'cancelled':
            return none(`Cancelled at step ${currentStepIndex(p)}`);
        case 'rejected':
            return none('Rejected');
        case 'expired':
            return none('Expired before approval');
        case 'superseded':
            return none('Replaced by a newer plan');
        default:
            break;
    }
    const step = currentStep(p);
    if (!step) return none('');
    const title = `Step ${step.idx} · ${stepTitle(step)}`.trim();
    const line = stepSubline(p, step, stepPhase(p, step), undefined);
    const waiting = stepAwaitingUser(p, pending)?.idx === step.idx;
    return { title, sub: line.text, tone: waiting && line.tone === 'muted' ? 'amber' : line.tone };
}

/** The row's marker: green while the plan goes on, amber while it waits for the user. */
export function rowTone(p: Plan, pending: ReadonlySet<string>): 'active' | 'attention' | undefined {
    if (!isActive(p)) return undefined;
    if (p.state === 'proposed' || p.state === 'paused' || stepAwaitingUser(p, pending)) return 'attention';
    return 'active';
}

/** The progress cell: done steps of all steps and the bar's share (0-100). */
export function progressOf(p: Plan): { done: number; total: number; value: number } {
    const done = doneSteps(p);
    const total = p.steps.length;
    return { done, total, value: total > 0 ? Math.round((done / total) * 100) : 0 };
}

/** Bar colour by state. */
export const progressColor = (p: Plan): 'error' | 'warning' | 'success' | 'primary' =>
    p.state === 'failed' ? 'error' : p.state === 'paused' ? 'warning' : p.state === 'completed' ? 'success' : 'primary';

/**
 * A plan event applied to the page: the same plan in the same group (going on or over) replaces its row; any other
 * plan, or a plan that changed the group, asks for a reload (the order and the total change with it).
 */
export function applyPlanEvent(page: PlanPage, item: PlanListItem): { page: PlanPage; reload: boolean } {
    const i = page.plans.findIndex((x) => x.id === item.id);
    if (i < 0) return { page, reload: true };
    if (isActive(page.plans[i]) !== isActive(item)) return { page, reload: true };
    return { page: { ...page, plans: page.plans.map((x, j) => (j === i ? item : x)) }, reload: false };
}
