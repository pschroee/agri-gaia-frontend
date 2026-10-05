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
} from './queue';
import type { QueueState } from './queue';
import type { QueueEntry } from './types';

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
        });
        expect(s.entries).toEqual([]);
    });

    it('replaces the entries with the state of an SSE event', () => {
        let s = queueReducer(emptyQueue, { type: 'loaded', entries: [entry('q1', 'a')] });
        s = queueReducer(s, {
            type: 'event',
            event: { entries: [entry('q1', 'a'), entry('q2', 'b')], change: 'queued' },
        });
        expect(s.entries.map((e) => e.id)).toEqual(['q1', 'q2']);
        s = queueReducer(s, { type: 'event', event: { entries: [], change: 'delivered', ids: ['q1', 'q2'] } });
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
        s = queueReducer(s, { type: 'event', event: { entries: [], change: 'delivered', ids: ['q1'] } });
        expect(s.removing).toEqual([]);
    });

    it('resets to the empty queue', () => {
        const s = queueReducer(
            { entries: [entry('q1', 'a')], local: [{ key: 'k', text: 't' }], removing: ['q1'] },
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
        expect(queueStatusText(running)).toBe('goes to the agent when the current run ends');
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
