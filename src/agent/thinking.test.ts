// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from 'vitest';

import { thinkingLabel } from './format';
import { emptyLive, hasThinkingText, liveReducer, liveTextOf, thinkingKey } from './live';
import type { LiveAction, LiveState } from './live';
import { buildTranscript, liveParts } from './transcript';
import { readAlwaysShow, thinkingPrefKey, writeAlwaysShow } from './thinkingPref';
import type { PiEvent, StoredMessage } from './types';

const TS = 1_759_700_000_000;

const pi = (event: PiEvent, now: number): LiveAction => ({ type: 'pi', event, now });
const upd = (e: Record<string, unknown>, now: number) =>
    pi({ type: 'message_update', assistantMessageEvent: e }, now);

function run(actions: LiveAction[], start: LiveState = emptyLive): LiveState {
    return actions.reduce(liveReducer, start);
}

const start = (now = 0) => pi({ type: 'message_start', message: { role: 'assistant', timestamp: TS } }, now);

describe('liveReducer', () => {
    it('assembles thinking, text and a tool call in content order and measures the thinking', () => {
        const s = run([
            start(1000),
            upd({ type: 'thinking_start', contentIndex: 0 }, 1000),
            upd({ type: 'thinking_delta', contentIndex: 0, delta: 'Look at ' }, 1500),
            upd({ type: 'thinking_delta', contentIndex: 0, delta: 'the data.' }, 2000),
            upd({ type: 'thinking_end', contentIndex: 0, content: 'Look at the data.' }, 5200),
            upd({ type: 'text_start', contentIndex: 1 }, 5300),
            upd({ type: 'text_delta', contentIndex: 1, delta: 'Listing datasets.' }, 5400),
            upd({ type: 'toolcall_start', contentIndex: 2, id: 'call_1', toolName: 'mcp_platform_list_datasets' }, 5500),
            upd(
                {
                    type: 'toolcall_end',
                    contentIndex: 2,
                    toolCall: { id: 'call_1', name: 'mcp_platform_list_datasets', arguments: { query: 'pigs' } },
                },
                5600,
            ),
        ]);
        expect(s.message?.timestamp).toBe(TS);
        expect(s.message?.blocks.map((b) => b.type)).toEqual(['thinking', 'text', 'toolCall']);
        expect(s.times[thinkingKey(TS, 0)]).toEqual({ startedAt: 1000, endedAt: 5200 });
        expect(liveTextOf(s.message)).toBe('Listing datasets.');

        const parts = liveParts(s.message);
        expect(parts.map((p) => p.type)).toEqual(['thinking', 'text', 'steps']);
        expect(parts[0]).toMatchObject({ text: 'Look at the data.', durationMs: 4200, liveSince: undefined });
        expect(parts[2]).toMatchObject({
            steps: [{ id: 'call_1', tool: 'platform.list_datasets', summary: 'pigs', status: 'running' }],
        });
    });

    it('shows a running thinking block at once, without text, with its start', () => {
        const s = run([start(0), upd({ type: 'thinking_start', contentIndex: 0 }, 800)]);
        const parts = liveParts(s.message);
        expect(parts).toEqual([{ type: 'thinking', id: thinkingKey(TS, 0), text: '', liveSince: 800 }]);
        expect(s.times[thinkingKey(TS, 0)]).toEqual({ startedAt: 800, endedAt: undefined });
    });

    it('ends an open thinking block when a later block starts (missed thinking_end)', () => {
        const s = run([
            start(),
            upd({ type: 'thinking_delta', contentIndex: 0, delta: 'hmm' }, 100),
            upd({ type: 'text_delta', contentIndex: 1, delta: 'Answer' }, 900),
        ]);
        expect(s.times[thinkingKey(TS, 0)]).toEqual({ startedAt: 100, endedAt: 900 });
        expect(liveParts(s.message)[0]).toMatchObject({ durationMs: 800, liveSince: undefined });
    });

    it('ends open thinking at message_end and keeps the times after clearing', () => {
        let s = run([start(), upd({ type: 'thinking_delta', contentIndex: 0, delta: 'x' }, 10)]);
        s = liveReducer(s, pi({ type: 'message_end', message: { role: 'assistant', timestamp: TS } }, 2010));
        expect(s.message?.ended).toBe(true);
        expect(s.times[thinkingKey(TS, 0)]).toEqual({ startedAt: 10, endedAt: 2010 });
        s = liveReducer(s, { type: 'clear', onlyEnded: true });
        expect(s.message).toBeUndefined();
        expect(s.times[thinkingKey(TS, 0)]?.endedAt).toBe(2010);
    });

    it('does not clear a message that is still streaming with onlyEnded', () => {
        const s = run([start(), upd({ type: 'text_delta', contentIndex: 0, delta: 'a' }, 1)]);
        expect(liveReducer(s, { type: 'clear', onlyEnded: true })).toBe(s);
        expect(liveReducer(s, { type: 'clear' }).message).toBeUndefined();
    });

    it('works without contentIndex, joining deltas of the same type', () => {
        const s = run([
            start(),
            upd({ type: 'thinking_delta', delta: 'a' }, 1),
            upd({ type: 'thinking_delta', delta: 'b' }, 2),
            upd({ type: 'text_delta', delta: 'c' }, 3),
        ]);
        expect(s.message?.blocks).toMatchObject([
            { type: 'thinking', thinking: 'ab' },
            { type: 'text', text: 'c' },
        ]);
    });

    it('ignores messages of other roles and resets', () => {
        const s = run([pi({ type: 'message_start', message: { role: 'user' } }, 0)]);
        expect(s).toBe(emptyLive);
        const t = run([start(), upd({ type: 'thinking_delta', contentIndex: 0, delta: 'a' }, 1), { type: 'reset' }]);
        expect(t).toEqual(emptyLive);
    });
});

const stored = (seq: number, message: StoredMessage['message']): StoredMessage => ({
    seq,
    role: message.role,
    message,
    created_at: '2026-10-06T10:00:00Z',
});

const ctx = { approvals: [], socketCalls: [], executions: [], running: false };

describe('buildTranscript with thinking', () => {
    const messages: StoredMessage[] = [
        stored(1, { role: 'user', content: 'List my datasets' }),
        stored(2, {
            role: 'assistant',
            timestamp: TS,
            content: [
                { type: 'thinking', thinking: 'The user wants datasets.' },
                { type: 'text', text: 'Let me look.' },
                { type: 'toolCall', id: 'c1', name: 'bash', arguments: { command: 'agw-platform datasets' } },
            ],
        }),
        stored(3, { role: 'toolResult', toolCallId: 'c1', content: 'ok' }),
        stored(4, {
            role: 'assistant',
            timestamp: TS + 9000,
            content: [
                { type: 'thinking', thinking: ' \n\u200b' },
                { type: 'thinking', thinking: 'Two datasets.' },
                { type: 'text', text: 'You have two datasets.' },
            ],
        }),
    ];

    it('keeps thinking between text and tool steps, in block order, and skips empty thinking', () => {
        const items = buildTranscript(messages, ctx);
        const agent = items[1];
        expect(agent.kind).toBe('agent');
        if (agent.kind !== 'agent') return;
        expect(agent.parts.map((p) => p.type)).toEqual(['thinking', 'text', 'steps', 'thinking', 'text']);
        expect(agent.parts[0]).toEqual({
            type: 'thinking',
            id: thinkingKey(TS, 0),
            text: 'The user wants datasets.',
            durationMs: undefined,
        });
        expect(agent.parts[3]).toMatchObject({ id: thinkingKey(TS + 9000, 1), text: 'Two datasets.' });
    });

    it('takes the durations measured live, keyed like the live block', () => {
        const times = { [thinkingKey(TS, 0)]: { startedAt: 0, endedAt: 4200 } };
        const items = buildTranscript(messages, { ...ctx, thinkingTimes: times });
        const agent = items[1];
        if (agent.kind !== 'agent') throw new Error('agent expected');
        expect(agent.parts[0]).toMatchObject({ durationMs: 4200 });
        expect(agent.parts[3]).toMatchObject({ durationMs: undefined });
    });

    it('falls back to seq and index as id without a timestamp', () => {
        const items = buildTranscript(
            [stored(7, { role: 'assistant', content: [{ type: 'thinking', thinking: 'x' }] })],
            ctx,
        );
        expect(items[0]).toMatchObject({ parts: [{ type: 'thinking', id: 's7:0' }] });
    });
});

describe('thinking helpers', () => {
    it('labels the header', () => {
        expect(thinkingLabel({ durationMs: 4200 }, 0)).toBe('Thinking · 4.2 s');
        expect(thinkingLabel({}, 0)).toBe('Thinking');
        expect(thinkingLabel({ liveSince: 1000 }, 1400)).toBe('Thinking …');
        expect(thinkingLabel({ liveSince: 1000 }, 4100)).toBe('Thinking … 3 s');
    });

    it('recognises visible thinking text', () => {
        expect(hasThinkingText('a')).toBe(true);
        expect(hasThinkingText(' \n\u200b\ufeff')).toBe(false);
        expect(hasThinkingText(undefined)).toBe(false);
    });
});

describe('always show thinking', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('is remembered per user in localStorage', () => {
        const store = new Map<string, string>();
        vi.stubGlobal('localStorage', {
            getItem: (k: string) => store.get(k) ?? null,
            setItem: (k: string, v: string) => store.set(k, v),
            removeItem: (k: string) => store.delete(k),
        });
        const alice = thinkingPrefKey('alice');
        expect(readAlwaysShow(alice)).toBe(false);
        writeAlwaysShow(alice, true);
        expect(readAlwaysShow(alice)).toBe(true);
        expect(readAlwaysShow(thinkingPrefKey('bob'))).toBe(false);
        writeAlwaysShow(alice, false);
        expect(store.has(alice)).toBe(false);
    });

    it('falls back to memory when storage throws', () => {
        vi.stubGlobal('localStorage', {
            getItem: () => {
                throw new Error('blocked');
            },
            setItem: () => {
                throw new Error('blocked');
            },
            removeItem: () => {
                throw new Error('blocked');
            },
        });
        const key = thinkingPrefKey(undefined);
        expect(key).toBe('agentAlwaysShowThinking:anonymous');
        writeAlwaysShow(key, true);
        expect(readAlwaysShow(key)).toBe(true);
    });
});
