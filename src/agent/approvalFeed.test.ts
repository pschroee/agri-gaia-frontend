// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    emptyPending,
    fabBadge,
    feedAction,
    FeedSource,
    pendingCount,
    pendingList,
    pendingReducer,
    PendingAction,
    PendingState,
    startApprovalFeed,
} from './approvalFeed';
import type { Approval } from './types';

const ap = (id: string, state: Approval['state'] = 'pending', chat = 'c1', at = `2026-10-07T10:00:0${id.length}Z`): Approval => ({
    id,
    chat_id: chat,
    kind: 'platform_write',
    via: 'cli',
    name: 'POST /datasets',
    size: 0,
    sha256: '',
    content_type: '',
    state,
    created_at: at,
});

const run = (...actions: PendingAction[]) => actions.reduce(pendingReducer, emptyPending);

describe('pendingReducer', () => {
    it('takes the snapshot as the complete state', () => {
        const s = run({ type: 'snapshot', approvals: [ap('a'), ap('b', 'pending', 'c2')] }, { type: 'snapshot', approvals: [ap('c')] });
        expect(Object.keys(s.byId)).toEqual(['c']);
    });

    it('counts across chats and drops non-pending entries of a snapshot', () => {
        const s = run({ type: 'snapshot', approvals: [ap('a', 'pending', 'c1'), ap('b', 'pending', 'c2'), ap('x', 'approved')] });
        expect(pendingCount(s)).toBe(2);
    });

    it('adds a new approval and removes it after approve, reject or expiry', () => {
        let s = run({ type: 'snapshot', approvals: [] });
        for (const end of ['approved', 'rejected', 'expired'] as const) {
            s = pendingReducer(s, { type: 'approval', approval: ap('n') });
            expect(pendingCount(s)).toBe(1);
            s = pendingReducer(s, { type: 'approval', approval: ap('n', end) });
            expect(pendingCount(s)).toBe(0);
        }
    });

    it('is idempotent: a repeated event changes nothing, a decision of an unknown approval is fine', () => {
        const a = ap('a');
        const s1 = run({ type: 'snapshot', approvals: [a] });
        expect(pendingReducer(s1, { type: 'approval', approval: a })).toBe(s1);
        const s2 = pendingReducer(s1, { type: 'approval', approval: ap('zz', 'rejected') });
        expect(pendingCount(s2)).toBe(1);
    });

    it('ignores a poll answer when a stream event came in meanwhile', () => {
        const s0 = run({ type: 'snapshot', approvals: [] });
        const since = s0.version;
        const s1 = pendingReducer(s0, { type: 'approval', approval: ap('new') });
        // the poll was answered before the approval existed
        const s2 = pendingReducer(s1, { type: 'polled', approvals: [], since });
        expect(pendingCount(s2)).toBe(1);
        // an up-to-date poll replaces the state
        const s3 = pendingReducer(s2, { type: 'polled', approvals: [ap('p1'), ap('p2')], since: s2.version });
        expect(pendingCount(s3)).toBe(2);
    });

    it('resets when signed out', () => {
        const s = run({ type: 'snapshot', approvals: [ap('a')] }, { type: 'reset' });
        expect(s).toEqual(emptyPending);
    });

    it('lists oldest first', () => {
        const s = run({
            type: 'snapshot',
            approvals: [ap('b', 'pending', 'c1', '2026-10-07T10:00:05Z'), ap('a', 'pending', 'c2', '2026-10-07T09:00:00Z')],
        });
        expect(pendingList(s).map((a) => a.id)).toEqual(['a', 'b']);
    });
});

describe('feedAction', () => {
    it('reads the snapshot and single approvals', () => {
        expect(feedAction(JSON.stringify({ kind: 'approvals', data: [ap('a')] }))).toEqual({ type: 'snapshot', approvals: [ap('a')] });
        expect(feedAction(JSON.stringify({ kind: 'approvals', data: null }))).toEqual({ type: 'snapshot', approvals: [] });
        expect(feedAction(JSON.stringify({ kind: 'approval', data: ap('b') }))).toEqual({ type: 'approval', approval: ap('b') });
    });

    it('ignores other kinds and broken lines', () => {
        expect(feedAction(JSON.stringify({ kind: 'chat', data: {} }))).toBeUndefined();
        expect(feedAction('not json')).toBeUndefined();
        expect(feedAction('null')).toBeUndefined();
        expect(feedAction(JSON.stringify({ kind: 'approval' }))).toBeUndefined();
    });
});

describe('fabBadge', () => {
    it('shows the count only with the panel closed', () => {
        expect(fabBadge(2, false)).toEqual({ visible: true, label: 'AI agent · 2 approvals waiting' });
        expect(fabBadge(1, false).label).toBe('AI agent · 1 approval waiting');
        expect(fabBadge(2, true).visible).toBe(false);
        expect(fabBadge(0, false)).toEqual({ visible: false, label: 'AI agent' });
    });
});

class FakeSource implements FeedSource {
    onopen: FeedSource['onopen'] = null;

    onmessage: FeedSource['onmessage'] = null;

    onerror: FeedSource['onerror'] = null;

    readyState = 0;

    closed = false;

    close() {
        this.closed = true;
        this.readyState = 2;
    }

    open() {
        this.readyState = 1;
        this.onopen?.(new Event('open'));
    }

    send(kind: string, data: unknown) {
        this.onmessage?.({ data: JSON.stringify({ kind, data }) } as MessageEvent<string>);
    }

    /** Network error: EventSource retries by itself (CONNECTING); fatal: it gave up (CLOSED). */
    fail(fatal: boolean) {
        this.readyState = fatal ? 2 : 0;
        this.onerror?.(new Event('error'));
    }
}

describe('startApprovalFeed', () => {
    let sources: FakeSource[];
    let state: PendingState;
    let fetchPending: ReturnType<typeof vi.fn>;
    let live: boolean[];
    let stop: () => void;

    const start = () => {
        stop = startApprovalFeed({
            openStream: () => {
                const s = new FakeSource();
                sources.push(s);
                return s;
            },
            fetchPending: fetchPending as unknown as () => Promise<Approval[]>,
            dispatch: (a) => {
                state = pendingReducer(state, a);
            },
            version: () => state.version,
            onLive: (v) => live.push(v),
            slowPollMs: 60000,
            fastPollMs: 15000,
        });
    };

    beforeEach(() => {
        vi.useFakeTimers();
        sources = [];
        state = emptyPending;
        live = [];
        fetchPending = vi.fn(() => Promise.resolve([] as Approval[]));
    });

    afterEach(() => {
        stop?.();
        vi.useRealTimers();
    });

    it('counts live from the stream: snapshot, new approval in another chat, decision', async () => {
        start();
        await vi.advanceTimersByTimeAsync(0);
        sources[0].open();
        sources[0].send('approvals', [ap('a', 'pending', 'c1')]);
        expect(pendingCount(state)).toBe(1);
        sources[0].send('approval', ap('b', 'pending', 'c2'));
        expect(pendingCount(state)).toBe(2);
        sources[0].send('approval', ap('a', 'approved', 'c1'));
        sources[0].send('approval', ap('b', 'expired', 'c2'));
        expect(pendingCount(state)).toBe(0);
        expect(live).toEqual([true]);
    });

    it('polls once at start, slowly while the stream is open and fast while it is down', async () => {
        start();
        await vi.advanceTimersByTimeAsync(0);
        expect(fetchPending).toHaveBeenCalledTimes(1);
        sources[0].open();
        await vi.advanceTimersByTimeAsync(59000);
        expect(fetchPending).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1000);
        expect(fetchPending).toHaveBeenCalledTimes(2);
        sources[0].fail(false); // network error: EventSource reconnects itself
        expect(live).toEqual([true, false]);
        expect(sources).toHaveLength(1);
        await vi.advanceTimersByTimeAsync(15000);
        expect(fetchPending).toHaveBeenCalledTimes(3);
    });

    it('takes the poll when there is no stream, e.g. an older gateway', async () => {
        fetchPending.mockResolvedValue([ap('a'), ap('b')]);
        start();
        await vi.advanceTimersByTimeAsync(0);
        sources[0].fail(true);
        expect(pendingCount(state)).toBe(2);
    });

    it('opens a new stream with backoff when EventSource gave up, and the new snapshot replaces the state', async () => {
        start();
        await vi.advanceTimersByTimeAsync(0);
        sources[0].open();
        sources[0].send('approvals', [ap('a')]);
        sources[0].fail(true);
        expect(sources[0].closed).toBe(true);
        await vi.advanceTimersByTimeAsync(1999);
        expect(sources).toHaveLength(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(sources).toHaveLength(2);
        sources[1].fail(true);
        await vi.advanceTimersByTimeAsync(3999);
        expect(sources).toHaveLength(2);
        await vi.advanceTimersByTimeAsync(1);
        expect(sources).toHaveLength(3);
        sources[2].open();
        sources[2].send('approvals', [ap('c')]); // 'a' was decided while disconnected
        expect(pendingList(state).map((a) => a.id)).toEqual(['c']);
    });

    it('stops: closes the stream and polls no more', async () => {
        start();
        await vi.advanceTimersByTimeAsync(0);
        stop();
        expect(sources[0].closed).toBe(true);
        await vi.advanceTimersByTimeAsync(120000);
        expect(fetchPending).toHaveBeenCalledTimes(1);
        expect(sources).toHaveLength(1);
    });
});
