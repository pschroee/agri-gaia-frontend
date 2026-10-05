// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import {
    emptyQueue,
    expectQueued,
    holdReasonText,
    isHeld,
    queuePreview,
    queueReducer,
    queueRows,
    queueStatusText,
    removeErrorText,
    settleDelivered,
} from './queue';
import type { QueueState } from './queue';
import type { QueueEntry, StoredMessage } from './types';

const entry = (id: string, text: string, extra: Partial<QueueEntry> = {}): QueueEntry => ({
    id,
    chat_id: 'c1',
    text,
    attachments: [],
    created_at: '2026-10-05T10:00:00Z',
    kind: 'user',
    ...extra,
});

const running = { running: true, queue_held: false };
const idleHeld = { running: false, queue_held: true };

describe('queueReducer', () => {
    it('takes the loaded entries', () => {
        const s = queueReducer(emptyQueue, { type: 'loaded', entries: [entry('q1', 'a'), entry('q2', 'b')] });
        expect(s.entries.map((e) => e.id)).toEqual(['q1', 'q2']);
    });

    it('treats a missing entry list as empty', () => {
        const s = queueReducer(emptyQueue, {
            type: 'event',
            event: { entries: null as unknown as QueueEntry[], change: 'delivered' },
            lastSeq: 0,
        });
        expect(s.entries).toEqual([]);
    });

    it('replaces the entries with the state of an SSE event', () => {
        let s = queueReducer(emptyQueue, { type: 'loaded', entries: [entry('q1', 'a')] });
        s = queueReducer(s, {
            type: 'event',
            event: { entries: [entry('q1', 'a'), entry('q2', 'b')], change: 'queued' },
            lastSeq: 0,
        });
        expect(s.entries.map((e) => e.id)).toEqual(['q1', 'q2']);
        s = queueReducer(s, {
            type: 'event',
            event: { entries: [], change: 'delivered', ids: ['q1', 'q2'] },
            lastSeq: 0,
        });
        expect(s.entries).toEqual([]);
    });

    it('adds and drops optimistic entries by key', () => {
        let s = queueReducer(emptyQueue, { type: 'local_add', item: { key: 'k1', text: 'x' } });
        s = queueReducer(s, { type: 'local_add', item: { key: 'k2', text: 'y' } });
        s = queueReducer(s, { type: 'local_drop', key: 'k1' });
        expect(s.local).toEqual([{ key: 'k2', text: 'y' }]);
    });

    it('removes an entry once the gateway confirms it', () => {
        let s = queueReducer(emptyQueue, { type: 'loaded', entries: [entry('q1', 'a'), entry('q2', 'b')] });
        s = queueReducer(s, { type: 'remove_start', id: 'q1' });
        expect(s.removing).toEqual(['q1']);
        s = queueReducer(s, { type: 'remove_done', id: 'q1', ok: true });
        expect(s.entries.map((e) => e.id)).toEqual(['q2']);
        expect(s.removing).toEqual([]);
    });

    it('keeps an entry when removing fails (409: already delivered)', () => {
        let s = queueReducer(emptyQueue, { type: 'loaded', entries: [entry('q1', 'a')] });
        s = queueReducer(s, { type: 'remove_start', id: 'q1' });
        s = queueReducer(s, { type: 'remove_done', id: 'q1', ok: false });
        expect(s.entries.map((e) => e.id)).toEqual(['q1']);
        expect(s.removing).toEqual([]);
    });

    it('does not mark an entry twice as removing', () => {
        let s = queueReducer(emptyQueue, { type: 'remove_start', id: 'q1' });
        s = queueReducer(s, { type: 'remove_start', id: 'q1' });
        expect(s.removing).toEqual(['q1']);
    });

    it('forgets removals of entries that are no longer open', () => {
        let s = queueReducer(emptyQueue, { type: 'loaded', entries: [entry('q1', 'a')] });
        s = queueReducer(s, { type: 'remove_start', id: 'q1' });
        s = queueReducer(s, { type: 'event', event: { entries: [], change: 'delivered', ids: ['q1'] }, lastSeq: 0 });
        expect(s.removing).toEqual([]);
    });

    it('resets to the empty queue', () => {
        const s = queueReducer(
            { entries: [entry('q1', 'a')], local: [{ key: 'k', text: 't' }], removing: ['q1'], delivered: [] },
            { type: 'reset' },
        );
        expect(s).toEqual(emptyQueue);
    });
});

describe('queueRows', () => {
    const state: QueueState = {
        entries: [
            entry('q1', 'first'),
            entry('q2', 'second', { attachments: ['plot.png'] }),
            entry('q3', '[Note from the orchestrator, not from the user] …', {
                kind: 'system',
                note: 'background',
                refs: ['bg-2'],
            }),
        ],
        local: [{ key: 'k1', text: 'pending' }],
        removing: ['q2'],
        delivered: [],
    };

    it('lists gateway entries in order, then the unconfirmed ones', () => {
        const rows = queueRows(state, running);
        expect(rows.map((r) => r.key)).toEqual(['q1', 'q2', 'q3', 'k1']);
        expect(rows.map((r) => r.state)).toEqual(['waiting', 'removing', 'waiting', 'sending']);
        expect(rows[3].id).toBeUndefined();
        expect(rows[1].attachments).toEqual(['plot.png']);
    });

    it('marks entries as held after an abort when the agent is idle', () => {
        const rows = queueRows(state, idleHeld);
        expect(rows.map((r) => r.state)).toEqual(['held', 'removing', 'held', 'sending']);
    });

    it('labels gateway notes by their kind, never by their text', () => {
        const rows = queueRows(state, running);
        expect(rows[2].system).toBe(true);
        expect(rows[2].label).toBe('background task bg-2 ended');
        expect(rows[0].label).toBeUndefined();
        const looksLikeNote = queueRows(
            { ...emptyQueue, entries: [entry('q9', '[Note from the orchestrator, not from the user] x')] },
            running,
        );
        expect(looksLikeNote[0].system).toBe(false);
    });

    it('gives unknown gateway notes a generic label', () => {
        const rows = queueRows(
            { ...emptyQueue, entries: [entry('q1', 'x', { kind: 'system', note: 'other' })] },
            running,
        );
        expect(rows[0].label).toBe('note from the gateway');
    });
});

describe('held state and texts', () => {
    it('is held only while the agent is idle', () => {
        expect(isHeld(idleHeld)).toBe(true);
        expect(isHeld({ running: true, queue_held: true })).toBe(false);
        expect(isHeld({ running: false, queue_held: false })).toBe(false);
        expect(isHeld(undefined)).toBe(false);
    });

    it('expects queueing while the agent runs or is resumed', () => {
        expect(expectQueued({ running: true })).toBe(true);
        expect(expectQueued({ running: false, resuming: true })).toBe(true);
        expect(expectQueued({ running: false })).toBe(false);
        expect(expectQueued(undefined)).toBe(false);
    });

    it('explains the state in the header', () => {
        expect(queueStatusText(running)).toBe('goes to the agent after its current step');
        expect(queueStatusText({ ...idleHeld, hold_reason: 'abort' })).toBe(
            'paused after the abort, goes along with your next message',
        );
        expect(queueStatusText(idleHeld)).toBe('goes along with your next message');
        expect(holdReasonText('auto_turns')).toBe('limit of turns without you reached');
        expect(holdReasonText(undefined)).toBeUndefined();
    });

    it('shortens previews to one line', () => {
        expect(queuePreview('a\n\n  b   c')).toBe('a b c');
        expect(queuePreview('x'.repeat(10), 4)).toBe('xxxx …');
    });

    it('names the reason a removal failed', () => {
        expect(removeErrorText(409, 'conflict')).toBe('Already handed to the agent.');
        expect(removeErrorText(404, 'not found')).toBe('This entry no longer exists.');
        expect(removeErrorText(500, 'boom')).toBe('Removing failed: boom');
    });
});

const userMsg = (seq: number, text: string, extra: Partial<StoredMessage> = {}): StoredMessage => ({
    seq,
    role: 'user',
    created_at: '2026-10-05T10:01:00Z',
    message: { role: 'user', content: [{ type: 'text', text }] },
    ...extra,
});

describe('delivered entries (steered in, not yet read by the agent)', () => {
    const queued = queueReducer(emptyQueue, {
        type: 'event',
        event: { entries: [entry('q1', 'Also check the night images.')], change: 'queued', ids: ['q1'] },
        lastSeq: 7,
    });
    const delivered = queueReducer(queued, {
        type: 'event',
        event: { entries: [], change: 'delivered', ids: ['q1'], text: 'Also check the night images.' },
        lastSeq: 7,
    });

    it('keeps a delivered entry visible as "delivered" without a remove action', () => {
        expect(delivered.entries).toEqual([]);
        expect(delivered.delivered).toHaveLength(1);
        expect(delivered.delivered[0].afterSeq).toBe(7);
        const rows = queueRows(delivered, running);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ key: 'q1', state: 'delivered', text: 'Also check the night images.' });
        expect(rows[0].id).toBeUndefined();
    });

    it('lists delivered entries before the open ones', () => {
        const s = queueReducer(delivered, {
            type: 'event',
            event: { entries: [entry('q2', 'Then train.')], change: 'queued', ids: ['q2'] },
            lastSeq: 7,
        });
        expect(queueRows(s, running).map((r) => `${r.key}:${r.state}`)).toEqual(['q1:delivered', 'q2:waiting']);
    });

    it('falls back to the delivered text when the entries were not known', () => {
        const s = queueReducer(emptyQueue, {
            type: 'event',
            event: { entries: [], change: 'delivered', ids: ['q9'], text: 'From another tab.' },
            lastSeq: 3,
        });
        expect(queueRows(s, running)).toEqual([
            { key: 'delivered-q9', text: 'From another tab.', attachments: [], system: false, state: 'delivered' },
        ]);
    });

    it('ignores a second delivered event for the same ids', () => {
        const s = queueReducer(delivered, {
            type: 'event',
            event: { entries: [], change: 'delivered', ids: ['q1'], text: 'x' },
            lastSeq: 9,
        });
        expect(s.delivered).toHaveLength(1);
    });

    it('stays while the transcript has only older user messages', () => {
        const s = queueReducer(delivered, { type: 'messages', messages: [userMsg(5, 'Also check the night images.')] });
        expect(s.delivered).toHaveLength(1);
    });

    it('stays when a later user message does not carry the text', () => {
        const s = queueReducer(delivered, { type: 'messages', messages: [userMsg(8, 'Something else.')] });
        expect(s.delivered).toHaveLength(1);
    });

    it('disappears once the user message is in the transcript', () => {
        const s = queueReducer(delivered, {
            type: 'messages',
            messages: [userMsg(5, 'old'), userMsg(8, 'First message.\n\nAlso check the   night images.')],
        });
        expect(s.delivered).toEqual([]);
        expect(queueRows(s, running)).toEqual([]);
    });

    it('disappears on a later user message of a queue turn even if pi changed the text', () => {
        const s = queueReducer(delivered, {
            type: 'messages',
            messages: [userMsg(8, 'rewritten by a template', { trigger: 'queue' })],
        });
        expect(s.delivered).toEqual([]);
    });

    it('settles each delivery with its own user message', () => {
        let s = queueReducer(delivered, {
            type: 'event',
            event: { entries: [entry('q2', 'Then train.')], change: 'queued', ids: ['q2'] },
            lastSeq: 7,
        });
        s = queueReducer(s, {
            type: 'event',
            event: { entries: [], change: 'delivered', ids: ['q2'], text: 'Then train.' },
            lastSeq: 7,
        });
        s = settleDelivered(s, [userMsg(8, 'Also check the night images.')]);
        expect(s.delivered.map((d) => d.ids)).toEqual([['q2']]);
        s = settleDelivered(s, [userMsg(8, 'Also check the night images.'), userMsg(10, 'Then train.')]);
        expect(s.delivered).toEqual([]);
    });

    it('drops the delivery when the entries are restored (not taken up by pi)', () => {
        const s = queueReducer(delivered, {
            type: 'event',
            event: { entries: [entry('q1', 'Also check the night images.')], change: 'restored', ids: ['q1'] },
            lastSeq: 7,
        });
        expect(s.delivered).toEqual([]);
        expect(queueRows(s, running).map((r) => r.state)).toEqual(['waiting']);
    });

    it('drops everything when the chat ends', () => {
        const s = queueReducer(delivered, { type: 'event', event: { entries: [], change: 'dropped' }, lastSeq: 7 });
        expect(s.delivered).toEqual([]);
    });

    it('says the agent reads it after the current step', () => {
        expect(queueStatusText(running, true)).toBe('waiting for the agent, will be read after the current step');
    });
});
