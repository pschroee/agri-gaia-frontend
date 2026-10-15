// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Plans of the agent (issue #70): several platform calls approved with one decision. The gateway stores a plan with
// its steps and sends it over GET /chats/{id}/plans and the SSE event `plan`. Pure logic here (unit-tested); the card
// is components/PlanCard.tsx.

import { AGENT_BASE } from './login';
import type { TranscriptItem } from './transcript';
import type { Approval } from './types';
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
    /** The plan's title as the agent wrote it: not verified by the gateway (gateway issue #72). */
    agent_title?: string;
    /** The same title from a gateway before #72. */
    title?: string;
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
    if (step.files && step.files.length > 0)
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
