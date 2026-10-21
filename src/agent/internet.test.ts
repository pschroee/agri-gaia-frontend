// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import {
    activeGrants,
    appendConnections,
    connectionsQuery,
    emptyConnectionsPage,
    endedTransition,
    internetEvent,
    normalizeBlocked,
    normalizeConnectionsPage,
    normalizeGrant,
    normalizeGrants,
    upsertGrant,
    type Connection,
    type InternetGrant,
} from './internet';

const grant = (over: Partial<InternetGrant> = {}): InternetGrant => ({
    id: 1,
    chat_id: 'c1',
    kind: 'search',
    origin: 'agent',
    domains: [],
    packages: [],
    state: 'active',
    max_minutes: 30,
    max_bytes: 500 * 1048576,
    bytes: 0,
    blocked: 0,
    created_at: '2026-10-21T14:00:00Z',
    ...over,
});

const conn = (id: number): Connection => ({
    id,
    chat_id: 'c1',
    method: 'CONNECT',
    host: 'example.org',
    port: 443,
    status: 200,
    bytes_up: 0,
    bytes_down: 0,
    started_at: '2026-10-21T14:00:00Z',
    duration_ms: 1,
    origin: 'exec',
    count: 1,
});

describe('normalizeGrant', () => {
    it('turns null lists into empty lists and fills missing counters', () => {
        const g = normalizeGrant({ id: 3, kind: 'domains', domains: null, packages: null, state: 'active' });
        expect(g?.domains).toEqual([]);
        expect(g?.packages).toEqual([]);
        expect(g?.bytes).toBe(0);
        expect(g?.max_bytes).toBe(0);
        expect(g?.blocked).toBe(0);
    });

    it('keeps the package objects with their state and drops anything else', () => {
        const g = normalizeGrant({
            id: 3,
            kind: 'packages',
            packages: [{ ecosystem: 'pip', name: 'torch', state: 'waiting' }, 'pip:torch', null],
        });
        expect(g?.packages).toEqual([{ ecosystem: 'pip', name: 'torch', state: 'waiting' }]);
    });

    it('rejects something that is no grant', () => {
        expect(normalizeGrant(null)).toBeUndefined();
        expect(normalizeGrant({ kind: 'search' })).toBeUndefined();
        expect(normalizeGrant({ id: 1 })).toBeUndefined();
    });
});

describe('grant lists', () => {
    it('sorts newest first', () => {
        const list = normalizeGrants([
            { id: 1, kind: 'search' },
            { id: 5, kind: 'full' },
            { id: 3, kind: 'domains' },
        ]);
        expect(list.map((g) => g.id)).toEqual([5, 3, 1]);
    });

    it('gives an empty list for something that is no list', () => {
        expect(normalizeGrants(undefined)).toEqual([]);
        expect(normalizeGrants({})).toEqual([]);
    });

    it('upsert replaces the grant with the same id and adds new ones in order', () => {
        const a = grant({ id: 1 });
        const b = grant({ id: 2 });
        const replaced = upsertGrant([b, a], grant({ id: 1, bytes: 10 }));
        expect(replaced.map((g) => g.id)).toEqual([2, 1]);
        expect(replaced[1].bytes).toBe(10);
        expect(upsertGrant([a], b).map((g) => g.id)).toEqual([2, 1]);
    });

    it('activeGrants keeps only the active ones', () => {
        const list = [grant({ id: 1 }), grant({ id: 2, state: 'ended' }), grant({ id: 3, state: 'pending' })];
        expect(activeGrants(list).map((g) => g.id)).toEqual([1]);
    });
});

describe('normalizeBlocked', () => {
    it('is undefined without refusals or for something malformed', () => {
        expect(normalizeBlocked(undefined)).toBeUndefined();
        expect(normalizeBlocked({ count: 0, since: 'x', last: [] })).toBeUndefined();
        expect(normalizeBlocked([])).toBeUndefined();
    });

    it('keeps count, since and the last entries', () => {
        const b = normalizeBlocked({ count: 4, since: '2026-10-21T14:05:00Z', last: [{ host: 'github.com', origin: 'exec', denied: 'x', at: 'y' }] });
        expect(b?.count).toBe(4);
        expect(b?.last).toHaveLength(1);
    });

    it('gives an empty list when last is missing', () => {
        expect(normalizeBlocked({ count: 1 })?.last).toEqual([]);
    });
});

describe('internetEvent', () => {
    it('reads an internet_grant event', () => {
        const ev = internetEvent(JSON.stringify({ kind: 'internet_grant', data: { id: 2, kind: 'full', domains: null } }));
        expect(ev?.kind).toBe('grant');
        if (ev?.kind === 'grant') {
            expect(ev.grant.id).toBe(2);
            expect(ev.grant.domains).toEqual([]);
        }
    });

    it('reads an internet_blocked event', () => {
        const ev = internetEvent(JSON.stringify({ kind: 'internet_blocked', data: { count: 2, since: 'x', last: [] } }));
        expect(ev?.kind).toBe('blocked');
    });

    it('ignores other events, broken JSON and empty data', () => {
        expect(internetEvent(JSON.stringify({ kind: 'search', data: { id: 'x' } }))).toBeUndefined();
        expect(internetEvent('not json')).toBeUndefined();
        expect(internetEvent(JSON.stringify({ kind: 'internet_grant', data: null }))).toBeUndefined();
        expect(internetEvent(JSON.stringify({ kind: 'internet_blocked', data: { count: 0 } }))).toBeUndefined();
    });
});

describe('endedTransition', () => {
    it('reports a grant that was active and ended by itself, with the other active ones counted', () => {
        const before = [grant({ id: 1 }), grant({ id: 2 }), grant({ id: 3, state: 'ended' })];
        const end = endedTransition(before, grant({ id: 1, state: 'ended', ended_reason: 'time' }));
        expect(end?.grant.id).toBe(1);
        expect(end?.others).toBe(1);
    });

    it('stays silent for the user own switch-off', () => {
        expect(endedTransition([grant()], grant({ state: 'ended', ended_reason: 'user' }))).toBeUndefined();
    });

    it('stays silent for a grant that was not active before or is not ended', () => {
        expect(endedTransition([], grant({ state: 'ended', ended_reason: 'time' }))).toBeUndefined();
        expect(endedTransition([grant({ state: 'ended' })], grant({ state: 'ended', ended_reason: 'time' }))).toBeUndefined();
        expect(endedTransition([grant()], grant({ bytes: 5 }))).toBeUndefined();
    });

    it('reports the end by the agent', () => {
        expect(endedTransition([grant()], grant({ state: 'ended', ended_reason: 'agent' }))?.grant.ended_reason).toBe('agent');
    });
});

describe('connectionsQuery', () => {
    it('writes the filter in a fixed order and always a limit', () => {
        expect(connectionsQuery({})).toBe('?limit=50');
        expect(connectionsQuery({ since: '2026-10-21T00:00:00Z', result: 'blocked' }, 12)).toBe(
            '?since=2026-10-21T00%3A00%3A00Z&result=blocked&before=12&limit=50',
        );
        expect(connectionsQuery({ chat: 'c1', grant: 7, origin: 'pkg', limit: 10 })).toBe('?chat=c1&grant=7&origin=pkg&limit=10');
    });
});

describe('connection pages', () => {
    it('fills what the gateway may leave out', () => {
        const p = normalizeConnectionsPage({ connections: null as unknown as Connection[], unlisted: null as unknown as [] });
        expect(p.connections).toEqual([]);
        expect(p.unlisted).toEqual([]);
        expect(p.total).toBe(0);
        expect(p.summary).toEqual(emptyConnectionsPage.summary);
        expect(normalizeConnectionsPage(undefined).connections).toEqual([]);
    });

    it('treats next_before 0 as the last page and total as the row count when missing', () => {
        const p = normalizeConnectionsPage({ connections: [conn(2), conn(1)], next_before: 0 });
        expect(p.next_before).toBeUndefined();
        expect(p.total).toBe(2);
    });

    it('appends a page without repeating rows and takes the totals of the newer page', () => {
        const shown = normalizeConnectionsPage({ connections: [conn(5), conn(4)], total: 9, next_before: 4 });
        const more = normalizeConnectionsPage({ connections: [conn(4), conn(3)], total: 9, summary: { count: 9, bytes_down: 1, bytes_up: 0, blocked: 2 } });
        const all = appendConnections(shown, more);
        expect(all.connections.map((c) => c.id)).toEqual([5, 4, 3]);
        expect(all.summary.blocked).toBe(2);
        expect(all.next_before).toBeUndefined();
    });
});
