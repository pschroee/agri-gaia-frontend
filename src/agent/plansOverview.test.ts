// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// What the cells of the plans table say (issue #223): the groups of the filter and the query, start, end and
// duration per state, the budget, the note under the chip, the current step per end state, and how an event of the
// stream changes the page.

import { describe, expect, it } from 'vitest';

import type { Plan, PlanStep } from './plan';
import {
    STATUS_GROUPS,
    applyPlanEvent,
    budgetCell,
    currentStepCell,
    durationCell,
    plansQuery,
    planEnd,
    planStart,
    rowTone,
    statusNote,
} from './plansOverview';
import type { PlanListItem, PlanPage } from './plansOverview';

const NOW = Date.parse('2026-10-26T12:00:00Z');
const ago = (s: number) => new Date(NOW - s * 1000).toISOString();
const NONE: ReadonlySet<string> = new Set();

const step = (idx: number, over: Partial<PlanStep> = {}): PlanStep => ({
    idx,
    summary: `Do thing ${idx}`,
    method: 'POST',
    path: `/x/${idx}`,
    effect: 'write',
    covered: true,
    state: 'open',
    ...over,
});

const plan = (over: Partial<PlanListItem> = {}): PlanListItem => ({
    id: 'p1',
    chat_id: 'c1',
    chat_title: 'Chat one',
    agent_title: 'A plan',
    via: 'cli',
    state: 'approved',
    mode: 'interactive',
    created_at: ago(600),
    decided_at: ago(540),
    steps: [step(1, { state: 'done' }), step(2), step(3)],
    ...over,
});

describe('status groups and query', () => {
    it('maps every group to its plan states', () => {
        const states = (v: string) => STATUS_GROUPS.find((g) => g.value === v)?.states;
        expect(states('')).toEqual([]);
        expect(states('active')).toEqual(['proposed', 'approved', 'paused']);
        expect(states('not_run')).toEqual(['rejected', 'expired', 'superseded']);
        expect(states('failed')).toEqual(['failed']);
    });

    it('leaves out empty parameters and counts the offset in rows', () => {
        expect(plansQuery({ status: '', mode: '', chat: '', page: 0, rowsPerPage: 25 }).toString()).toBe('limit=25');
        const q = plansQuery({ status: 'active', mode: 'autonomous', chat: 'c1', page: 2, rowsPerPage: 50 });
        expect(q.get('state')).toBe('proposed,approved,paused');
        expect(q.get('mode')).toBe('autonomous');
        expect(q.get('chat')).toBe('c1');
        expect(q.get('limit')).toBe('50');
        expect(q.get('offset')).toBe('100');
    });
});

describe('start, end and duration', () => {
    it('starts at the approval, else at the proposal', () => {
        expect(planStart(plan())).toBe(NOW - 540000);
        expect(planStart(plan({ decided_at: undefined }))).toBe(NOW - 600000);
    });

    it('ends at ended_at, else at the last finished step, never while it goes on', () => {
        expect(planEnd(plan({ state: 'approved' }))).toBeUndefined();
        expect(planEnd(plan({ state: 'completed', ended_at: ago(60) }))).toBe(NOW - 60000);
        const done = plan({
            state: 'completed',
            steps: [step(1, { state: 'done', done_at: ago(300) }), step(2, { state: 'done', done_at: ago(120) })],
        });
        expect(planEnd(done)).toBe(NOW - 120000);
    });

    it('counts the time so far for a running or paused plan', () => {
        expect(durationCell(plan({ state: 'approved' }), NOW)).toBe('9 min');
        expect(durationCell(plan({ state: 'paused' }), NOW)).toBe('9 min');
    });

    it('counts the whole time of an ended plan and the wait of a proposed one', () => {
        expect(durationCell(plan({ state: 'completed', ended_at: ago(240) }), NOW)).toBe('5 min');
        expect(durationCell(plan({ state: 'proposed', decided_at: undefined, created_at: ago(180) }), NOW)).toBe(
            'waiting 3 min',
        );
    });

    it('shows a dash for a plan that never ran', () => {
        for (const state of ['rejected', 'expired', 'superseded'] as const) {
            expect(durationCell(plan({ state }), NOW)).toBe('–');
        }
    });

    it('names no seconds from one minute on', () => {
        expect(durationCell(plan({ state: 'approved', decided_at: ago(30) }), NOW)).toBe('30 s');
        expect(durationCell(plan({ state: 'approved', decided_at: ago(3 * 3600 + 120 + 25) }), NOW)).toBe('3 h 2 min');
    });
});

describe('budget', () => {
    const auto = plan({
        mode: 'autonomous',
        budget: { max_duration_s: 7200, max_llm_cost: 1.5, max_auto_turns: 20 },
        usage: { llm_cost: 0.42, auto_turns: 3, compute_used: 0, compute_max: 4 },
        decided_at: ago(600),
    });

    it('is shown for an autonomous plan only', () => {
        const b = budgetCell(auto, NOW);
        expect(b?.main).toBe('0.42 / 1.50 USD');
        expect(b?.sub).toContain('3/20 turns');
        expect(b?.sub).toContain('left');
        expect(budgetCell(plan({ mode: 'interactive' }), NOW)).toBeUndefined();
    });
});

describe('note under the state chip', () => {
    it('names the pause reason, also after failed calls in a row', () => {
        expect(statusNote(plan({ state: 'paused', pause_reason: 'failed_calls' }), NONE)?.text).toBe(
            'Paused – stopped after failed tool calls in a row',
        );
        expect(statusNote(plan({ state: 'paused', pause_reason: 'user' }), NONE)?.text).toBe('Paused by you');
    });

    it('asks for the approval of a proposed plan', () => {
        expect(statusNote(plan({ state: 'proposed' }), NONE)).toEqual({
            text: 'Waits for your approval',
            tone: 'amber',
        });
    });

    it('names the step that waits for a single approval', () => {
        const parked = plan({ steps: [step(1, { state: 'done' }), step(2, { parked_approval: 'ap1' })] });
        expect(statusNote(parked, new Set(['ap1']))).toEqual({ text: 'Step 2 needs your approval', tone: 'amber' });
        expect(statusNote(parked, NONE)).toBeUndefined();
        const uncovered = plan({
            steps: [step(1, { state: 'done' }), step(2, { covered: false, effect: 'irreversible' })],
        });
        expect(statusNote(uncovered, NONE)?.text).toBe('Step 2 needs your approval');
    });

    it('says nothing for a plan that simply runs or is over', () => {
        expect(statusNote(plan(), NONE)).toBeUndefined();
        expect(statusNote(plan({ state: 'completed' }), NONE)).toBeUndefined();
    });
});

describe('current step', () => {
    it('shows the step, its title and its line for a plan that goes on', () => {
        const p = plan({
            steps: [
                step(1, { state: 'done' }),
                step(2, {
                    summary: 'Start training "flowers"',
                    state: 'waiting',
                    last_epoch: { epoch: 3, epochs: 10, values: { val_accuracy: 0.912, loss: 0.231 } },
                }),
            ],
        });
        const c = currentStepCell(p, NONE);
        expect(c.title).toBe('Step 2 · Start training');
        expect(c.sub).toBe('Epoch 3 of 10 · val_accuracy 0.912 · loss 0.231');
    });

    it('shows the error line of a failed step in red', () => {
        const p = plan({
            state: 'failed',
            steps: [step(1, { state: 'done' }), step(2, { state: 'failed', result: 'error 422: bad name' })],
        });
        const c = currentStepCell(p, NONE);
        expect(c.title).toBe('Step 2 · Do thing 2');
        expect(c.sub).toBe('error 422: bad name');
        expect(c.tone).toBe('red');
    });

    it('says how a plan that is over ended', () => {
        expect(currentStepCell(plan({ state: 'completed' }), NONE).title).toBe('All steps done');
        expect(currentStepCell(plan({ state: 'cancelled' }), NONE).title).toBe('Cancelled at step 2');
        expect(currentStepCell(plan({ state: 'rejected' }), NONE).title).toBe('Rejected');
        expect(currentStepCell(plan({ state: 'expired' }), NONE).title).toBe('Expired before approval');
        expect(currentStepCell(plan({ state: 'superseded' }), NONE).title).toBe('Replaced by a newer plan');
    });

    it('says why a step asks again', () => {
        const p = plan({
            steps: [
                step(1, { state: 'done' }),
                step(2, { covered: false, effect: 'irreversible', uncovered_reason: 'irreversible' }),
            ],
        });
        expect(currentStepCell(p, NONE).sub).toBe('Asks you again: it cannot be undone');
    });
});

describe('row tone', () => {
    it('is green while the plan goes on, amber while it waits for the user, none when over', () => {
        expect(rowTone(plan(), NONE)).toBe('active');
        expect(rowTone(plan({ state: 'proposed' }), NONE)).toBe('attention');
        expect(rowTone(plan({ state: 'paused' }), NONE)).toBe('attention');
        expect(rowTone(plan({ state: 'completed' }), NONE)).toBeUndefined();
    });
});

describe('applyPlanEvent', () => {
    const page = (plans: PlanListItem[]): PlanPage => ({ plans, total: plans.length, running: 1 });

    it('replaces the row of the same plan in the same group', () => {
        const old = plan({ id: 'a', state: 'approved' });
        const next = { ...old, state: 'paused' as Plan['state'], pause_reason: 'user' };
        const r = applyPlanEvent(page([old, plan({ id: 'b' })]), next);
        expect(r.reload).toBe(false);
        expect(r.page.plans[0]).toBe(next);
        expect(r.page.plans[1].id).toBe('b');
    });

    it('asks for a reload when a plan changes from going on to over', () => {
        const old = plan({ id: 'a', state: 'approved' });
        expect(applyPlanEvent(page([old]), { ...old, state: 'completed' }).reload).toBe(true);
    });

    it('asks for a reload for a plan the page does not hold', () => {
        const r = applyPlanEvent(page([plan({ id: 'a' })]), plan({ id: 'new' }));
        expect(r.reload).toBe(true);
        expect(r.page.plans).toHaveLength(1);
    });
});
