// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Plans of the agent (issue #70): several platform calls approved with one decision. The gateway stores a plan with
// its steps and sends it over GET /chats/{id}/plans and the SSE event `plan`. Pure logic here (unit-tested); the card
// is components/PlanCard.tsx.

import { AGENT_BASE } from './login';
import type { TranscriptItem } from './transcript';
import { answerSteps } from './answer';

export type PlanState =
    | 'proposed'
    | 'approved'
    | 'rejected'
    | 'expired'
    | 'completed'
    | 'failed'
    | 'superseded';

export type PlanStep = {
    idx: number;
    description?: string;
    tool?: string;
    method: string;
    path: string;
    query?: Record<string, unknown>;
    body?: unknown;
    body_sha256?: string;
    form?: Record<string, unknown>;
    form_sha256?: string;
    files?: { field: string; path: string; sha256: string }[];
    /** Effect class; irreversible steps are never covered by the plan. */
    effect: 'write' | 'compute' | 'irreversible';
    /** Covered by the approval of the plan (false: the step asks for its own approval). */
    covered: boolean;
    state: 'open' | 'running' | 'done' | 'failed';
    result?: string;
    created_resource?: string;
    created_id?: string;
    done_at?: string;
};

export type Plan = {
    id: string;
    chat_id: string;
    approval_id?: string;
    title: string;
    session?: string;
    tool_call_id?: string;
    via: string;
    state: PlanState;
    created_at: string;
    decided_at?: string;
    expires_at?: string;
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
            return 'Waiting for your approval';
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
        case 'superseded':
            return 'Replaced by a newer plan';
        default:
            return plan.state;
    }
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
 * Places the plans of a chat: under the answer whose tool steps contain the plan's tool call (a step's id, or its
 * call ID for a subagent's step), the rest in `rest`. mainOnly: only plans of the main session (not of subagents).
 */
export function placePlans(
    items: TranscriptItem[],
    plans: Plan[],
    mainOnly: boolean,
): { byItem: Map<string, Plan[]>; rest: Plan[] } {
    const byItem = new Map<string, Plan[]>();
    const rest: Plan[] = [];
    const mainSessions = ['', 'main'];
    for (const p of plans) {
        if (mainOnly && p.session !== undefined && !mainSessions.includes(p.session)) continue;
        const owner = p.tool_call_id
            ? items.find(
                  (it) =>
                      it.kind === 'agent' &&
                      answerSteps(it.parts).some((s) => s.id === p.tool_call_id || s.callId === p.tool_call_id),
              )
            : undefined;
        if (owner) byItem.set(owner.key, [...(byItem.get(owner.key) ?? []), p]);
        else rest.push(p);
    }
    return { byItem, rest };
}
