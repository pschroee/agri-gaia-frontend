// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The alerts of autonomous plans (A-E4, D4.3): the gateway sends the SSE event `plan_alert` across all the
// user's chats when a plan completes, fails, pauses, needs input or cannot be read any more. This module
// turns such an event into the snackbar text, decides how long it stays and counts what the badges show.
// Pure, so the wording and the rules can be unit-tested; the snackbar itself is components/AgentLayer.tsx.

/** Kinds of a plan alert, as the gateway sends them (D4.3). */
export type PlanAlertKind = 'completed' | 'failed' | 'paused' | 'needs_input' | 'attention';

/** The SSE event `plan_alert` of the gateway (cross-chat and in the chat's own stream). */
export type PlanAlert = {
    chat_id: string;
    plan_id: string;
    kind: PlanAlertKind | string;
    /** The plan's title as the agent wrote it (unverified); empty without one. */
    title?: string;
    /** The step the alert is about (failed: the failed one, needs_input: the waiting one). */
    step?: number;
    /** Why the plan paused, or what the observer could not read. */
    reason?: string;
};

/** An alert the snackbar queue holds; `id` keeps a repeated alert from being shown twice. */
export type QueuedAlert = PlanAlert & { id: string };

/** How long a snackbar stays (D4.4; the design wanted 8 s, the plan fixes 6 s). */
export const ALERT_MS = 6000;

/** Longest plan name the snackbar shows before it cuts with an ellipsis (design: one line, max 568 px). */
export const ALERT_NAME_MAX = 60;

/** The short form of a pause reason (design, L24). */
export const PAUSE_SHORT: Record<string, string> = {
    user: 'by you',
    abort: 'agent stopped',
    login: 'login lost',
    budget_turns: 'turn budget used up',
    budget_cost: 'cost limit reached',
    restart: 'gateway restarted',
    failed_calls: 'stopped after failed tool calls in a row',
};

/** The plan's name in quotes for the snackbar, cut to one line; '' without a title. */
export function alertName(title: string | undefined): string {
    const name = (title ?? '').trim().replace(/\s+/g, ' ');
    if (!name) return '';
    const chars = Array.from(name);
    const short = chars.length > ALERT_NAME_MAX ? `${chars.slice(0, ALERT_NAME_MAX - 1).join('')}…` : name;
    return ` '${short}'`;
}

/** The snackbar's text for one alert (design: four wordings plus `attention`). */
export function alertText(alert: PlanAlert): string {
    const name = alertName(alert.title);
    switch (alert.kind) {
        case 'completed':
            return `Plan${name} completed`;
        case 'needs_input':
            return `Plan${name} needs your input`;
        case 'failed':
            return alert.step ? `Plan${name} failed at step ${alert.step}` : `Plan${name} failed`;
        case 'paused': {
            const why = alert.reason ? PAUSE_SHORT[alert.reason] ?? alert.reason : '';
            return `Plan${name} paused${why ? ` · ${why}` : ''}`;
        }
        case 'attention': {
            const why = (alert.reason ?? '').trim();
            return `Plan${name} needs attention${why ? ` · ${why}` : ''}`;
        }
        default:
            return `Plan${name}`;
    }
}

/** The second line of a browser notification (design): the step and what it does. */
export function alertDetail(alert: PlanAlert, stepSummary?: string): string {
    const summary = (stepSummary ?? '').trim().split('\n')[0];
    if (!alert.step || !summary) return '';
    return `Step ${alert.step}: ${summary}`;
}

/** Whether the snackbar stays until the user opens or closes it (D4.4): a question must not disappear. */
export const alertSticky = (alert: PlanAlert): boolean => alert.kind === 'needs_input';

/**
 * Whether the alert becomes a snackbar at all (design): on the agent page the open chat's own alerts are not
 * repeated — the user sees the card in front of them.
 */
export function alertShown(alert: PlanAlert, view: { openChatId?: string; onAgentPage: boolean }): boolean {
    return !(view.onAgentPage && !!view.openChatId && alert.chat_id === view.openChatId);
}

/** The queue key of an alert: one entry per plan and kind, so a repeated alert does not stack up. */
export const alertKey = (alert: PlanAlert): string => `${alert.chat_id}:${alert.plan_id}:${alert.kind}`;

/** Adds an alert to the queue, newest first, replacing an entry with the same key. */
export function enqueueAlert(queue: QueuedAlert[], alert: PlanAlert): QueuedAlert[] {
    const item: QueuedAlert = { ...alert, id: alertKey(alert) };
    return [item, ...queue.filter((q) => q.id !== item.id)];
}

/** Removes one entry from the queue. */
export const dismissAlert = (queue: QueuedAlert[], id: string): QueuedAlert[] => queue.filter((q) => q.id !== id);

/** How many open plan alerts the stream holds at most (the rest is dropped: a snackbar is not a log). */
export const ALERT_QUEUE_MAX = 5;

/** Queues an alert and trims the queue to ALERT_QUEUE_MAX entries. */
export function pushAlert(queue: QueuedAlert[], alert: PlanAlert): QueuedAlert[] {
    return enqueueAlert(queue, alert).slice(0, ALERT_QUEUE_MAX);
}

/** The payload of an SSE data line when it is a `plan_alert`; anything else is ignored. */
export function planAlertAction(text: string): PlanAlert | undefined {
    let ev: unknown;
    try {
        ev = JSON.parse(text);
    } catch {
        return undefined;
    }
    if (!ev || typeof ev !== 'object') return undefined;
    const { kind, data } = ev as { kind?: unknown; data?: unknown };
    if (kind !== 'plan_alert' || !data || typeof data !== 'object') return undefined;
    const a = data as Partial<PlanAlert>;
    if (typeof a.plan_id !== 'string' || typeof a.kind !== 'string') return undefined;
    return {
        chat_id: typeof a.chat_id === 'string' ? a.chat_id : '',
        plan_id: a.plan_id,
        kind: a.kind,
        title: typeof a.title === 'string' ? a.title : undefined,
        step: typeof a.step === 'number' ? a.step : undefined,
        reason: typeof a.reason === 'string' ? a.reason : undefined,
    };
}

// --- the badges (design) -------------------------------------------------------------------------

/**
 * The number on the badges (D4.4): plans that need the user plus the open approvals. A plan waiting for a
 * step's approval appears in both parts — once as that plan's question and once as the approval it raised,
 * which is what the design counts.
 */
export const badgeCount = (needsInput: number, approvals: number): number => needsInput + approvals;

/** The tooltip of the badges: "{n} plan(s) need(s) your input · {m} approvals waiting" (design). */
export function badgeTooltip(needsInput: number, approvals: number): string {
    if (needsInput === 0 && approvals === 0) return '';
    const plans = needsInput === 1 ? '1 plan needs your input' : `${needsInput} plans need your input`;
    const open = approvals === 1 ? '1 approval waiting' : `${approvals} approvals waiting`;
    if (needsInput === 0) return open;
    if (approvals === 0) return plans;
    return `${plans} · ${open}`;
}
