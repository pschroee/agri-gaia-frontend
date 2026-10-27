// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import type { Plan, PlanStep } from './plan';
import {
    budgetRowsOf,
    waitingInfo,
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
    stepRefText,
    stopJobAllowed,
    imageOriginText,
    uncoveredSummary,
    uncoveredText,
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

/**
 * The same plan with a compute call among its steps: the gateway names no kind per call, so the kind a compute call
 * shows comes from the plan's own steps (L12).
 */
const withComputeStep = (over: Partial<Plan> = {}): Plan =>
    plan({ steps: [step({ idx: 1 }), step({ idx: 2, state: 'running', effect: 'compute' })], ...over });

describe('the budget block (L12)', () => {
    it('names the duration with the time it ends at', () => {
        // the two hours run from the decision, as the design shows them: decided 14:51, ends 16:51
        const now = Date.parse('2026-10-16T14:51:00.000Z');
        expect(maxDurationText(plan({ decided_at: '2026-10-16T14:51:00.000Z' }), now)).toBe('2 h · ends today 16:51');
    });

    it('lists only what the plan carries, the compute calls always', () => {
        const rows = budgetRowsOf(withComputeStep(), Date.parse('2026-10-16T14:00:00.000Z'));
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
        expect(computeText(withComputeStep())).toBe('1 (training)');
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
    it('counts the steps done of all, as the ring and the task count do (#221)', () => {
        const p = plan({
            steps: [
                step({ idx: 1, state: 'done' }),
                step({ idx: 2, state: 'running', summary: 'Run training "EfficientNet-B0" on the dataset\n10 epochs' }),
                step({ idx: 3, state: 'open' }),
            ],
        });
        expect(indicatorLabel(p, 'page')).toBe('Plan 1/3');
        expect(indicatorLabel(p, 'panel')).toBe('Plan 1/3');
        expect(indicatorLabel(p, 'mobile')).toBe('1/3');
    });

    it('the tooltip of a proposed plan says it waits for the approval', () => {
        const p = plan({ state: 'proposed', steps: [step({ idx: 1 }), step({ idx: 2 })] });
        expect(indicatorTooltip(p, NONE)).toBe('Plan with 2 steps waits for your approval · click to show the plan');
        expect(indicatorTooltip({ ...p, approving: true }, NONE)).toBe(
            'Plan with 2 steps is being approved · click to show the plan',
        );
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

describe('stepRefText (#177)', () => {
    it('names the kind and the id, and the label when there is one', () => {
        expect(stepRefText({ step: 1, resource: 'dataset', id: '66' })).toBe('Step 1 created dataset 66');
        expect(stepRefText({ step: 1, resource: 'dataset', id: '66', label: 'a-train' })).toBe(
            'Step 1 created dataset 66 "a-train"',
        );
        expect(stepRefText({ step: 3, resource: 'training', id: '4' })).toBe('Step 3 created training container 4');
        expect(stepRefText({ step: 2, resource: 'model', id: '9' })).toBe('Step 2 created model 9');
        expect(stepRefText({ step: 2, resource: '', id: '9' })).toBe('Step 2 created resource 9');
    });

    it('drops a label that only repeats the kind and the id (#182)', () => {
        expect(stepRefText({ step: 1, resource: 'dataset', id: '66', label: 'dataset 66' })).toBe('Step 1 created dataset 66');
        expect(stepRefText({ step: 3, resource: 'training', id: '4', label: 'Training container 4' })).toBe('Step 3 created training container 4');
        expect(stepRefText({ step: 1, resource: 'dataset', id: '66', label: 'dataset 66 copy' })).toBe('Step 1 created dataset 66 "dataset 66 copy"');
    });
});

describe('why a step asks again (gateway #219)', () => {
    it('names the reason by its code, a plain line for an unknown or missing code', () => {
        const text = (code?: string) => uncoveredText(step({ covered: false, uncovered_reason: code }));
        expect(text('irreversible')).toBe('Asks you again before it runs: it cannot be undone');
        expect(text('image_origin')).toBe(
            'Asks you again before it runs: it starts an image on a device that this plan does not build',
        );
        expect(text('runs_code')).toBe('Asks you again before it runs: it runs code the gateway cannot check');
        expect(text('something_new')).toBe('Asks you again before it runs');
        expect(text(undefined)).toBe('Asks you again before it runs');
    });

    it('says where the image of a covered start comes from', () => {
        expect(imageOriginText(step({ image_origin: { step: 1 } }))).toBe(
            'Covered by this approval: the image is built in step 1',
        );
        expect(imageOriginText(step({ image_origin: { plan_id: 'p0', step: 8 } }))).toBe(
            'Covered by this approval: the image was built in step 8 of the plan this one replaces',
        );
        expect(imageOriginText(step())).toBe('');
    });

    it('sums up the steps that ask again, leaving finished ones out', () => {
        const asks = (idx: number, state: PlanStep['state'] = 'open') => step({ idx, covered: false, state });
        const of = (...steps: PlanStep[]) => uncoveredSummary(plan({ steps }));
        expect(of(step({ idx: 1 }), step({ idx: 2 }))).toBe('');
        expect(of(step({ idx: 1 }), asks(2))).toBe('Step 2 asks you again on its own');
        expect(of(asks(4), asks(9))).toBe('Steps 4 and 9 ask you again on their own');
        expect(of(asks(1), asks(4), asks(9))).toBe('Steps 1, 4 and 9 ask you again on their own');
        expect(of(asks(1, 'done'), asks(2))).toBe('Step 2 asks you again on its own');
    });
});

describe('waitingInfo (issue #256)', () => {
    const idle = 'The agent is idle while it waits and uses no turns or model cost.';
    it('names the job of each kind, then the idle note', () => {
        expect(waitingInfo('platform_task')).toBe(`The platform is building the training image. ${idle}`);
        expect(waitingInfo('training_run')).toBe(`The training runs on the platform. ${idle}`);
        expect(waitingInfo('image_build')).toBe(`The platform is building the inference image. ${idle}`);
        expect(waitingInfo('edge_deployment')).toBe(`The edge device is pulling and starting the container. ${idle}`);
        expect(waitingInfo('assessment')).toBe(`The gateway is checking the model. ${idle}`);
    });
    it('falls back to a general sentence for an unknown or missing kind', () => {
        expect(waitingInfo()).toBe(`The platform is working on this step. ${idle}`);
        expect(waitingInfo('something_else')).toBe(`The platform is working on this step. ${idle}`);
    });
});
