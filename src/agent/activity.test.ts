// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import {
    activityFigures,
    activityQuery,
    activityRows,
    formatDuration,
    internetEvent,
    internetOf,
    kindOf,
    mergePages,
    periodSince,
    shownText,
} from './activity';
import type { ActivityCall, ActivityPage } from './types';

const call = (id: number, chat: string, extra: Partial<ActivityCall> = {}): ActivityCall => ({
    id,
    chat_id: chat,
    slot_id: 'p',
    via: 'mcp',
    op: 'platform',
    detail: `GET /x/${id}`,
    result: 'ok 200',
    created_at: '2026-10-06T10:00:00Z',
    outcome: 'ok',
    ...extra,
});

const page = (calls: ActivityCall[], extra: Partial<ActivityPage> = {}): ActivityPage => ({
    calls,
    chats: { a: { id: 'a', title: 'Chat A', model: 'p/m', variant: 'cli' } },
    summary: { total: calls.length, outcomes: {}, chats: 1, runs: 2, duration: { count: 0 } },
    ...extra,
});

describe('periodSince', () => {
    const now = new Date(2026, 9, 6, 15, 30);
    it('starts at local midnight', () => {
        expect(periodSince('today', now)).toEqual(new Date(2026, 9, 6));
        expect(periodSince('7d', now)).toEqual(new Date(2026, 8, 30));
        expect(periodSince('30d', now)).toEqual(new Date(2026, 8, 7));
        expect(periodSince('all', now)).toBeUndefined();
    });
});

describe('activityQuery', () => {
    const now = new Date(2026, 9, 6, 15, 30);
    it('sends since in UTC without milliseconds, the filter and the cursor', () => {
        const q = new URLSearchParams(activityQuery({ period: 'today', outcome: 'blocked', before: 42 }, now));
        expect(q.get('since')).toBe(new Date(2026, 9, 6).toISOString().replace('.000Z', 'Z'));
        expect(q.get('since')).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
        expect(q.get('outcome')).toBe('blocked');
        expect(q.get('before')).toBe('42');
        expect(q.get('limit')).toBe('100');
    });
    it('leaves out what does not filter', () => {
        expect(activityQuery({ period: 'all', outcome: '', limit: 5 }, now)).toBe('?limit=5');
    });
});

describe('activityRows', () => {
    it('sorts newest first and groups the log by chat and tool call', () => {
        const rows = activityRows(
            page([
                call(1, 'a', { tool_call_id: 't1' }),
                call(3, 'a', { tool_call_id: 't1' }),
                call(2, 'b', { tool_call_id: 't1' }),
                call(4, 'a'),
            ]),
        );
        expect(rows.map((r) => r.call.id)).toEqual([4, 3, 2, 1]);
        expect(rows[1].log.map((c) => c.id)).toEqual([1, 3]);
        expect(rows[2].log.map((c) => c.id)).toEqual([2]);
        expect(rows[0].log.map((c) => c.id)).toEqual([4]);
        expect(rows[0].chat.title).toBe('Chat A');
        // chat b is not in the page's chats: an empty title, not a crash
        expect(rows[2].chat).toEqual({ id: 'b', title: '', model: '', variant: '' });
    });
});

describe('mergePages', () => {
    it('appends without duplicates and takes the newer cursor', () => {
        const first = page([call(5, 'a'), call(4, 'a')], { next_before: 4 });
        const second = page([call(4, 'a'), call(3, 'b')], {
            chats: { b: { id: 'b', title: 'Chat B', model: 'p/m', variant: 'mcp' } },
        });
        const m = mergePages(first, second);
        expect(m.calls.map((c) => c.id)).toEqual([5, 4, 3]);
        expect(Object.keys(m.chats).sort()).toEqual(['a', 'b']);
        expect(m.next_before).toBeUndefined();
    });
});

describe('formatDuration', () => {
    it('picks a unit', () => {
        expect(formatDuration(undefined)).toBe('–');
        expect(formatDuration(-1)).toBe('–');
        expect(formatDuration(0.44)).toBe('0.4 ms');
        expect(formatDuration(12.6)).toBe('13 ms');
        expect(formatDuration(1234)).toBe('1.2 s');
        expect(formatDuration(61500)).toBe('1 min 2 s');
    });
});

describe('activityFigures', () => {
    it('reads the summary and treats missing counts as 0', () => {
        const f = activityFigures(
            page([], {
                summary: {
                    total: 9,
                    outcomes: { ok: 4, blocked: 2, rejected: 1, error: 1, refused: 1 },
                    chats: 3,
                    runs: 7,
                    duration: { count: 5, avg_ms: 40, p95_ms: 95.5, max_ms: 120 },
                },
            }),
        );
        expect(f).toMatchObject({
            total: 9,
            chats: 3,
            runs: 7,
            blocked: 2,
            rejected: 1,
            failed: 2,
            avg: 40,
            p95: 95.5,
        });
        const empty = activityFigures(page([]));
        expect(empty).toMatchObject({ blocked: 0, rejected: 0, failed: 0, avg: undefined, p95: undefined });
    });
});

// Gateway issue #37: internet switches in the activity.
const inet = (id: number, op: string, result: string, extra: Partial<ActivityCall> = {}): ActivityCall =>
    call(id, 'a', { op, result, detail: '', outcome: undefined, kind: 'internet', via: 'cli', ...extra });

describe('activityQuery with kind', () => {
    const now = new Date(2026, 9, 6, 15, 30);
    it('asks for everything or only internet switches; platform is the default', () => {
        expect(new URLSearchParams(activityQuery({ period: 'all', kind: 'all' }, now)).get('kind')).toBe('all');
        expect(new URLSearchParams(activityQuery({ period: 'all', kind: 'internet' }, now)).get('kind')).toBe(
            'internet',
        );
        expect(activityQuery({ period: 'all', kind: 'platform', limit: 5 }, now)).toBe('?limit=5');
    });
    it('asks for platform calls when filtering by result', () => {
        const q = new URLSearchParams(activityQuery({ period: 'all', kind: 'all', outcome: 'blocked' }, now));
        expect(q.get('kind')).toBeNull();
        expect(q.get('outcome')).toBe('blocked');
    });
});

describe('internet rows', () => {
    const p = page([
        call(1, 'a', { tool_call_id: 't1' }),
        inet(2, 'internet', 'approved', { detail: 'pip install pandas', tool_call_id: 't1' }),
        call(3, 'a', { tool_call_id: 't1' }),
        inet(4, 'internet_off', 'off', { tool_call_id: 't1' }),
        inet(5, 'internet_set', 'on', { via: 'user' }),
    ]);
    it('mixes both kinds newest first and keeps internet entries out of the platform logs', () => {
        const rows = activityRows(p);
        expect(rows.map((r) => r.call.id)).toEqual([5, 4, 3, 2, 1]);
        expect(rows[2].log.map((c) => c.id)).toEqual([1, 3]);
        expect(rows[3].log.map((c) => c.id)).toEqual([2]);
    });
    it('filters by kind, also when an older gateway ignores kind', () => {
        expect(activityRows(p, 'internet').map((r) => r.call.id)).toEqual([5, 4, 2]);
        expect(activityRows(p, 'platform').map((r) => r.call.id)).toEqual([3, 1]);
        const old = page([call(7, 'a', { kind: undefined })]);
        expect(kindOf(old.calls[0])).toBe('platform');
        expect(activityRows(old, 'internet')).toEqual([]);
    });
    it('says what happened, who acted and how it ended', () => {
        expect(internetEvent(inet(1, 'internet', 'approved', { detail: 'read the docs' }))).toEqual({
            title: 'Internet requested by the agent',
            reason: 'read the docs',
            result: 'approved',
            tone: 'ok',
            by: 'Agent',
        });
        const cases: [ActivityCall, string, string, string][] = [
            [inet(1, 'internet', 'rejected'), 'Internet requested by the agent', 'rejected by you', 'bad'],
            [inet(1, 'internet', 'expired'), 'Internet requested by the agent', 'no decision in time', 'warn'],
            [inet(1, 'internet', 'already on'), 'Internet requested by the agent', 'already on, not asked', 'muted'],
            [inet(1, 'internet', 'error: boom'), 'Internet requested by the agent', 'failed', 'bad'],
            [inet(1, 'internet_off', 'off'), 'Internet switched off by the agent', 'switched off', 'muted'],
            [inet(1, 'internet_off', 'already off'), 'Internet switched off by the agent', 'was already off', 'muted'],
            [inet(1, 'internet_set', 'on', { via: 'user' }), 'Internet switched on by you', 'on', 'ok'],
            [inet(1, 'internet_set', 'off', { via: 'user' }), 'Internet switched off by you', 'off', 'muted'],
            [
                inet(1, 'internet_set', 'already on', { via: 'user' }),
                'Internet switched on by you',
                'was already on',
                'muted',
            ],
            [
                inet(1, 'internet_off', 'off', { session: 'abc12345-run#1' }),
                'Internet switched off by a subagent',
                'switched off',
                'muted',
            ],
        ];
        for (const [c, title, result, tone] of cases) {
            expect(internetEvent(c)).toMatchObject({ title, result, tone });
        }
        expect(internetEvent(inet(1, 'internet_set', 'on', { via: 'user' })).by).toBe('You');
        expect(internetEvent(inet(1, 'internet', 'approved', { detail: '(no reason given)' })).reason).toBeUndefined();
    });
    it("prefers the gateway's classification over the result text", () => {
        const c = inet(1, 'internet', 'rejected', {
            internet: { action: 'request', origin: 'agent', result: 'expired' },
        });
        expect(internetOf(c).result).toBe('expired');
        expect(internetEvent(c).result).toBe('no decision in time');
    });
    it('leaves the key figures to the platform summary', () => {
        const summary = {
            total: 2,
            outcomes: { ok: 1, blocked: 1 },
            chats: 1,
            runs: 3,
            duration: { count: 1, avg_ms: 12, p95_ms: 12 },
        };
        const withInternet = activityFigures({ ...p, summary });
        const without = activityFigures(page([call(1, 'a'), call(3, 'a')], { summary }));
        expect(withInternet).toEqual(without);
        expect(withInternet).toMatchObject({ total: 2, blocked: 1, rejected: 0, runs: 3 });
    });
    it('counts platform calls and switches apart below the table', () => {
        const rows = activityRows(p);
        expect(shownText(rows, 10, 'all', '')).toBe('Shows 2 of 10 platform calls and 3 internet switches.');
        expect(shownText(activityRows(p, 'platform'), 2, 'platform', '')).toBe('Shows 2 of 2 platform calls.');
        expect(shownText(activityRows(p, 'internet'), 2, 'internet', '')).toBe('Shows 3 internet switches.');
        expect(shownText(activityRows(p, 'platform'), 2, 'all', 'ok')).toBe('Shows 2 calls with this result.');
        expect(shownText(activityRows(page([inet(9, 'internet', 'approved')]), 'internet'), 0, 'internet', '')).toBe(
            'Shows 1 internet switch.',
        );
    });
});
