// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The words and rules of the plan dialog's step rows (issue #221).

import { describe, expect, it } from 'vitest';

import type { WatchJob } from './jobs';
import type { Plan, PlanStep } from './plan';
import { stepPhase } from './plan';
import {
    activityQuery,
    argRows,
    askLine,
    currentIdx,
    doneLine,
    resourceNoun,
    epochLine,
    metricPairs,
    planHeadLine,
    resolvedPath,
    resolvedRequest,
    stepCheck,
    stepSubline,
    stepTimes,
    waitingFor,
} from './planDetail';
import type { AssessCheck } from './types';

const step = (over: Partial<PlanStep> = {}): PlanStep => ({
    idx: 1,
    method: 'POST',
    path: '/datasets',
    effect: 'write',
    covered: true,
    state: 'open',
    ...over,
});

const plan = (steps: PlanStep[], over: Partial<Plan> = {}): Plan =>
    ({
        id: 'p1',
        chat_id: 'c1',
        via: 'cli',
        state: 'approved',
        mode: 'autonomous',
        created_at: '2026-10-26T15:50:00.000Z',
        decided_at: '2026-10-26T15:51:00.000Z',
        steps,
        ...over,
    } as Plan);

const job = (over: Partial<WatchJob> = {}): WatchJob => ({ id: 'j1', chat_id: 'c1', kind: 'training', state: 'running', ...over });
const none: ReadonlySet<string> = new Set();

describe('currentIdx', () => {
    it('names the running step of a running plan and nothing once it is over', () => {
        const steps = [step({ idx: 1, state: 'done' }), step({ idx: 2, state: 'running' }), step({ idx: 3 })];
        expect(currentIdx(plan(steps))).toBe(2);
        expect(currentIdx(plan(steps, { state: 'completed' }))).toBeUndefined();
        expect(currentIdx(plan(steps, { state: 'proposed' }))).toBeUndefined();
    });
    it('names the failed step of a failed plan', () => {
        const steps = [step({ idx: 1, state: 'done' }), step({ idx: 2, state: 'failed' }), step({ idx: 3 })];
        expect(currentIdx(plan(steps, { state: 'failed' }))).toBe(2);
    });
});

describe('waitingFor', () => {
    const steps = [
        step({ idx: 1, state: 'done', created_resource: 'model', created_id: '35' }),
        step({ idx: 2, state: 'running' }),
        step({ idx: 3, path: '/models/{{step1.id}}' }),
        step({ idx: 4, path: '/x/{{step2.id}}/y' }),
    ];
    it('a proposed plan waits for the approval of the plan', () => {
        expect(waitingFor(plan(steps, { state: 'proposed' }), steps[2], none, undefined)).toBe('Your approval of the plan');
    });
    it('a parked approval that is still pending waits for the user in the chat', () => {
        const s = step({ idx: 2, parked_approval: 'a1', covered: false });
        expect(waitingFor(plan([s]), s, new Set(['a1']), undefined)).toBe('Your approval of this step in the chat');
        expect(waitingFor(plan([s]), s, none, undefined)).not.toBe('Your approval of this step in the chat');
    });
    it('a waiting step names its job', () => {
        const s = step({ idx: 2, state: 'waiting', watch_job: 'j1' });
        const p = plan([s]);
        const word = (kind: string | undefined) => waitingFor(p, s, none, kind ? job({ kind }) : undefined);
        expect(word('task')).toBe('The platform task to finish');
        expect(word('training')).toBe('The training run to finish');
        expect(word('image')).toBe('The image build to finish');
        expect(word('edge_deployment')).toBe('The device to start the container');
        expect(word('assessment')).toBe('The check to finish');
        expect(word('notebook_run')).toBe('The notebook run to finish');
        expect(word('annotation_run')).toBe('The platform job to finish');
        expect(word(undefined)).toBe('The platform job to finish');
        // a search step of a plan (issue #244/#245) waits for the search, not for one job
        const search = step({ idx: 3, state: 'waiting', tool: 'propose_search', search_id: 's1' });
        expect(waitingFor(plan([search]), search, none, undefined)).toBe('The training search to end');
    });
    it('a paused plan waits for the user, by reason', () => {
        const s = step({ idx: 2 });
        expect(waitingFor(plan([s], { state: 'paused', pause_reason: 'login' }), s, none, undefined)).toBe('You to sign in again');
        expect(waitingFor(plan([s], { state: 'paused', pause_reason: 'budget_cost' }), s, none, undefined)).toBe(
            'You to resume the plan (budget reached)',
        );
        expect(waitingFor(plan([s], { state: 'paused', pause_reason: 'user' }), s, none, undefined)).toBe('You to resume the plan');
    });
    it('an open step waits for the highest unfinished placeholder, else for the step before it', () => {
        const p = plan(steps);
        expect(waitingFor(p, steps[3], none, undefined)).toBe('Step 2 to finish');
        expect(waitingFor(p, steps[2], none, undefined)).toBe('Step 2 to finish');
    });
    it('the next step waits for the agent', () => {
        const s = [step({ idx: 1, state: 'done' }), step({ idx: 2 })];
        expect(waitingFor(plan(s), s[1], none, undefined, true)).toBe('The agent to make the call');
        expect(waitingFor(plan(s), s[1], none, undefined, false)).toBe("The agent's next turn");
    });
    it('a finished step waits for nothing', () => {
        const s = step({ state: 'done' });
        expect(waitingFor(plan([s]), s, none, undefined)).toBeUndefined();
    });
});

describe('stepSubline', () => {
    const line = (p: Plan, s: PlanStep, j?: WatchJob) => stepSubline(p, s, stepPhase(p, s), j);
    it('a running training shows the epoch and two figures, validation first', () => {
        const s = step({
            state: 'running',
            last_epoch: { epoch: 3, epochs: 10, values: { loss: 0.2314, accuracy: 0.8, val_accuracy: 0.9124 } },
        });
        expect(line(plan([s]), s).text).toBe('Epoch 3 of 10 · val_accuracy 0.912 · loss 0.231');
    });
    it('the job brings a fresher epoch than the plan', () => {
        const s = step({ state: 'waiting', watch_job: 'j1', last_epoch: { epoch: 1, values: {} } });
        const j = job({ last_epoch: { epoch: 2, epochs: 4, values: {} } });
        expect(line(plan([s]), s, j).text).toBe('Epoch 2 of 4');
    });
    it('a running step without an epoch shows the platform line, else "Running"', () => {
        expect(line(plan([step({ state: 'running', progress_msg: 'Building layer 3' })]), step({ state: 'running', progress_msg: 'Building layer 3' })).text).toBe(
            'Building layer 3',
        );
        const s = step({ state: 'running' });
        expect(line(plan([s]), s).text).toBe('Running');
    });
    it('a done step names what it created, else "Done"', () => {
        const s = step({ state: 'done', created_resource: 'model', created_id: '35' });
        expect(line(plan([s]), s).text).toBe('Created model 35');
        const t = step({ state: 'done' });
        expect(line(plan([t]), t).text).toBe('Done');
    });
    it('a failed step shows the first line of its result in red', () => {
        const s = step({ state: 'failed', result: 'error 422: name already taken\nmore' });
        expect(line(plan([s], { state: 'failed' }), s)).toEqual({ text: 'error 422: name already taken', tone: 'red' });
    });
    it('a step that asks again says why, in amber', () => {
        const s = step({ covered: false, uncovered_reason: 'irreversible' });
        expect(line(plan([s]), s)).toEqual({ text: 'Asks you again before it runs: it cannot be undone', tone: 'amber' });
        expect(askLine(step({ covered: false }))).toBe('Asks you again before it runs');
    });
    it('an open step names the step it waits for', () => {
        const s = [step({ idx: 1, state: 'running' }), step({ idx: 2 })];
        expect(line(plan(s), s[1]).text).toBe('Waiting for step 1');
    });
});

describe('epochLine and metricPairs', () => {
    it('takes validation figures first and at most the requested number', () => {
        const e = { epoch: 2, values: { loss: 1, val_loss: 0.5, acc: 0.9 } };
        expect(metricPairs(e, 2).map((m) => m.key)).toEqual(['val_loss', 'loss']);
        expect(metricPairs(e, 4)).toHaveLength(3);
        expect(epochLine(e)).toBe('Epoch 2 · val_loss 0.500 · loss 1.00');
    });
    it('is empty without an epoch', () => {
        expect(epochLine(undefined)).toBe('');
        expect(metricPairs(undefined, 2)).toEqual([]);
    });
});

describe('argRows', () => {
    const steps = [
        step({ idx: 5, state: 'done', created_resource: 'model', created_id: '35' }),
        step({
            idx: 6,
            method: 'PATCH',
            path: '/models/{{step5.id}}',
            body: { name: 'm', password: 'hunter2', model_id: '{{step5.id}}', meta: { a: 1 } },
            query: { force: true },
        }),
    ];
    it('takes the keys of the body, the query with its prefix, hides secrets and names the object of a placeholder', () => {
        const rows = argRows(steps[1], plan(steps));
        expect(rows.map((r) => r.name)).toEqual(['name', 'password', 'model_id', 'meta', 'query · force']);
        expect(rows[1].value).toBe('[redacted]');
        expect(rows[2].ref).toEqual({ step: 5, known: true, text: '→ model 35', href: '/models/35' });
        expect(rows[3].value).toBe('{"a":1}');
        expect(rows[4].value).toBe('true');
    });
    it('says a placeholder is not known yet while its step is not done', () => {
        const p = plan([step({ idx: 5, state: 'running' }), steps[1]]);
        expect(argRows(steps[1], p)[2].ref).toEqual({ step: 5, known: false, text: '→ not known yet (step 5)' });
    });
    it('prefers the tool arguments to the body', () => {
        const s = step({ tool: 'platform_http', args: { a: 'x' }, body: { b: 1 } });
        expect(argRows(s, plan([s])).map((r) => r.name)).toEqual(['a']);
    });
    it('cuts a long object to 120 characters', () => {
        const s = step({ body: { big: { text: 'x'.repeat(300) } } });
        const v = argRows(s, plan([s]))[0].value;
        expect(v.length).toBe(120);
        expect(v.endsWith('…')).toBe(true);
    });
});

describe('resolvedPath', () => {
    it('replaces the placeholders of done steps only', () => {
        const done = step({ idx: 9, state: 'done', created_id: '6', created_resource: 'deployment' });
        const s = step({ idx: 10, method: 'PUT', path: '/container-deployments/{{step9.id}}/deploy' });
        expect(resolvedPath(s, plan([done, s]))).toBe('/container-deployments/6/deploy');
        expect(resolvedRequest(s, plan([done, s]))).toBe('PUT /container-deployments/6/deploy');
        expect(resolvedPath(s, plan([{ ...done, state: 'running' }, s]))).toBeUndefined();
    });
});

describe('stepTimes', () => {
    it('starts at the step start, else at the job start', () => {
        const s = step({ state: 'done', step_started_at: '2026-10-26T15:00:00Z', done_at: '2026-10-26T15:10:00Z', started_at: '2026-10-26T15:02:00Z' });
        expect(stepTimes(s).durationMs).toBe(600_000);
        const t = step({ state: 'done', done_at: '2026-10-26T15:10:00Z' });
        expect(stepTimes(t, job({ started_at: '2026-10-26T15:02:00Z' })).durationMs).toBe(480_000);
        expect(stepTimes(t).durationMs).toBeUndefined();
    });
    it('a running step has the duration so far', () => {
        const s = step({ state: 'running', step_started_at: '2026-10-26T15:00:00Z' });
        expect(stepTimes(s, undefined, Date.parse('2026-10-26T15:01:30Z')).durationMs).toBe(90_000);
    });
});

describe('stepCheck', () => {
    const check = (deploymentId: number): AssessCheck =>
        ({
            check_id: 'k1',
            kind: 'deployment',
            subject: 'deployment:x',
            final: true,
            state: 'finished',
            tool_call_id: 't1',
            created_at: '2026-10-26T15:00:00Z',
            report: {
                kind: 'deployment',
                verdict: 'usable',
                final: true,
                set: 'synthetic',
                measured_images: 5,
                image_review: { done: false },
                header: '',
                figures: {
                    deployment: { id: deploymentId, name: 'd' },
                    device: { name: 'sim-edge-01', simulated: true },
                    model: { id: 35, name: 'm' },
                    ready: true,
                    requests: 5,
                    max_abs_diff: null,
                    argmax_same: 5,
                    roundtrip_ms: { median: 42.2, max: 80 },
                },
            },
        }) as unknown as AssessCheck;
    it('finds the check by the deployment the step created and by the resolved path', () => {
        const created = step({ idx: 9, state: 'done', created_resource: 'deployment', created_id: '6' });
        const start = step({ idx: 10, method: 'PUT', path: '/container-deployments/{{step9.id}}/deploy' });
        const p = plan([created, start]);
        const want = { line: 'Ready · 5 test requests · median 42 ms · same top class 5/5', device: 'sim-edge-01 (simulated)', checkId: 'k1', toolCallId: 't1' };
        expect(stepCheck(created, p, [check(6)])).toEqual(want);
        expect(stepCheck(start, p, [check(6)])).toEqual(want);
    });
    it('finds nothing for another deployment or without checks', () => {
        const created = step({ idx: 9, state: 'done', created_resource: 'deployment', created_id: '6' });
        expect(stepCheck(created, plan([created]), [check(7)])).toBeUndefined();
        expect(stepCheck(created, plan([created]), [])).toBeUndefined();
    });
});

describe('planHeadLine and activityQuery', () => {
    it('an autonomous plan names its start and how long it runs or took', () => {
        const steps = [step({ idx: 1, state: 'done' }), step({ idx: 2, state: 'running' })];
        const p = plan(steps);
        const now = Date.parse(p.decided_at as string) + 23 * 60_000;
        expect(planHeadLine(p, now)).toMatch(/^1 of 2 steps done · started \d\d:\d\d · running for 23 min$/);
        const ended = plan(steps, { state: 'completed', ended_at: '2026-10-26T16:19:00.000Z' });
        expect(planHeadLine(ended, now)).toMatch(/· took 28 min$/);
    });
    it('an interactive plan names its state', () => {
        const p = plan([step()], { mode: 'interactive', state: 'proposed' });
        expect(planHeadLine(p, Date.now())).toBe('0 of 1 steps done · Waiting for your approval');
    });
    it('the activity query asks for one step of one plan', () => {
        expect(activityQuery('p-1', 4)).toBe('?plan=p-1&step=4&limit=20');
    });
});

describe('doneLine (issue #225)', () => {
    const done = (over: Partial<PlanStep>) => step({ state: 'done', ...over });
    const line = (s: PlanStep, others: PlanStep[] = []) => doneLine(s, plan([...others, s]));

    it('names a training run', () => {
        expect(line(done({ tool: 'start_training', created_resource: 'task', created_id: '145' }))).toBe(
            'Training run finished · task 145',
        );
        expect(line(done({ path: '/train/containers/7/run', created_resource: 'task', created_id: '145' }))).toBe(
            'Training run finished · task 145',
        );
    });

    it('names a started deployment, with its id when known', () => {
        const dep = done({ idx: 1, created_resource: 'deployment', created_id: '8' });
        const start = done({
            idx: 2,
            tool: 'start_deployment',
            path: '/container-deployments/{{step1.id}}/deploy',
            created_resource: 'task',
            created_id: '147',
        });
        expect(line(start, [dep])).toBe('Deployment 8 started · task 147');
        expect(line(done({ tool: 'start_deployment', created_resource: 'task', created_id: '147' }))).toBe(
            'Deployment started · task 147',
        );
    });

    it('names any other task, a created object, a check, a rename and a plain step', () => {
        expect(line(done({ path: '/other', created_resource: 'task', created_id: '9' }))).toBe('Platform task 9 finished');
        expect(line(done({ created_resource: 'dataset', created_id: '5' }))).toBe('Created dataset 5');
        expect(line(done({ tool: 'assess_model' }))).toBe('Check finished');
        expect(line(done({ path: '/_agw/assess/checks' }))).toBe('Check finished');
        expect(line(done({ method: 'PATCH', path: '/models/3', body: { name: 'm2' } }))).toBe('Renamed to "m2"');
        expect(line(done({ method: 'DELETE', path: '/models/3' }))).toBe('Done');
    });

    it('feeds the subline and the references without the word "resource"', () => {
        const t = done({ idx: 1, tool: 'start_training', created_resource: 'task', created_id: '145' });
        const p = plan([t]);
        expect(stepSubline(p, t, 'done', undefined).text).toBe('Training run finished · task 145');
        expect(resourceNoun('task')).toBe('platform task');
        const user = step({ idx: 2, method: 'GET', path: '/tasks/{{step1.id}}' });
        const rows = argRows({ ...user, args: { id: '{{step1.id}}' } }, plan([t, user]));
        expect(rows[0].ref?.text).toBe('→ platform task 145');
    });
});
