// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Open approvals across all the user's chats, for the badge of the floating agent button (issue #32). The gateway
// streams them at GET /agent/api/events (gateway API.md, *SSE GET /api/events*): first an "approvals" snapshot,
// then every new or decided "approval". A slow poll of GET /approvals?state=pending is the fallback; while the
// stream is down it polls faster.

import type { Approval } from './types';

/** Pending approvals by id, plus a counter of stream events so a poll that started earlier cannot undo them. */
export type PendingState = { byId: Readonly<Record<string, Approval>>; version: number };

export const emptyPending: PendingState = { byId: {}, version: 0 };

export type PendingAction =
    /** Complete state from the stream (first event, also after every reconnect). */
    | { type: 'snapshot'; approvals: Approval[] }
    /** One new or decided approval from the stream. */
    | { type: 'approval'; approval: Approval }
    /** Complete state from GET /approvals?state=pending, requested when the state had `since` as version. */
    | { type: 'polled'; approvals: Approval[]; since: number }
    /** Signed out or feature off: nothing is known. */
    | { type: 'reset' };

function byIdOf(approvals: Approval[]): Record<string, Approval> {
    const out: Record<string, Approval> = {};
    for (const a of approvals) if (a && a.state === 'pending' && a.id) out[a.id] = a;
    return out;
}

export function pendingReducer(state: PendingState, action: PendingAction): PendingState {
    switch (action.type) {
        case 'snapshot':
            return { byId: byIdOf(action.approvals), version: state.version + 1 };
        case 'approval': {
            const a = action.approval;
            if (!a?.id) return state;
            const has = a.id in state.byId;
            if (a.state === 'pending') {
                if (has && state.byId[a.id] === a) return state;
                return { byId: { ...state.byId, [a.id]: a }, version: state.version + 1 };
            }
            if (!has) return { ...state, version: state.version + 1 };
            const next = { ...state.byId };
            delete next[a.id];
            return { byId: next, version: state.version + 1 };
        }
        case 'polled':
            // A stream event arrived while the request was on its way: the answer may predate it.
            if (action.since !== state.version) return state;
            return { byId: byIdOf(action.approvals), version: state.version };
        case 'reset':
            return state.version === 0 && Object.keys(state.byId).length === 0 ? state : { byId: {}, version: 0 };
        default:
            return state;
    }
}

/** Number shown on the badge. */
export const pendingCount = (s: PendingState) => Object.keys(s.byId).length;

/** Pending approvals, oldest first. */
export const pendingList = (s: PendingState) =>
    Object.values(s.byId).sort((a, b) => a.created_at.localeCompare(b.created_at));

/** A data line of the stream as an action; anything else (other kinds, broken JSON) is ignored. */
export function feedAction(text: string): PendingAction | undefined {
    let ev: unknown;
    try {
        ev = JSON.parse(text);
    } catch {
        return undefined;
    }
    if (!ev || typeof ev !== 'object') return undefined;
    const { kind, data } = ev as { kind?: unknown; data?: unknown };
    if (kind === 'approvals') return { type: 'snapshot', approvals: Array.isArray(data) ? (data as Approval[]) : [] };
    if (kind === 'approval' && data && typeof data === 'object') return { type: 'approval', approval: data as Approval };
    return undefined;
}

/** The part of EventSource the feed uses (replaceable in tests). */
export type FeedSource = {
    onopen: ((ev: Event) => void) | null;
    onmessage: ((ev: MessageEvent<string>) => void) | null;
    onerror: ((ev: Event) => void) | null;
    readyState: number;
    close: () => void;
};

export type FeedOptions = {
    openStream: () => FeedSource;
    fetchPending: () => Promise<Approval[]>;
    dispatch: (a: PendingAction) => void;
    /** Current version of the state (for 'polled'). */
    version: () => number;
    /** Stream open or not (for the poll interval and a hint). */
    onLive?: (live: boolean) => void;
    /** A poll answered 401: the session is gone. */
    onUnauthorized?: () => void;
    isUnauthorized?: (e: unknown) => boolean;
    /** Poll interval while the stream is open (fallback against a silently stalled stream). */
    slowPollMs?: number;
    /** Poll interval while the stream is down. */
    fastPollMs?: number;
};

export const SLOW_POLL_MS = 60000;
export const FAST_POLL_MS = 15000;
const CLOSED = 2;

/**
 * Keeps the stream open and polls as a fallback. EventSource reconnects on its own after a network error
 * (the gateway suggests 2 s); when it gives up (HTTP error, e.g. 404 of an older gateway or 401) the feed opens
 * a new one with backoff up to 60 s. Returns the function that stops everything.
 */
export function startApprovalFeed(o: FeedOptions): () => void {
    const slow = o.slowPollMs ?? SLOW_POLL_MS;
    const fast = o.fastPollMs ?? FAST_POLL_MS;
    let stopped = false;
    let live = false;
    let es: FeedSource | null = null;
    let attempt = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let poller: ReturnType<typeof setTimeout> | undefined;

    const setLive = (v: boolean) => {
        if (live === v) return;
        live = v;
        o.onLive?.(v);
        schedulePoll();
    };

    const poll = async () => {
        const since = o.version();
        try {
            const approvals = await o.fetchPending();
            if (!stopped) o.dispatch({ type: 'polled', approvals: Array.isArray(approvals) ? approvals : [], since });
        } catch (e) {
            if (!stopped && o.isUnauthorized?.(e)) o.onUnauthorized?.();
        }
    };

    function schedulePoll() {
        clearTimeout(poller);
        if (stopped) return;
        poller = setTimeout(() => {
            void poll().finally(schedulePoll);
        }, live ? slow : fast);
    }

    const connect = () => {
        if (stopped) return;
        const src = o.openStream();
        es = src;
        src.onopen = () => {
            attempt = 0;
            setLive(true);
        };
        src.onmessage = (msg) => {
            const a = feedAction(msg.data);
            if (a) o.dispatch(a);
        };
        src.onerror = () => {
            setLive(false);
            if (stopped || src.readyState !== CLOSED) return; // EventSource reconnects by itself
            src.close();
            es = null;
            retry = setTimeout(connect, Math.min(60000, 2000 * 2 ** attempt++));
        };
    };

    void poll(); // the count shows even before the stream is open, or without one
    schedulePoll();
    connect();

    return () => {
        stopped = true;
        clearTimeout(retry);
        clearTimeout(poller);
        es?.close();
        es = null;
    };
}

function badgeLabel(name: string, count: number): string {
    if (count <= 0) return name;
    return `${name} · ${count} ${count === 1 ? 'approval' : 'approvals'} waiting`;
}

/** Badge of the floating button: shown only with the panel closed and something to approve. */
export function fabBadge(count: number, panelOpen: boolean): { visible: boolean; label: string } {
    return { visible: !panelOpen && count > 0, label: badgeLabel('AI agent', count) };
}

/**
 * Badge of the "Agent" entry in the side navigation: shown whenever something waits for approval, also with the
 * panel open and on the agent page. The open panel shows the approvals of its selected chat only, the agent page
 * has no floating button, so the entry is the one place that always counts all of the user's chats.
 */
export function navBadge(count: number): { visible: boolean; label: string } {
    return { visible: count > 0, label: badgeLabel('Agent', count) };
}
