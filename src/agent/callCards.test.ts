// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The cut of a group of tool calls after every call a card hangs on (issue #192).

import { describe, expect, it } from 'vitest';

import { boundTo, callAnchors, splitAfter } from './callCards';
import type { CallCardsCtx } from './callCards';
import type { WatchJob } from './jobs';
import type { Step } from './transcript';
import type { Approval } from './types';

const step = (id: string, over: Partial<Step> = {}): Step => ({ id, tool: 'bash', status: 'done', ...over });
const steps = (n: number): Step[] => Array.from({ length: n }, (_, i) => step(`s${i + 1}`));
const approval = (over: Partial<Approval>): Approval =>
    ({
        id: 'a1',
        chat_id: 'c1',
        kind: 'internet_access',
        via: 'cli',
        name: 'x',
        size: 0,
        sha256: '',
        content_type: '',
        state: 'approved',
        created_at: '2026-10-21T10:00:00.000Z',
        tool_call_id: 's2',
        ...over,
    } as Approval);
const ctx = (over: Partial<CallCardsCtx> = {}): CallCardsCtx => ({
    jobs: [],
    searchOn: false,
    annotation: [],
    checks: [],
    ...over,
});
const ids = (groups: Step[][]) => groups.map((g) => g.map((s) => s.id).join(','));

describe('boundTo', () => {
    it('matches the step id and the call id, never a missing id', () => {
        expect(boundTo({ tool_call_id: 'a' }, { id: 'a' })).toBe(true);
        expect(boundTo({ tool_call_id: 'c' }, { id: 'a', callId: 'c' })).toBe(true);
        expect(boundTo({ tool_call_id: 'x' }, { id: 'a', callId: 'c' })).toBe(false);
        expect(boundTo({}, { id: 'a' })).toBe(false);
        expect(boundTo({ tool_call_id: '' }, { id: '' })).toBe(false);
    });
});

describe('splitAfter', () => {
    it('keeps one piece without an anchor', () => {
        expect(ids(splitAfter(steps(3), new Set()))).toEqual(['s1,s2,s3']);
    });
    it('cuts after the anchor, never leaving an empty piece', () => {
        expect(ids(splitAfter(steps(4), new Set(['s2'])))).toEqual(['s1,s2', 's3,s4']);
        expect(ids(splitAfter(steps(4), new Set(['s4'])))).toEqual(['s1,s2,s3,s4']);
        expect(ids(splitAfter(steps(3), new Set(['s1', 's2'])))).toEqual(['s1', 's2', 's3']);
    });
});

describe('callAnchors', () => {
    it('finds no anchor without cards', () => {
        expect(callAnchors(steps(3), ctx()).size).toBe(0);
    });
    it('cuts the package case of the author: four calls, the request at the second', () => {
        const a = approval({ kind: 'internet_access', tool_call_id: 's2' });
        for (const state of ['approved', 'expired'] as const) {
            const anchors = callAnchors(steps(4), ctx({ approvals: [{ ...a, state }] }));
            expect(ids(splitAfter(steps(4), anchors))).toEqual(['s1,s2', 's3,s4']);
        }
    });
    it('does not cut at an open approval, except a plan', () => {
        expect(callAnchors(steps(3), ctx({ approvals: [approval({ state: 'pending' })] })).size).toBe(0);
        expect(callAnchors(steps(3), ctx({ approvals: [approval({ kind: 'plan', state: 'pending' })] })).has('s2')).toBe(true);
    });
    it('cuts at decided platform calls of every state', () => {
        for (const state of ['approved', 'rejected', 'expired'] as const)
            expect(
                callAnchors(steps(3), ctx({ approvals: [approval({ kind: 'platform_write', state })] })).has('s2'),
            ).toBe(true);
    });
    it('binds through the call id of an MCP step', () => {
        const list = [step('s1'), step('log-2', { callId: 'call-2' })];
        const anchors = callAnchors(list, ctx({ approvals: [approval({ tool_call_id: 'call-2' })] }));
        expect([...anchors]).toEqual(['log-2']);
    });
    it('cuts at a plan placed after a call, open or decided', () => {
        const plans = [{ afterCallId: 's2' }] as never;
        expect(callAnchors(steps(3), ctx({ plans })).has('s2')).toBe(true);
    });
    it('cuts a notebook run at the 4th of 6 calls', () => {
        const job = { id: 'j1', chat_id: 'c1', kind: 'notebook_run', state: 'running', tool_call_id: 's4' } as WatchJob;
        expect(ids(splitAfter(steps(6), callAnchors(steps(6), ctx({ jobs: [job] }))))).toEqual(['s1,s2,s3,s4', 's5,s6']);
    });
    it('cuts at a decided notebook approval without a job', () => {
        const a = approval({ kind: 'platform_write', state: 'rejected', tool_call_id: 's3', notebook: {} as never });
        expect(callAnchors(steps(5), ctx({ approvals: [a] })).has('s3')).toBe(true);
    });
    it('counts searches only when the search environment exists', () => {
        const searches = [{ tool_call_id: 's2' }];
        expect(callAnchors(steps(3), ctx({ searches })).size).toBe(0);
        expect(callAnchors(steps(3), ctx({ searches, searchOn: true })).has('s2')).toBe(true);
    });
    it('cuts after a subagent call: three and two calls make two pieces (#197)', () => {
        const anchors = callAnchors(steps(5), ctx({ subagentCalls: new Set(['s3']) }));
        expect(ids(splitAfter(steps(5), anchors))).toEqual(['s1,s2,s3', 's4,s5']);
    });
    it('puts one piece at an anchor on the last call', () => {
        const anchors = callAnchors(steps(3), ctx({ approvals: [approval({ tool_call_id: 's3' })] }));
        expect(ids(splitAfter(steps(3), anchors))).toEqual(['s1,s2,s3']);
    });
});
