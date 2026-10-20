// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The plan the chat header shows (issue #138, L8): which plan the button takes, what its dot says and the short
// words around it. Pure logic (unit-tested); the button is components/PlanButton.tsx, the list PlanList.tsx.

import { agentTitle, planLabel, stepCount, stepMain } from './plan';
import type { Plan } from './plan';

/** What the dot at the button says: waits for attention, runs, is done, failed, or nothing special. */
export type PlanMark = 'approval' | 'running' | 'done' | 'failed' | 'plain';

/** Whether an approved plan is still valid — the card shows "Expired" once its time is over. */
function approvedValid(plan: Plan, now: number): boolean {
    const until = plan.expires_at ? Date.parse(plan.expires_at) : NaN;
    return !Number.isNaN(until) && until > now;
}

export function planMark(plan: Plan, now: number): PlanMark {
    switch (plan.state) {
        case 'proposed':
            return plan.approving ? 'running' : 'approval';
        case 'approved':
            return approvedValid(plan, now) ? 'running' : 'plain';
        case 'completed':
            return 'done';
        case 'failed':
            return 'failed';
        default:
            return 'plain';
    }
}

/** The newest plan of the list: an unusable date counts as old, without any usable date the gateway's order decides. */
export function newestPlan(plans: Plan[]): Plan | undefined {
    let best: Plan | undefined;
    let bestAt = -Infinity;
    for (const p of plans) {
        const at = Date.parse(p.created_at);
        if (!Number.isNaN(at) && at > bestAt) {
            best = p;
            bestAt = at;
        }
    }
    return best ?? plans[0];
}

/**
 * The plan the header button shows: one waiting for approval first (it needs the user), else a running one, else the
 * newest. Without a plan the button is hidden (the caller renders nothing).
 */
export function currentPlan(plans: Plan[], now: number): Plan | undefined {
    return (
        plans.find((p) => planMark(p, now) === 'approval') ??
        plans.find((p) => planMark(p, now) === 'running') ??
        newestPlan(plans)
    );
}

/** One short word for the plan's state, for the button label. */
export function planStateWord(plan: Plan, now: number): string {
    if (plan.state === 'proposed' && plan.approving) return 'Approving…';
    switch (planMark(plan, now)) {
        case 'approval':
            return 'Waiting';
        case 'running':
            return 'Running';
        case 'done':
            return 'Completed';
        case 'failed':
            return 'Failed';
        default:
            return plan.state === 'rejected' ? 'Not approved' : plan.state === 'superseded' ? 'Replaced' : 'Expired';
    }
}

/** Button label: "Plan · Running"; compact "Plan" where the chat area is narrow (the panel). */
export const planButtonLabel = (plan: Plan, now: number, compact: boolean) =>
    compact ? 'Plan' : `Plan · ${planStateWord(plan, now)}`;

/** Tooltip of the button: the plan's title (as on the card: written by the agent, not verified) and its state. */
export const planTooltip = (plan: Plan, now: number) => `${agentTitle(plan) || 'Plan'} · ${planLabel(plan, now)}`;

/** Spoken label of the button, naming the state of the plan it shows. */
export const planAriaLabel = (count: number, plan: Plan, now: number) =>
    `Show plans (${count === 1 ? '1 plan' : `${count} plans`}, current: ${planLabel(plan, now)})`;

/** Title of one entry in the plan list: the agent's title, else the gateway's line of the first step. */
export function planEntryTitle(plan: Plan): string {
    const title = agentTitle(plan);
    if (title) return title;
    const first = plan.steps[0];
    return first ? stepMain(first).head : 'Plan';
}

/** Second line of one entry: the state and the number of steps. */
export const planEntrySub = (plan: Plan, now: number) => `${planLabel(plan, now)} · ${stepCount(plan.steps.length)}`;
