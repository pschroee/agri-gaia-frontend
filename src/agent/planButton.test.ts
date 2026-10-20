// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import {
    currentPlan,
    newestPlan,
    planAriaLabel,
    planButtonLabel,
    planEntrySub,
    planEntryTitle,
    planMark,
    planStateWord,
} from './planButton';
import type { Plan, PlanStep } from './plan';

const step = (over: Partial<PlanStep> = {}): PlanStep => ({
    idx: 1,
    method: 'PATCH',
    path: '/datasets/16',
    effect: 'write',
    covered: true,
    state: 'open',
    ...over,
});

const plan = (over: Partial<Plan> = {}): Plan => ({
    id: 'p1',
    chat_id: 'c1',
    via: 'cli',
    state: 'proposed',
    created_at: '2026-10-12T10:00:00Z',
    steps: [step()],
    ...over,
});

const NOW = Date.parse('2026-10-12T10:05:00Z');
const validUntil = new Date(NOW + 10 * 60 * 1000).toISOString();

describe('planMark', () => {
    it('marks the plan that needs attention, runs, is done or failed', () => {
        expect(planMark(plan({ state: 'proposed' }), NOW)).toBe('approval');
        expect(planMark(plan({ state: 'approved', expires_at: validUntil }), NOW)).toBe('running');
        expect(planMark(plan({ state: 'completed' }), NOW)).toBe('done');
        expect(planMark(plan({ state: 'failed' }), NOW)).toBe('failed');
    });

    it('leaves an approved plan past its time and the decided states unmarked', () => {
        expect(planMark(plan({ state: 'approved', expires_at: validUntil }), NOW + 11 * 60 * 1000)).toBe('plain');
        // the card shows "Expired" for an approved plan without an expiry, so the button does not run either
        expect(planMark(plan({ state: 'approved' }), NOW)).toBe('plain');
        expect(planMark(plan({ state: 'rejected' }), NOW)).toBe('plain');
        expect(planMark(plan({ state: 'expired' }), NOW)).toBe('plain');
        expect(planMark(plan({ state: 'superseded' }), NOW)).toBe('plain');
    });
});

describe('currentPlan', () => {
    const running = plan({
        id: 'run',
        state: 'approved',
        expires_at: validUntil,
        created_at: '2026-10-12T09:00:00Z',
    });
    const waiting = plan({ id: 'wait', state: 'proposed', created_at: '2026-10-12T08:00:00Z' });
    const newest = plan({ id: 'new', state: 'completed', created_at: '2026-10-12T09:30:00Z' });

    it('takes the plan waiting for approval first, then a running one, else the newest', () => {
        expect(currentPlan([newest, running, waiting], NOW)?.id).toBe('wait');
        expect(currentPlan([newest, running], NOW)?.id).toBe('run');
        expect(currentPlan([newest], NOW)?.id).toBe('new');
    });

    it('shows nothing without a plan (the button is then hidden)', () => {
        expect(currentPlan([], NOW)).toBeUndefined();
    });

    it('does not take an expired approval for a running plan', () => {
        const expired = plan({ id: 'old', state: 'approved', expires_at: validUntil, created_at: '2026-10-12T09:59:00Z' });
        expect(currentPlan([expired], NOW + 11 * 60 * 1000)?.id).toBe('old');
        expect(planMark(currentPlan([expired], NOW + 11 * 60 * 1000) as Plan, NOW + 11 * 60 * 1000)).toBe('plain');
    });
});

describe('newestPlan', () => {
    it('takes the newest by its date, whatever the order of the list', () => {
        const older = plan({ id: 'o', created_at: '2026-10-11T10:00:00Z' });
        const newer = plan({ id: 'n', created_at: '2026-10-12T10:00:00Z' });
        expect(newestPlan([older, newer])?.id).toBe('n');
        expect(newestPlan([newer, older])?.id).toBe('n');
    });

    it('falls back to the order of the gateway (newest first) without a usable date', () => {
        expect(newestPlan([plan({ id: 'x', created_at: 'unknown' }), plan({ id: 'y', created_at: '' })])?.id).toBe('x');
        expect(newestPlan([])).toBeUndefined();
    });
});

describe('the words of the plan button', () => {
    it('names the state in one word', () => {
        expect(planStateWord(plan({ state: 'proposed' }), NOW)).toBe('Waiting');
        expect(planStateWord(plan({ state: 'approved', expires_at: validUntil }), NOW)).toBe('Running');
        expect(planStateWord(plan({ state: 'completed' }), NOW)).toBe('Completed');
        expect(planStateWord(plan({ state: 'failed' }), NOW)).toBe('Failed');
        expect(planStateWord(plan({ state: 'rejected' }), NOW)).toBe('Not approved');
        expect(planStateWord(plan({ state: 'expired' }), NOW)).toBe('Expired');
        expect(planStateWord(plan({ state: 'superseded' }), NOW)).toBe('Replaced');
    });

    it('labels the button, compact where the chat area is narrow (the panel)', () => {
        expect(planButtonLabel(plan({ state: 'completed' }), NOW, false)).toBe('Plan · Completed');
        expect(planButtonLabel(plan({ state: 'completed' }), NOW, true)).toBe('Plan');
    });

    it('speaks the state and the number of plans of the chat', () => {
        expect(planAriaLabel(1, plan({ state: 'proposed' }), NOW)).toBe('Show plans (1 plan, current: Waiting for your approval)');
        expect(planAriaLabel(3, plan({ state: 'completed' }), NOW)).toBe('Show plans (3 plans, current: Completed)');
    });
});

describe('the entries of the plan list', () => {
    it("titles an entry with the agent's title, else with the gateway's first step", () => {
        expect(planEntryTitle(plan({ agent_title: ' Take over and build ' }))).toBe('Take over and build');
        expect(planEntryTitle(plan({ title: 'Old title' }))).toBe('Old title');
        expect(
            planEntryTitle(
                plan({ steps: [step({ summary: 'Rename dataset 16 "a" → "b"\nCurrent values as they will be after.' })] }),
            ),
        ).toBe('Rename dataset 16 "a" → "b"');
        // without a summary of the gateway the call itself stands there (older plans)
        expect(planEntryTitle(plan({ steps: [step()] }))).toBe('PATCH /datasets/16');
        expect(planEntryTitle(plan({ steps: [] }))).toBe('Plan');
    });

    it('adds the state and the number of steps in a second line', () => {
        const two = plan({ state: 'proposed', steps: [step(), step({ idx: 2 })] });
        expect(planEntrySub(two, NOW)).toBe('Waiting for your approval · 2 steps');
        expect(planEntrySub(plan({ state: 'completed', steps: [step()] }), NOW)).toBe('Completed · 1 step');
    });
});

describe('a plan whose approval is on its way (issue #166)', () => {
    it('counts as running and says "Approving…"', () => {
        const p = plan({ state: 'proposed', approving: true });
        expect(planMark(p, NOW)).toBe('running');
        expect(planStateWord(p, NOW)).toBe('Approving…');
        expect(planStateWord(plan({ state: 'proposed' }), NOW)).toBe('Waiting');
    });
});
