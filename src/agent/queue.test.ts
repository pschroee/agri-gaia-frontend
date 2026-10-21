// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import {
    deliveredBubbles,
    emptyQueue,
    expectQueued,
    holdReasonText,
    isHeld,
    knownQueueIds,
    mayHaveArrived,
    queuePreview,
    queueReducer,
    queueRows,
    QUEUE_HINT,
    queueStatusText,
    removeErrorText,
    sendArrived,
    settleDelivered,
    subagentNote,
    subagentNoteLine,
} from './queue';
import type { QueueState } from './queue';
import type { QueueDelivery, QueueEntry, StoredMessage } from './types';

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
        // the note about the background task is not shown while the queue runs (#197)
        expect(rows.map((r) => r.key)).toEqual(['q1', 'q2', 'k1']);
        expect(rows.map((r) => r.state)).toEqual(['waiting', 'removing', 'sending']);
        expect(rows[2].id).toBeUndefined();
        expect(rows[1].attachments).toEqual(['plot.png']);
    });

    it('marks entries as held after an abort when the agent is idle', () => {
        const rows = queueRows(state, idleHeld);
        expect(rows.map((r) => r.key)).toEqual(['q1', 'q2', 'q3', 'k1']);
        expect(rows.map((r) => r.state)).toEqual(['held', 'removing', 'held', 'sending']);
    });

    it('shows a background note only while the queue is held (#197)', () => {
        expect(queueRows(state, running).some((r) => r.key === 'q3')).toBe(false);
        const held = queueRows(state, idleHeld).find((r) => r.key === 'q3');
        expect(held?.state).toBe('held');
        expect(held?.system).toBe(true);
    });

    it('keeps a note to a subagent while the queue runs (#197)', () => {
        const sub = queueRows(
            { ...emptyQueue, entries: [entry('q5', 'x', { kind: 'system', note: 'subagent_user' })] },
            running,
        );
        expect(sub.map((r) => r.key)).toEqual(['q5']);
    });

    it('labels gateway notes by their kind, never by their text', () => {
        const rows = queueRows(state, idleHeld);
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

    it('expects queueing only while the agent runs', () => {
        expect(expectQueued({ running: true })).toBe(true);
        expect(expectQueued({ running: false, resuming: true })).toBe(false);
        expect(expectQueued({ running: false })).toBe(false);
        expect(expectQueued(undefined)).toBe(false);
    });

    it('sends directly to a chat being resumed or started (the gateway holds the message, it is not queued)', () => {
        expect(expectQueued({ running: false, resuming: true, starting: true })).toBe(false);
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

    it('takes a delivered entry out of the queue and shows it as a bubble in the history', () => {
        expect(delivered.entries).toEqual([]);
        expect(delivered.delivered).toHaveLength(1);
        expect(delivered.delivered[0].afterSeq).toBe(7);
        expect(queueRows(delivered, running)).toEqual([]);
        expect(deliveredBubbles(delivered)).toEqual([
            { key: 'delivered-q1', text: 'Also check the night images.', attachments: [] },
        ]);
    });

    it('lists only the open entries in the queue (header counts them alone)', () => {
        const s = queueReducer(delivered, {
            type: 'event',
            event: { entries: [entry('q2', 'Then train.')], change: 'queued', ids: ['q2'] },
            lastSeq: 7,
        });
        expect(queueRows(s, running).map((r) => `${r.key}:${r.state}`)).toEqual(['q2:waiting']);
        expect(deliveredBubbles(s).map((b) => b.key)).toEqual(['delivered-q1']);
    });

    it('falls back to the delivered text when the entries were not known', () => {
        const s = queueReducer(emptyQueue, {
            type: 'event',
            event: { entries: [], change: 'delivered', ids: ['q9'], text: 'From another tab.' },
            lastSeq: 3,
        });
        expect(queueRows(s, running)).toEqual([]);
        expect(deliveredBubbles(s)).toEqual([{ key: 'delivered-q9', text: 'From another tab.', attachments: [] }]);
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
        expect(deliveredBubbles(s)).toEqual([]);
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

    it('joins the user texts and attachments of one delivery into one bubble', () => {
        const a = { ...entry('q1', 'First.'), attachments: ['a.png'] };
        const b = entry('q2', 'Second.');
        let s = queueReducer(emptyQueue, {
            type: 'event',
            event: { entries: [a, b], change: 'queued', ids: ['q1', 'q2'] },
            lastSeq: 7,
        });
        s = queueReducer(s, { type: 'event', event: { entries: [], change: 'delivered', ids: ['q1', 'q2'] }, lastSeq: 7 });
        expect(deliveredBubbles(s)).toEqual([{ key: 'delivered-q1', text: 'First.\n\nSecond.', attachments: ['a.png'] }]);
    });

    it('keeps the header text for the queue only (no "with the agent" state)', () => {
        expect(queueStatusText(running)).toBe('goes to the agent after its current step');
    });
});

describe('delivered entries after a page reload (queue_delivered)', () => {
    const delivery = (ids: string[], texts: string[]): QueueDelivery => ({
        ids,
        entries: ids.map((id, i) => entry(id, texts[i])),
        text: texts.join('\n\n'),
        delivered_at: '2026-10-06T10:00:01Z',
        steered: true,
    });

    it('shows a delivery from the gateway like one from the live event', () => {
        const loaded = queueReducer(queueReducer(emptyQueue, { type: 'loaded', entries: [] }), {
            type: 'delivered_loaded',
            deliveries: [delivery(['q1'], ['Also check the night images.'])],
            lastSeq: 7,
        });
        const live = queueReducer(
            queueReducer(emptyQueue, {
                type: 'event',
                event: { entries: [entry('q1', 'Also check the night images.')], change: 'queued', ids: ['q1'] },
                lastSeq: 7,
            }),
            {
                type: 'event',
                event: { entries: [], change: 'delivered', ids: ['q1'], text: 'Also check the night images.' },
                lastSeq: 7,
            },
        );
        expect(loaded.delivered).toEqual(live.delivered);
        expect(queueRows(loaded, running)).toEqual(queueRows(live, running));
        expect(queueRows(loaded, running)).toEqual([]);
        expect(deliveredBubbles(loaded).map((b) => b.text)).toEqual(['Also check the night images.']);
    });

    it('lists only the open entries; the delivered ones are bubbles in the order of the gateway', () => {
        let s = queueReducer(emptyQueue, { type: 'loaded', entries: [entry('q3', 'Then train.')] });
        s = queueReducer(s, {
            type: 'delivered_loaded',
            deliveries: [delivery(['q1', 'q2'], ['a', 'b'])],
            lastSeq: 4,
        });
        expect(queueRows(s, running).map((r) => `${r.key}:${r.state}`)).toEqual(['q3:waiting']);
        expect(deliveredBubbles(s).map((b) => b.text)).toEqual(['a\n\nb']);
    });

    it('does not add a delivery the live event already showed', () => {
        let s = queueReducer(emptyQueue, {
            type: 'event',
            event: { entries: [], change: 'delivered', ids: ['q1'], text: 'x' },
            lastSeq: 3,
        });
        s = queueReducer(s, { type: 'delivered_loaded', deliveries: [delivery(['q1'], ['x'])], lastSeq: 5 });
        expect(s.delivered).toHaveLength(1);
        expect(s.delivered[0].afterSeq).toBe(3);
    });

    it('takes a delivered entry out of an older open list', () => {
        let s = queueReducer(emptyQueue, { type: 'loaded', entries: [entry('q1', 'x')] });
        s = queueReducer(s, { type: 'delivered_loaded', deliveries: [delivery(['q1'], ['x'])], lastSeq: 2 });
        expect(queueRows(s, running)).toEqual([]);
        expect(deliveredBubbles(s).map((b) => b.key)).toEqual(['delivered-q1']);
    });

    it('is settled by the user message stored after the reload, not by older ones', () => {
        let s = queueReducer(emptyQueue, {
            type: 'delivered_loaded',
            deliveries: [delivery(['q1'], ['Also check the night images.'])],
            lastSeq: 7,
        });
        s = queueReducer(s, { type: 'messages', messages: [userMsg(6, 'Also check the night images.')] });
        expect(s.delivered).toHaveLength(1);
        s = queueReducer(s, { type: 'messages', messages: [userMsg(8, 'Also check the night images.')] });
        expect(s.delivered).toEqual([]);
    });

    it('a restored event reopens it', () => {
        let s = queueReducer(emptyQueue, { type: 'delivered_loaded', deliveries: [delivery(['q1'], ['x'])], lastSeq: 1 });
        s = queueReducer(s, {
            type: 'event',
            event: { entries: [entry('q1', 'x')], change: 'restored', ids: ['q1'] },
            lastSeq: 1,
        });
        expect(queueRows(s, running).map((r) => `${r.key}:${r.state}`)).toEqual(['q1:waiting']);
    });

    it('ignores an empty or malformed list', () => {
        expect(queueReducer(emptyQueue, { type: 'delivered_loaded', deliveries: [], lastSeq: 0 })).toBe(emptyQueue);
        expect(
            queueReducer(emptyQueue, {
                type: 'delivered_loaded',
                deliveries: null as unknown as QueueDelivery[],
                lastSeq: 0,
            }),
        ).toBe(emptyQueue);
        expect(
            queueReducer(emptyQueue, {
                type: 'delivered_loaded',
                deliveries: [{ ids: [], entries: [], text: 'x', delivered_at: '' }],
                lastSeq: 0,
            }),
        ).toBe(emptyQueue);
    });
});

describe('queued messages with a page context', () => {
    const context = { page: 'datasets', object: { kind: 'dataset' as const, id: '42', name: 'bay-3' } };

    it('carries the context of gateway entries and of unconfirmed ones into the rows', () => {
        const rows = queueRows(
            {
                ...emptyQueue,
                entries: [entry('q1', 'two', { context }), entry('q2', 'three')],
                local: [{ key: 'k1', text: 'four', context: { page: 'models' } }],
            },
            running,
        );
        expect(rows.map((r) => r.context)).toEqual([context, undefined, { page: 'models' }]);
    });

    it('ignores a context on a system entry or one that is not structured', () => {
        const rows = queueRows(
            {
                ...emptyQueue,
                entries: [
                    entry('q1', 'x', { kind: 'system', note: 'background', context }),
                    entry('q2', 'y', { context: { page: 'datasets', object: { kind: 'dataset', id: 42 } } as never }),
                ],
            },
            idleHeld, // a background note is only listed while the queue is held (#197)
        );
        expect(rows.map((r) => r.context)).toEqual([undefined, undefined]);
    });
});

describe('notes to the main agent about messages to a subagent (issue #82)', () => {
    const note = (text: string, extra: Partial<QueueEntry> = {}) =>
        entry('n1', text, { kind: 'system', note: 'subagent_user', refs: ['run-1'], ...extra });

    it('reads the note from the gateway field subagent, else the agent in the summary and the text after it', () => {
        const steered = 'The user wrote directly to subagent run-1 (worker); it receives the message after its step.';
        const withField = note(`${steered}\nPlease check the file.`, {
            subagent: { run_id: 'run-1', agent: 'Reviewer', text_head: 'Please check the file.' },
        });
        expect(subagentNote(withField)).toEqual({ name: 'Reviewer', text: 'Please check the file.' });
        expect(subagentNote(note(`${steered}\nPlease check the file.`))).toEqual({
            name: 'worker',
            text: 'Please check the file.',
        });
        const resumed = 'The user wrote directly to subagent run-1 (worker); it continues in a new run.';
        expect(subagentNote(note(`${resumed}\nhallo`))).toEqual({ name: 'worker', text: 'hallo' });
    });

    it('shows the entry as "You wrote to subagent …" without a remove button', () => {
        const rows = queueRows(
            { ...emptyQueue, entries: [note('The user wrote directly to subagent run-1 (worker); x.\nhallo')] },
            undefined,
        );
        expect(rows).toHaveLength(1);
        expect(rows[0].label).toBe('You wrote to subagent worker: hallo');
        expect(rows[0].subagent).toEqual({ name: 'worker', text: 'hallo' });
        // the view shows no remove control for a subagent note (QueueList branches on `subagent`)
        expect(subagentNoteLine({ text: '' })).toBe('You wrote to a subagent');
    });

    it('leaves other gateway notes as they were, with a remove control', () => {
        const rows = queueRows(
            {
                ...emptyQueue,
                entries: [entry('b1', 'Background task b1 ended', { kind: 'system', note: 'background', refs: ['b1'] })],
            },
            idleHeld,
        );
        expect(rows[0].subagent).toBeUndefined();
        expect(rows[0].system).toBe(true);
        expect(rows[0].id).toBe('b1');
    });
});

describe('notes to a subagent after delivery (issue #82)', () => {
    const note = entry('n1', 'You wrote to subagent scout (scout)\nlook at the logs', {
        kind: 'system',
        note: 'subagent_user',
        subagent: { run_id: 'r1', agent: 'scout', text_head: 'look at the logs' },
    });
    const delivered = queueReducer(
        queueReducer(emptyQueue, { type: 'event', event: { entries: [note], change: 'queued', ids: ['n1'] }, lastSeq: 1 }),
        { type: 'event', event: { entries: [], change: 'delivered', ids: ['n1'] }, lastSeq: 1 },
    );

    it('stays as an information row, not removable, until the main agent has read it', () => {
        const rows = queueRows(delivered, running);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ key: 'n1', state: 'waiting', label: 'You wrote to subagent scout: look at the logs' });
        expect(rows[0].id).toBeUndefined();
        expect(deliveredBubbles(delivered)).toEqual([]);
    });

    it('is gone once the main agent has read it', () => {
        const s = settleDelivered(delivered, [userMsg(3, 'x', { trigger: 'wake' })]);
        expect(queueRows(s, running)).toEqual([]);
    });
});

describe('a held queue after a stop keeps its rows and "Send now"', () => {
    it('shows held rows, never bubbles', () => {
        const s = queueReducer(emptyQueue, { type: 'loaded', entries: [entry('q1', 'later')] });
        const idleHeld = { queue_held: true, running: false };
        expect(queueRows(s, idleHeld).map((r) => r.state)).toEqual(['held']);
        expect(deliveredBubbles(s)).toEqual([]);
    });
});

describe('a send whose response was lost', () => {
    const mark = { afterSeq: 4, queueIds: ['old'] };
    const detail = (over: Record<string, unknown>) =>
        ({ messages: [], queue: [], queue_delivered: [], ...over }) as Parameters<typeof sendArrived>[0];

    it('may have arrived after a network failure, a timeout or a server error, not after a refusal', () => {
        expect(mayHaveArrived(undefined)).toBe(true);
        expect(mayHaveArrived(504)).toBe(true);
        expect(mayHaveArrived(408)).toBe(true);
        expect(mayHaveArrived(400)).toBe(false);
        expect(mayHaveArrived(409)).toBe(false);
        expect(mayHaveArrived(401)).toBe(false);
    });

    it('arrived when the chat holds a newer user message with the text', () => {
        expect(sendArrived(detail({ messages: [userMsg(5, 'moinsen  wie geht es?')] }), 'moinsen wie geht es?', mark)).toBe(true);
    });

    it('did not arrive when only an older user message has the text', () => {
        expect(sendArrived(detail({ messages: [userMsg(4, 'hello')] }), 'hello', mark)).toBe(false);
    });

    it('arrived when the queue holds a new entry with the text, open or delivered', () => {
        expect(sendArrived(detail({ queue: [entry('q7', 'hello')] }), 'hello', mark)).toBe(true);
        const delivery: QueueDelivery = { ids: ['q8'], entries: [entry('q8', 'hello')], text: 'hello', delivered_at: '' };
        expect(sendArrived(detail({ queue_delivered: [delivery] }), 'hello', mark)).toBe(true);
    });

    it('did not arrive when the entry with the text was already there before', () => {
        expect(sendArrived(detail({ queue: [entry('old', 'hello')] }), 'hello', mark)).toBe(false);
    });

    it('cannot recognise an empty text (attachments only)', () => {
        expect(sendArrived(detail({ messages: [userMsg(5, '')] }), '', mark)).toBe(false);
    });

    it('remembers the open and delivered ids at the time of sending', () => {
        const s = queueReducer(emptyQueue, { type: 'loaded', entries: [entry('q1', 'a')] });
        expect(knownQueueIds(s)).toEqual(['q1']);
    });
});

describe('settling after repeated reloads', () => {
    it('does not let one stored message settle a second delivery on the next reload', () => {
        let s = queueReducer(emptyQueue, {
            type: 'event',
            event: { entries: [entry('q1', 'a')], change: 'queued', ids: ['q1'] },
            lastSeq: 2,
        });
        s = queueReducer(s, { type: 'event', event: { entries: [entry('q2', 'b')], change: 'queued', ids: ['q2'] }, lastSeq: 2 });
        s = queueReducer(s, { type: 'event', event: { entries: [], change: 'delivered', ids: ['q1'], text: 'a' }, lastSeq: 2 });
        s = queueReducer(s, { type: 'event', event: { entries: [], change: 'delivered', ids: ['q2'], text: 'b' }, lastSeq: 2 });
        const msgs = [userMsg(3, 'rewritten', { trigger: 'queue' })];
        s = queueReducer(s, { type: 'messages', messages: msgs });
        expect(s.delivered.map((d) => d.ids)).toEqual([['q2']]);
        s = queueReducer(s, { type: 'messages', messages: msgs });
        s = queueReducer(s, { type: 'messages', messages: msgs });
        expect(s.delivered.map((d) => d.ids)).toEqual([['q2']]);
        s = queueReducer(s, { type: 'messages', messages: [...msgs, userMsg(5, 'rewritten again', { trigger: 'queue' })] });
        expect(s.delivered).toEqual([]);
    });
});

describe('the wording when a queued message reaches the agent', () => {
    // F10, issue L6/#123 (DL6.5): the tooltip of the send button and the header of the queue name the same moment,
    // from one constant. The tooltip read "when the current run ends", which is not what the gateway does.
    it('is one constant for the queue header and the send tooltip', () => {
        expect(QUEUE_HINT).toBe('goes to the agent after its current step');
        const running = { queue_held: false, running: true, hold_reason: undefined };
        expect(queueStatusText(running)).toBe(QUEUE_HINT);
    });
});
