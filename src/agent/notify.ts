// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The browser notification of a plan alert (A-E4, D4.4). The user allows it once in the plan card (the
// checkbox there); the browser's own permission dialog is asked for only on that gesture, and only while the
// browser has not decided yet. A notification is shown only while the tab is hidden — otherwise the snackbar
// already says it. Everything pure is here so it can be tested; the browser is injected.

import { alertDetail, alertText, PlanAlert } from './planAlerts';
import { NOTIFY_BLOCKED_TEXT, NOTIFY_HINT, NOTIFY_ON_TEXT } from './planText';

/** What the browser says about the permission. */
export type NotifyPermission = 'unsupported' | 'default' | 'granted' | 'denied';

/** The part of the browser's Notification interface this module uses (injected in tests). */
export type NotifyApi = {
    permission: string;
    requestPermission: () => Promise<string>;
    new (title: string, options?: { body?: string; tag?: string }): unknown;
};

/** The title of a system notification (design). */
export const NOTIFY_TITLE = 'Agri-Gaia Agent';

/** The browser's Notification interface, or undefined where there is none (tests, server rendering). */
export function browserNotify(): NotifyApi | undefined {
    if (typeof window === 'undefined') return undefined;
    const api = (window as unknown as { Notification?: NotifyApi }).Notification;
    return api ?? undefined;
}

/**
 * The permission as this module works with it; an unknown value counts as undecided. A bare permission string
 * (the result of `Notification.requestPermission()`) is accepted as well.
 */
export function permissionOf(api: NotifyApi | string | undefined): NotifyPermission {
    if (!api) return 'unsupported';
    const p = typeof api === 'string' ? api : api.permission;
    return p === 'granted' || p === 'denied' ? p : 'default';
}

/** Whether the browser may still be asked: only while it has not decided. */
export const canAsk = (permission: NotifyPermission): boolean => permission === 'default';

/** Whether the plan may send a system notification at all. */
export const isOn = (permission: NotifyPermission): boolean => permission === 'granted';

/**
 * Asks the browser for the permission, but only while it has not decided (a decided permission cannot be asked
 * for again, and asking would be a no-op the user does not see). Returns the state afterwards.
 */
export async function requestPermission(api: NotifyApi | undefined = browserNotify()): Promise<NotifyPermission> {
    const before = permissionOf(api);
    if (!api || !canAsk(before)) return before;
    try {
        return permissionOf(await api.requestPermission());
    } catch {
        return permissionOf(api);
    }
}

/**
 * Whether an alert becomes a system notification (D4.4): only while the tab is hidden, only with the user's
 * permission and only for the kinds the checkbox names — completes, fails, needs input. A pause and an
 * attention notice stay in the snackbar.
 */
export function shouldNotify(alert: PlanAlert, hidden: boolean, optedIn: boolean): boolean {
    if (!hidden || !optedIn) return false;
    return alert.kind === 'completed' || alert.kind === 'failed' || alert.kind === 'needs_input';
}

/** The body of a system notification: the snackbar's text and, where it helps, the step's line (design). */
export function notificationBody(alert: PlanAlert, stepSummary?: string): string {
    const detail = alertDetail(alert, stepSummary);
    return detail ? `${alertText(alert)}\n${detail}` : alertText(alert);
}

/** Shows the system notification; harmless without the browser's interface or without the permission. */
export function showNotification(
    alert: PlanAlert,
    stepSummary?: string,
    api: NotifyApi | undefined = browserNotify(),
): void {
    if (!api || permissionOf(api) !== 'granted') return;
    try {
        new api(NOTIFY_TITLE, { body: notificationBody(alert, stepSummary), tag: `${alert.plan_id}:${alert.kind}` });
    } catch {
        // a browser that refuses to show it: the snackbar is the notification then
    }
}

/** What the checkbox of the plan card shows: its state, whether it may be changed, and its help line. */
export type NotifyCheckboxState = {
    checked: boolean;
    disabled: boolean;
    /** Text under the checkbox: the permission's state, or why it cannot be granted. */
    help: string;
    /** The help is a warning: the browser blocks notifications for this site. */
    blocked: boolean;
};

/**
 * The checkbox in a proposed plan (design, L26): unchecked while the browser has not decided, on with a green
 * note once it allowed it, and locked with an explanation once it blocked it.
 */
export function notifyCheckbox(permission: NotifyPermission, optedIn: boolean): NotifyCheckboxState {
    switch (permission) {
        case 'granted':
            return { checked: true, disabled: true, help: NOTIFY_ON_TEXT, blocked: false };
        case 'denied':
            return { checked: false, disabled: true, help: NOTIFY_BLOCKED_TEXT, blocked: true };
        case 'unsupported':
            return { checked: false, disabled: true, help: NOTIFY_BLOCKED_TEXT, blocked: true };
        default:
            return { checked: optedIn, disabled: false, help: NOTIFY_HINT, blocked: false };
    }
}
