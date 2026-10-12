// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchPlans, placePlans, planLabel, Plan, PlanStep, stepStatus } from './plan';
import type { Step, TranscriptItem } from './transcript';

const step = (over: Partial<PlanStep> = {}): PlanStep => ({
    idx: 1,
    method: 'GET',
    path: '/train/containers/7/model',
    effect: 'write',
    covered: true,
    state: 'open',
    ...over,
});

const plan = (over: Partial<Plan> = {}): Plan => ({
    id: 'p1',
    chat_id: 'c1',
    title: 'Build image',
    via: 'cli',
    state: 'proposed',
    created_at: '2026-10-12T10:00:00Z',
    steps: [step()],
    ...over,
});

const agent = (key: string, stepIds: string[]): TranscriptItem => ({
    kind: 'agent',
    key,
    parts: [
        {
            type: 'steps',
            steps: stepIds.map((id): Step => ({ id, tool: 'bash', status: 'done' })),
        },
    ],
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('stepStatus', () => {
    it('maps state and covered', () => {
        expect(stepStatus(step({ state: 'done' }))).toBe('done');
        expect(stepStatus(step({ state: 'running' }))).toBe('running');
        expect(stepStatus(step({ state: 'failed' }))).toBe('failed');
        expect(stepStatus(step({ state: 'open', covered: true }))).toBe('open');
        expect(stepStatus(step({ state: 'open', covered: false, effect: 'irreversible' }))).toBe('approval');
    });
});

describe('planLabel', () => {
    const now = Date.parse('2026-10-12T10:00:00Z');

    it('shows expiry and states', () => {
        const until = new Date(now + 30 * 60 * 1000).toISOString();
        expect(planLabel(plan({ state: 'proposed' }), now)).toBe('Waiting for your approval');
        expect(planLabel(plan({ state: 'approved', expires_at: until }), now)).toMatch(/^Approved · valid until \d{2}:\d{2}$/);
        expect(planLabel(plan({ state: 'approved', expires_at: until }), now + 31 * 60 * 1000)).toBe('Expired');
        expect(planLabel(plan({ state: 'completed' }), now)).toBe('Completed');
        expect(planLabel(plan({ state: 'rejected' }), now)).toBe('Not approved');
        expect(planLabel(plan({ state: 'expired' }), now)).toBe('Expired');
        expect(planLabel(plan({ state: 'failed' }), now)).toBe('Stopped: a step failed');
        expect(planLabel(plan({ state: 'superseded' }), now)).toBe('Replaced by a newer plan');
    });
});

describe('placePlans', () => {
    it('puts a plan under the answer with its tool call', () => {
        const items = [agent('a1', ['t0']), agent('a2', ['t1'])];
        const p = plan({ tool_call_id: 't1', session: 'main' });
        const { byItem, rest } = placePlans(items, [p], true);
        expect(byItem.get('a2')).toEqual([p]);
        expect(byItem.has('a1')).toBe(false);
        expect(rest).toEqual([]);
    });

    it('keeps subagent plans out of the main chat', () => {
        const items = [agent('a1', ['t1'])];
        const sub = plan({ id: 'sub', tool_call_id: 't1', session: 'sub-run-2' });
        const main = plan({ id: 'main', tool_call_id: 't1', session: 'main' });
        const shown = placePlans(items, [sub, main], true);
        expect(shown.byItem.get('a1')).toEqual([main]);
        expect(shown.rest).toEqual([]);
        const inSubagent = placePlans(items, [sub, main], false);
        expect(inSubagent.byItem.get('a1')).toEqual([sub, main]);
    });
});

describe('fetchPlans', () => {
    it('returns [] on 404', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response(null, { status: 404, statusText: 'Not Found' })),
        );
        await expect(fetchPlans('c1')).resolves.toEqual([]);
    });
});
