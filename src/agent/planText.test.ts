// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import type { Plan, PlanStep } from './plan';
import {
    budgetRowsOf,
    cancelConfirmText,
    cancelledText,
    completedText,
    computeStepLine,
    computeText,
    failedText,
    failedTitle,
    indicatorLabel,
    indicatorTooltip,
    logTail,
    maxDurationText,
    pauseAllowed,
    pauseText,
    pauseTitle,
    planChip,
    rejectText,
    resumeAllowed,
    runningPlansLine,
    statusProgress,
    statusWaiting,
    stopJobAllowed,
} from './planText';

const step = (over: Partial<PlanStep> = {}): PlanStep => ({
    idx: 1,
    method: 'POST',
    path: '/datasets',
    effect: 'write',
    covered: true,
    state: 'open',
    ...over,
});

const plan = (over: Partial<Plan> = {}): Plan => ({
    id: 'p1',
    chat_id: 'c1',
    via: 'cli',
    state: 'approved',
    mode: 'autonomous',
    created_at: '2026-10-16T12:00:00.000Z',
    decided_at: '2026-10-16T12:00:30.000Z',
    budget: { max_duration_s: 7200, max_llm_cost: 1.5, max_auto_turns: 20 },
    usage: { llm_cost: 0.42, auto_turns: 3, compute_used: 1, compute_max: 3 },
    steps: [step({ idx: 1, state: 'done' }), step({ idx: 2, state: 'running' })],
    ...over,
});

const NONE: ReadonlySet<string> = new Set<string>();

describe('planChip', () => {
    it('names the state, the panel a little shorter for the platform wait', () => {
        expect(planChip(plan({ state: 'proposed' }), 'page', NONE)).toBe('Needs approval');
        expect(planChip(plan(), 'page', NONE)).toBe('Running');
        expect(planChip(plan({ steps: [step({ state: 'waiting' })] }), 'page', NONE)).toBe('Waiting for platform');
        expect(planChip(plan({ steps: [step({ state: 'waiting' })] }), 'panel', NONE)).toBe('Waiting');
        expect(planChip(plan({ state: 'paused' }), 'page', NONE)).toBe('Paused');
        expect(planChip(plan({ state: 'completed' }), 'page', NONE)).toBe('Completed');
        expect(planChip(plan({ state: 'failed' }), 'page', NONE)).toBe('Failed');
        expect(planChip(plan({ state: 'cancelled' }), 'page', NONE)).toBe('Cancelled');
    });

    it('a step that waits for the user makes it "Needs input"', () => {
        const p = plan({ steps: [step({ parked_approval: 'a1' })] });
        expect(planChip(p, 'page', NONE)).toBe('Running');
        expect(planChip(p, 'page', new Set(['a1']))).toBe('Needs input');
    });
});

describe('the pause texts (L2 and the design decisions)', () => {
    it('one title per reason', () => {
        expect(pauseTitle('user')).toBe('Paused by you');
        expect(pauseTitle('abort')).toBe('Paused – you stopped the agent');
        expect(pauseTitle('login')).toBe('Paused – platform login lost');
        expect(pauseTitle('budget_turns')).toBe('Paused – turn budget used up');
        expect(pauseTitle('budget_cost')).toBe('Paused – model cost limit reached');
        expect(pauseTitle('restart')).toBe('Paused – agent gateway restarted');
    });

    it('the text names what happens next per reason', () => {
        const at = (reason: string) => pauseText(plan({ state: 'paused', pause_reason: reason }));
        expect(at('user')).toContain('The training job keeps running on the platform.');
        expect(at('user')).toContain('Step 2 starts when you resume.');
        expect(at('abort')).toContain('You stopped the agent.');
        expect(at('abort')).toContain('Running platform jobs keep running.');
        expect(at('login')).toContain('resumes by itself when you open any platform page again');
        expect(at('restart')).toContain('The gateway restarted');
        expect(at('budget_turns')).toBe(
            'The budget cannot be raised. Cancel the plan, or ask the agent for a new plan with a larger budget.',
        );
        expect(at('budget_cost')).toBe(at('budget_turns'));
    });
});

describe('the controls per state', () => {
    it('pause while it runs, resume unless the budget is used up, cancel while it lives (L1)', () => {
        expect(pauseAllowed(plan())).toBe(true);
        expect(pauseAllowed(plan({ state: 'paused' }))).toBe(false);

        expect(resumeAllowed(plan({ state: 'paused', pause_reason: 'user' }))).toBe(true);
        expect(resumeAllowed(plan({ state: 'paused', pause_reason: 'restart' }))).toBe(true);
        expect(resumeAllowed(plan({ state: 'paused', pause_reason: 'budget_turns' }))).toBe(false);
        expect(resumeAllowed(plan({ state: 'paused', pause_reason: 'budget_cost' }))).toBe(false);
        expect(resumeAllowed(plan())).toBe(false);
    });

    it('stop job only for a step that observes a running job (D2.9)', () => {
        const waiting = step({ state: 'waiting', watch_job: 'j1' });
        expect(stopJobAllowed(waiting, 'running')).toBe(true);
        expect(stopJobAllowed(waiting, 'done')).toBe(false);
        expect(stopJobAllowed(step({ state: 'running' }), 'running')).toBe(false);
        expect(stopJobAllowed(undefined, 'running')).toBe(false);
    });
});

describe('the cancel dialog (D1.10, L14)', () => {
    it('says that the platform keeps working and what stays', () => {
        const p = plan({
            steps: [
                step({ idx: 1, state: 'done', outputs: [{ resource: 'dataset', id: '7' }] }),
                step({ idx: 2, state: 'waiting', watch_job: 'j1' }),
                step({ idx: 3, state: 'open' }),
            ],
        });
        const text = cancelConfirmText(p);
        expect(text).toContain('Steps 2–3 will not run.');
        expect(text).toContain('The training job keeps running on the platform');
        expect(text).toContain('stop it with Stop job');
        expect(text).toContain('Dataset from earlier steps stays on the platform.');
    });

    it('without a running job and without created objects only the first sentence', () => {
        const p = plan({ steps: [step({ idx: 1, state: 'open' }), step({ idx: 2, state: 'open' })] });
        expect(cancelConfirmText(p)).toBe('Steps 1–2 will not run.');
    });

    it('never promises that a job is stopped', () => {
        const text = cancelConfirmText(plan({ steps: [step({ state: 'waiting', watch_job: 'j1' })] }));
        expect(text).not.toContain('will be stopped');
    });
});

describe('the end states', () => {
    it('completed names the duration, cancelled says the jobs were not stopped', () => {
        const done = plan({ state: 'completed', ended_at: '2026-10-16T12:41:30.000Z' });
        expect(completedText(done)).toBe('All 2 steps done in 41 min, without further input.');
        const cancelled = plan({ state: 'cancelled', ended_at: '2026-10-16T12:41:30.000Z' });
        expect(cancelledText(cancelled)).toBe('Cancelled by you at 12:41. Running platform jobs were not stopped.');
    });

    it('failed names the step and its attempts, and what did not run', () => {
        const p = plan({
            state: 'failed',
            steps: [
                step({ idx: 1, state: 'done' }),
                step({ idx: 2, state: 'done' }),
                step({ idx: 3, state: 'failed', attempts: 2 }),
                step({ idx: 4, state: 'open' }),
            ],
        });
        expect(failedTitle(p)).toBe('Step 3 failed after 2 attempts');
        expect(failedText(p)).toBe('Steps 1–2 are done and stay. Step 4 did not run.');
    });

    it('one step, one attempt', () => {
        const p = plan({ state: 'failed', steps: [step({ idx: 1, state: 'failed', attempts: 1 })] });
        expect(failedTitle(p)).toBe('Step 1 failed after 1 attempt');
        expect(failedText(p)).toBe('No step before this one ran.');
    });
});

describe('the reject line of an embedded approval (L10)', () => {
    it('names what stays, or ends after the first sentence', () => {
        const withOutput = plan({
            steps: [
                step({ idx: 1, state: 'done', outputs: [{ resource: 'dataset', id: '7' }] }),
                step({ idx: 2, covered: false, effect: 'irreversible' }),
            ],
        });
        expect(rejectText(withOutput, withOutput.steps[1])).toBe(
            'Reject skips step 2 and ends the plan. Dataset stays.',
        );
        const fresh = plan({ steps: [step({ idx: 1, covered: false, effect: 'irreversible' })] });
        expect(rejectText(fresh, fresh.steps[0])).toBe('Reject skips step 1 and ends the plan.');
    });
});

describe('the budget block (L12)', () => {
    it('names the duration with the time it ends at', () => {
        const now = Date.parse('2026-10-16T14:51:00.000Z');
        expect(maxDurationText(plan(), now)).toBe('2 h · ends today 15:51');
    });

    it('lists only what the plan carries, the compute calls always', () => {
        const rows = budgetRowsOf(plan(), Date.parse('2026-10-16T14:00:00.000Z'));
        expect(rows.map((r) => r.label)).toEqual([
            'Max duration',
            'Model cost limit',
            'Turns without you',
            'Compute calls',
        ]);
        expect(rows[1].value).toBe('1.50 USD');
        expect(rows[2].value).toBe('20');
        expect(rows[3].value).toBe('1 (training)');

        const plain = budgetRowsOf(
            plan({ budget: { max_duration_s: 0, max_llm_cost: 0, max_auto_turns: 0 }, usage: undefined }),
            Date.now(),
        );
        expect(plain.map((r) => r.label)).toEqual(['Compute calls']);
        expect(plain[0].value).toBe('0');
    });

    it('the compute line of a step names what is left', () => {
        const compute = step({ effect: 'compute' });
        expect(computeStepLine(plan(), compute)).toBe('Uses compute time · 2 of 3 compute calls left');
        expect(computeStepLine(plan(), step())).toBe('');
        expect(computeText(plan())).toBe('1 (training)');
        expect(computeText(plan({ usage: { llm_cost: 0, auto_turns: 0, compute_used: 0, compute_max: 3 } }))).toBe('0');
    });
});

describe('the status table (L21, L22)', () => {
    it('names the count and the chats', () => {
        expect(runningPlansLine(3, 3, '15:14:02')).toBe('3 across 3 chats · updated 15:14:02');
        expect(runningPlansLine(1, 1, '15:14:02')).toBe('1 across 1 chat · updated 15:14:02');
    });

    it('shows the percent and the time left while it runs, the runtime without a percent', () => {
        const now = Date.parse('2026-10-16T12:11:20.000Z');
        const running = plan({
            steps: [
                step({
                    idx: 1,
                    state: 'running',
                    started_at: '2026-10-16T12:00:00.000Z',
                    progress: 48,
                    eta: '2026-10-16T12:23:20.000Z',
                }),
            ],
        });
        expect(statusProgress(running, now)).toBe('48 % · ~12 min left');
        const without = plan({
            steps: [step({ idx: 1, state: 'waiting', started_at: '2026-10-16T12:00:00.000Z' })],
        });
        expect(statusProgress(without, now)).toBe('Runtime 11 min 20 s');
    });

    it('names the waiting time of a plan that needs input', () => {
        const now = Date.parse('2026-10-16T12:04:00.000Z');
        expect(statusWaiting('2026-10-16T12:00:00.000Z', now)).toBe('Waiting for you · 4 min');
        expect(statusWaiting(undefined, now)).toBe('Waiting for you');
    });
});

describe('the plan indicator (L15, L17, L18)', () => {
    it('counts the step the plan is on and cuts the title before its first quote', () => {
        const p = plan({
            steps: [
                step({ idx: 1, state: 'done' }),
                step({ idx: 2, state: 'running', summary: 'Run training "EfficientNet-B0" on the dataset\n10 epochs' }),
                step({ idx: 3, state: 'open' }),
            ],
        });
        expect(indicatorLabel(p, 'page')).toBe('Plan 2/3 · Run training');
        expect(indicatorLabel(p, 'panel')).toBe('Plan 2/3');
        expect(indicatorLabel(p, 'mobile')).toBe('2/3');
    });

    it('the tooltip names the state and the step', () => {
        const p = plan({ steps: [step({ idx: 1, state: 'done' }), step({ idx: 2, state: 'running' })] });
        expect(indicatorTooltip(p, NONE)).toBe('Plan running · step 2 of 2 · click to show the plan');
        expect(indicatorTooltip(plan({ state: 'completed' }), NONE)).toBe(
            'Plan completed · 2 of 2 steps · click to show the plan',
        );
        expect(indicatorTooltip(plan({ state: 'paused' }), NONE)).toBe(
            'Plan paused · step 2 of 2 · click to show the plan',
        );
        expect(indicatorTooltip(plan({ state: 'failed' }), NONE)).toBe(
            'Plan failed at step 2 of 2 · click to show the plan',
        );
        const waiting = plan({ steps: [step({ state: 'waiting' })] });
        expect(indicatorTooltip(waiting, NONE)).toBe(
            'Plan waiting for the platform · step 1 of 1 · click to show the plan',
        );
    });

    it('a waiting step of a running plan reads as its own sentence', () => {
        const p = plan({ steps: [step({ idx: 1, parked_approval: 'a1' })] });
        expect(indicatorTooltip(p, new Set(['a1']))).toBe('Step 1 of 1 needs your approval · click to show the plan');
    });
});

describe('the log tail', () => {
    it('keeps the newest lines and drops empty ones', () => {
        const text = Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n');
        const kept = logTail(text).split('\n');
        expect(kept).toHaveLength(20);
        expect(kept[0]).toBe('line 10');
        expect(kept[19]).toBe('line 29');
        expect(logTail('a\n\nb')).toBe('a\nb');
        expect(logTail(undefined)).toBe('');
    });
});
