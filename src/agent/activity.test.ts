// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import {
    activityChatName,
    activityFigures,
    activityLinkOf,
    activityParams,
    activityQuery,
    activityRows,
    accessSummaryOf,
    accessTotals,
    allowedLine,
    connectionFilterOf,
    formatDuration,
    grantLimitsText,
    internetActivityLink,
    internetActivityParams,
    isInternetKind,
    KIND_FILTERS,
    sinceOf,
    endedTitle,
    internetEvent,
    internetOf,
    isSystemRead,
    kindOf,
    mergePages,
    periodSince,
    shownText,
    viaLabel,
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
    it("carries the chat and the tool call of a step detail's link (F6, issue L6/#123)", () => {
        const q = new URLSearchParams(activityQuery({ period: 'all', chat: 'c-1', call: 'tc-9' }, now));
        expect(q.get('chat')).toBe('c-1');
        expect(q.get('call')).toBe('tc-9');
        expect(new URLSearchParams(activityQuery({ period: 'all', call: 'tc-9' }, now)).has('chat')).toBe(false);
    });
});

describe('the link into the activity', () => {
    it('names the tab and both filter values', () => {
        expect(activityLinkOf('c-1', 'tc-9')).toBe('/ai-agent?tab=activity&chat=c-1&call=tc-9');
    });
    it('leaves out what is missing and escapes the values', () => {
        expect(activityLinkOf('c-1')).toBe('/ai-agent?tab=activity&chat=c-1');
        expect(activityLinkOf('', 'tc-9')).toBe('/ai-agent?tab=activity&call=tc-9');
        expect(activityLinkOf('c 1', 'a/b&c')).toBe('/ai-agent?tab=activity&chat=c+1&call=a%2Fb%26c');
    });
});

describe('activityParams', () => {
    it('reads the chat and the tool call of a link', () => {
        expect(activityParams('?tab=activity&chat=c-1&call=tc-9')).toEqual({ chat: 'c-1', call: 'tc-9' });
        expect(activityParams('chat=c-1')).toEqual({ chat: 'c-1', call: undefined });
        expect(activityParams('')).toEqual({ chat: undefined, call: undefined });
        expect(activityParams('?tab=activity')).toEqual({ chat: undefined, call: undefined });
        expect(activityParams('?chat=%20c-1%20&call=tc-9')).toEqual({ chat: 'c-1', call: 'tc-9' });
    });
    it('drops a tool call the gateway would refuse (no error from a hand-made link)', () => {
        expect(activityParams('?call=').call).toBeUndefined();
        expect(activityParams('?call=' + 'x'.repeat(257)).call).toBeUndefined();
        expect(activityParams('?call=tc%20with%20space').call).toBeUndefined();
        expect(activityParams('?call=' + 'x'.repeat(256)).call).toBe('x'.repeat(256));
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
        expect(internetEvent(inet(1, 'internet', 'approved', { detail: 'read the docs' }))).toMatchObject({
            title: 'Internet access approved for the agent',
            reason: 'read the docs',
            result: 'approved',
            resultIcon: 'Check',
            tone: 'ok',
            by: 'Agent',
            via: 'CLI',
            data: '–',
        });
        const cases: [ActivityCall, string, string, string][] = [
            [inet(1, 'internet', 'rejected'), 'Internet access rejected by you', 'rejected', 'bad'],
            [inet(1, 'internet', 'expired'), 'Internet access requested by the agent', 'no decision in time', 'warn'],
            [
                inet(1, 'internet', 'already on'),
                'Internet access requested by the agent',
                'already on, not asked',
                'muted',
            ],
            [inet(1, 'internet', 'refused: too many'), 'Internet access request refused', 'refused', 'bad'],
            [inet(1, 'internet', 'error: boom'), 'Internet access request failed', 'failed', 'bad'],
            [inet(1, 'internet_off', 'off'), 'Internet access switched off by the agent', 'switched off', 'muted'],
            [
                inet(1, 'internet_off', 'already off'),
                'Internet access switched off by the agent',
                'was already off',
                'muted',
            ],
            [inet(1, 'internet_set', 'on', { via: 'user' }), 'Internet access switched on by you', 'switched on', 'ok'],
            [
                inet(1, 'internet_set', 'off', { via: 'user' }),
                'Internet access switched off by you',
                'switched off',
                'muted',
            ],
            [
                inet(1, 'internet_set', 'already on', { via: 'user' }),
                'Internet access switched on by you',
                'was already on',
                'muted',
            ],
            [
                inet(1, 'internet_off', 'off', { session: 'abc12345-run#1' }),
                'Internet access switched off by a helper of the agent',
                'switched off',
                'muted',
            ],
            [inet(1, 'internet_end', 'time'), 'Internet access ended: time is up', 'ended: time', 'muted'],
            [
                inet(1, 'internet_end', 'bytes'),
                'Internet access ended: data limit reached',
                'ended: data limit',
                'muted',
            ],
            [inet(1, 'internet_end', 'installed'), 'Packages installed, access ended', 'ended: installed', 'muted'],
            [inet(1, 'internet_end', 'user'), 'Internet access switched off by you', 'switched off', 'muted'],
            [inet(1, 'internet_end', 'error'), 'Internet access ended: error', 'ended: error', 'bad'],
        ];
        for (const [c, title, result, tone] of cases) {
            expect(internetEvent(c)).toMatchObject({ title, result, tone });
        }
        expect(internetEvent(inet(1, 'internet_set', 'on', { via: 'user' })).by).toBe('You');
        expect(internetEvent(inet(1, 'internet_set', 'on', { via: 'user' })).via).toBe('UI');
        expect(internetEvent(inet(1, 'internet_end', 'time', { via: 'orchestrator' }))).toMatchObject({
            by: 'System',
            via: '–',
        });
        expect(internetEvent(inet(1, 'internet', 'approved', { detail: '(no reason given)' })).reason).toBeUndefined();
    });
    it('names the kind, the list, the symbols and the data of an entry with its grant (A3, A5, A10)', () => {
        const grant = {
            id: 7,
            kind: 'packages' as const,
            domains: [],
            packages: ['pip:torch', 'pip:torchvision==0.20.1'],
            bytes: 2.6 * 1024 ** 3,
            max_bytes: 4 * 1024 ** 3,
            state: 'ended' as const,
            origin: 'agent' as const,
        };
        const approved = internetEvent(inet(1, 'internet', 'approved', { grant, via: 'mcp' }));
        expect(approved).toMatchObject({
            title: 'Packages approved for the agent',
            kind: 'packages',
            list: 'torch, torchvision',
            via: 'MCP',
            data: '–',
            icon: 'Public',
        });
        const ended = internetEvent(inet(2, 'internet_end', 'installed', { grant }));
        expect(ended).toMatchObject({ resultIcon: 'TaskAlt', icon: 'PublicOff', data: '2.6 GB' });
        expect(internetEvent(inet(3, 'internet_end', 'time', { grant })).resultIcon).toBe('TimerOff');
        expect(internetEvent(inet(4, 'internet_end', 'bytes', { grant })).resultIcon).toBe('DataUsage');
        expect(internetEvent(inet(5, 'internet_end', 'user', { grant })).resultIcon).toBe('PublicOff');
        expect(internetEvent(inet(6, 'internet', 'refused')).resultIcon).toBe('ErrorOutline');
        expect(internetEvent(inet(7, 'internet', 'expired', { grant })).resultIcon).toBe('HourglassEmpty');
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
        expect(shownText(rows, 10, 'all', '')).toBe('Shows 2 of 10 platform calls and 3 internet entries.');
        expect(shownText(activityRows(p, 'platform'), 2, 'platform', '')).toBe('Shows 2 of 2 platform calls.');
        expect(shownText(activityRows(p, 'internet'), 2, 'internet', '')).toBe('Shows 3 internet entries.');
        expect(shownText(activityRows(p, 'platform'), 2, 'all', 'ok')).toBe('Shows 2 calls with this result.');
        expect(shownText(activityRows(page([inet(9, 'internet', 'approved')]), 'internet'), 0, 'internet', '')).toBe(
            'Shows 1 internet entry.',
        );
    });
});

describe('internet views of the activity (issue #175)', () => {
    it('offers the four kinds and knows the two internet ones', () => {
        expect(KIND_FILTERS.map((k) => k.label)).toEqual([
            'Everything',
            'Platform calls',
            'Internet access',
            'Internet connections',
        ]);
        expect(isInternetKind('internet')).toBe(true);
        expect(isInternetKind('connections')).toBe(true);
        expect(isInternetKind('all')).toBe(false);
        expect(isInternetKind('platform')).toBe(false);
    });
    it('never asks the platform route for the connections', () => {
        const q = new URLSearchParams(activityQuery({ period: 'all', kind: 'connections' }));
        expect(q.get('kind')).toBeNull();
    });
    it('writes and reads the link into the connections (the popover\'s "Show in Activity")', () => {
        const link = internetActivityLink('chat-1');
        expect(link).toBe('/ai-agent?tab=activity&kind=connections&result=blocked&chat=chat-1');
        const search = link.slice(link.indexOf('?'));
        expect(internetActivityParams(search)).toEqual({ kind: 'connections', result: 'blocked' });
        expect(activityParams(search)).toEqual({ chat: 'chat-1', call: undefined });
        expect(internetActivityLink('c', '')).toBe('/ai-agent?tab=activity&kind=connections&chat=c');
    });
    it('drops what it does not know in a hand-made link', () => {
        expect(internetActivityParams('?kind=platform&result=maybe')).toEqual({ kind: undefined, result: undefined });
        expect(internetActivityParams('?kind=internet&result=allowed')).toEqual({
            kind: 'internet',
            result: 'allowed',
        });
        expect(internetActivityParams('')).toEqual({ kind: undefined, result: undefined });
    });
    it('builds the filter of the connection table from the period, chat, result and origin', () => {
        const now = new Date(2026, 9, 6, 15, 30);
        expect(sinceOf('today', now)).toBe(new Date(2026, 9, 6).toISOString().replace('.000Z', 'Z'));
        expect(sinceOf('all', now)).toBeUndefined();
        const f = connectionFilterOf({ period: 'all', chat: 'c1', result: 'blocked', origin: '' });
        expect(f).toEqual({ since: undefined, chat: 'c1', result: 'blocked', origin: undefined, limit: undefined });
    });
    it('counts approvals once and the data of each grant once for the summary line (A16)', () => {
        const g = (id: number, bytes: number) => ({
            id,
            kind: 'domains' as const,
            domains: ['a.org'],
            packages: [],
            bytes,
            max_bytes: 0,
            state: 'ended' as const,
            origin: 'agent' as const,
        });
        const calls = [
            inet(1, 'internet', 'approved', { grant: g(1, 1024 * 1024) }),
            inet(2, 'internet_end', 'time', { grant: g(1, 1024 * 1024) }),
            inet(3, 'internet', 'rejected'),
            inet(4, 'internet_set', 'on', { via: 'user', grant: g(2, 2 * 1024 * 1024) }),
            call(5, 'a'),
        ];
        expect(accessTotals(calls)).toEqual({ approvals: 2, bytes: 3 * 1024 * 1024 });
        expect(accessSummaryOf(calls, 4)).toBe('2 approvals · 3 MB · 4 blocked');
        expect(accessSummaryOf([], 0)).toBe('0 approvals · 0 B · 0 blocked');
    });
    it('writes the Allowed and Limits rows of an approval', () => {
        expect(allowedLine({ kind: 'packages', domains: [], packages: ['pip:torch', 'pip:timm==1.0.11'] })).toBe(
            'pip torch any version · pip timm 1.0.11 · and the packages these need',
        );
        expect(allowedLine({ kind: 'domains', domains: ['a.org', 'b.org'], packages: [] })).toBe('a.org · b.org');
        expect(allowedLine({ kind: 'search', domains: [], packages: [] })).toContain('Commands stay offline');
        expect(allowedLine({ kind: 'full', domains: [], packages: [] })).toContain('Any address');
        const t = '2026-10-21T14:00:00Z';
        const u = '2026-10-21T14:30:00Z';
        expect(grantLimitsText({ kind: 'domains', max_bytes: 500 * 1024 * 1024, started_at: t, expires_at: u })).toBe(
            'Ends after 30 min or 500 MB, whichever comes first. You can switch it off any time.',
        );
        expect(
            grantLimitsText({ kind: 'packages', max_bytes: 4096 * 1024 * 1024, started_at: t, expires_at: u }),
        ).toContain('Ends when these packages are installed');
        expect(grantLimitsText({ kind: 'full', max_bytes: 0 })).toBe('');
    });
});

describe('activityChatName', () => {
    it('names a deleted chat "Deleted chat" whatever its record says', () => {
        expect(activityChatName({ title: 'Old talk', deleted: true })).toBe('Deleted chat');
    });

    it('shows the title, or "Untitled chat" without one', () => {
        expect(activityChatName({ title: 'Schweine' })).toBe('Schweine');
        expect(activityChatName({ title: '  ' })).toBe('Untitled chat');
    });
});

describe('viaLabel', () => {
    it('names the gateway "System" and the user "UI", bindings in capitals', () => {
        expect(viaLabel('orchestrator')).toBe('System');
        expect(viaLabel('user')).toBe('UI');
        expect(viaLabel('cli')).toBe('CLI');
        expect(viaLabel('mcp')).toBe('MCP');
        expect(viaLabel('api')).toBe('API');
        expect(viaLabel('')).toBe('');
    });
});

describe('isSystemRead', () => {
    it("knows the gateway's own reads for approval summaries", () => {
        expect(isSystemRead(call(1, 'a', { op: 'summary_read', via: 'orchestrator' }))).toBe(true);
        expect(isSystemRead(call(2, 'a'))).toBe(false);
        expect(isSystemRead(call(3, 'a', { op: 'internet' }))).toBe(false);
    });

    it('keeps a summary read out of the figures and out of the tool-call log', () => {
        const p = page([
            call(1, 'a', {
                op: 'summary_read',
                via: 'orchestrator',
                detail: 'for approval 12345678 (proposed): GET /datasets/16',
            }),
        ]);
        const rows = activityRows(p, 'platform');
        expect(rows).toHaveLength(1);
        expect(isSystemRead(rows[0].call)).toBe(true);
        expect(rows[0].log).toHaveLength(1);
    });
});

describe("shownText with the gateway's own reads", () => {
    it("counts the system's reads apart from the calls of the agent", () => {
        const reads = [
            call(1, 'a'),
            call(2, 'a', { op: 'summary_read', via: 'orchestrator' }),
            call(3, 'a', { op: 'summary_read', via: 'orchestrator' }),
        ];
        const rows = activityRows(page(reads), 'platform');
        expect(shownText(rows, 1, 'platform', '')).toBe('Shows 1 of 1 platform call and 2 reads by the system.');
        expect(shownText(rows, 1, 'all', '')).toBe('Shows 1 of 1 platform call and 2 reads by the system.');
        // An outcome filter is about the agent's calls.
        expect(shownText(rows, 1, 'platform', 'ok')).toBe('Shows 1 call with this result.');
    });
});

describe('the user\'s switch-off with ended approvals (issue #185)', () => {
    const g = (id: number, bytes: number) => ({
        id,
        kind: 'search' as const,
        domains: [],
        packages: [],
        bytes,
        max_bytes: 0,
        state: 'ended' as const,
        origin: 'user' as const,
    });
    it('names the number of ended approvals and sums their data', () => {
        const one = { ...inet(1, 'internet_set', 'off', { via: 'user' }), ended: [g(7, 1024 * 1024)] };
        expect(internetEvent(one)).toMatchObject({ title: 'Switched off by you · ended 1 approval' });
        expect(internetEvent(one).data).not.toBe('–');
        const two = { ...inet(2, 'internet_set', 'off', { via: 'user' }), ended: [g(7, 1024 * 1024), g(8, 1024 * 1024)] };
        expect(internetEvent(two)).toMatchObject({ title: 'Switched off by you · ended 2 approvals', result: 'switched off' });
        expect(endedTitle(3)).toBe('Switched off by you · ended 3 approvals');
    });
    it('keeps the old title without ended approvals', () => {
        expect(internetEvent(inet(3, 'internet_set', 'off', { via: 'user' })).title).toBe('Internet access switched off by you');
    });
});
