// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import {
    bestValue,
    closeRunParams,
    detailOf,
    failedText,
    jobRunState,
    liveDuration,
    planLinkText,
    OVERVIEW_DEFAULTS,
    openRunParams,
    runKindOf,
    runProgress,
    runsQuery,
    runStateView,
    runSubline,
    singleRunTitle,
    subjectText,
    searchRunState,
    startedText,
    trialRunState,
} from './experimentRuns';
import { makeRun, makeSearch, makeTrial } from './experimentsFixtures';

const NOW = Date.parse('2026-10-26T15:51:20');

describe('progress texts', () => {
    it('a running search says trial x of y and the epoch, the bar counts finished trials and the epoch', () => {
        const p = runProgress(makeRun(), NOW);
        expect(p.label).toBe('Trial 3 of 10 · epoch 4/20');
        // (2 + 4/20) / 10 = 22 %
        expect(p.value).toBeCloseTo(22);
        expect(p.indeterminate).toBe(false);
    });

    it('a search without a budget leaves "of y" out and uses the epoch share', () => {
        const p = runProgress(makeRun({ progress: { trial: 3, trials: null, trials_done: 2, epoch: 5, epochs: 20 } }), NOW);
        expect(p.label).toBe('Trial 3 · epoch 5/20');
        expect(p.value).toBeCloseTo(25);
    });

    it('a search before its first trial is indeterminate', () => {
        expect(runProgress(makeRun({ progress: { trials: 10, trials_done: 0 } }), NOW)).toMatchObject({ label: 'Choosing the first trial', indeterminate: true });
    });

    it('a search waiting for approval says so, in the attention tone, without a bar', () => {
        const p = runProgress(makeRun({ state: 'waiting', progress: {} }), NOW);
        expect(p).toMatchObject({ label: 'Waits for your approval', tone: 'attention' });
        expect(p.value).toBeUndefined();
        expect(p.indeterminate).toBeFalsy();
    });

    it('a finished search counts its trials', () => {
        expect(runProgress(makeRun({ state: 'done', progress: { trials_done: 8, trials: 10 } }), NOW).label).toBe('8 trials');
        expect(runProgress(makeRun({ state: 'done', progress: { trials_done: 1 } }), NOW).label).toBe('1 trial');
    });

    it('a running training shows the epoch and the time left; before the first epoch it is starting', () => {
        const eta = new Date(NOW + 9 * 60000).toISOString();
        const p = runProgress(makeRun({ kind: 'training_run', id: 't1', progress: { epoch: 4, epochs: 20, eta } }), NOW);
        expect(p.label).toBe('Epoch 4 of 20');
        expect(p.value).toBe(20);
        expect(p.sub).toBe('about 9 min left');
        expect(runProgress(makeRun({ kind: 'training_run', id: 't1', progress: {} }), NOW)).toMatchObject({ label: 'Starting', indeterminate: true });
    });

    it('a finished training names its epochs, with no bar', () => {
        const p = runProgress(makeRun({ kind: 'training_run', id: 't1', state: 'done', progress: { epoch: 20, epochs: 20 } }), NOW);
        expect(p.label).toBe('20 epochs');
        expect(p.value).toBeUndefined();
        expect(p.indeterminate).toBeFalsy();
    });

    it('a notebook run without figures shows the platform message or "Running", indeterminate', () => {
        expect(runProgress(makeRun({ kind: 'notebook_run', id: 'w1', progress: { message: 'Executing cell 3' } }), NOW)).toMatchObject({ label: 'Executing cell 3', indeterminate: true });
        expect(runProgress(makeRun({ kind: 'notebook_run', id: 'w1', progress: {} }), NOW)).toMatchObject({ label: 'Running', indeterminate: true });
    });

    it('a failed run shows the first error line in the failed tone with the whole text as title', () => {
        const p = runProgress(makeRun({ state: 'failed', error: 'CUDA out of memory' }), NOW);
        expect(p).toMatchObject({ label: 'CUDA out of memory', tone: 'failed', title: 'CUDA out of memory' });
        expect(runProgress(makeRun({ state: 'failed' }), NOW).label).toBe('Failed');
    });

    it('a stopped run says who stopped it', () => {
        expect(runProgress(makeRun({ state: 'stopped', stopped_by: 'user' }), NOW).label).toBe('Stopped by you');
        expect(runProgress(makeRun({ state: 'stopped', stopped_by: 'agent' }), NOW).label).toBe('Stopped by the agent');
        expect(runProgress(makeRun({ state: 'stopped' }), NOW).label).toBe('Stopped');
    });
});

describe('cells', () => {
    it('the second line names the kind and what ran, never the title again and never the plan step', () => {
        expect(runSubline(makeRun())).toBe('Training search · template');
        expect(runSubline(makeRun({ path: 'notebook' }))).toBe('Training search · notebook');
        const base = { container_id: 145, architecture: 'efficientnet_v2_s', dataset: { id: 177, name: 'Pig tail biting' } };
        expect(runSubline(makeRun({ search: makeSearch({ base }) }))).toBe('Training search · efficientnet_v2_s on Pig tail biting');
        // a base without architecture and dataset says nothing, so the way is named
        expect(runSubline(makeRun({ search: makeSearch({ base: { container_id: 145 } }) }))).toBe('Training search · template');
        expect(runSubline(makeRun({ kind: 'training_run', id: 't1', plan_id: 'p1', plan_step: 3, trial: makeTrial(0, { ref: '145' }) }))).toBe('Training run · container 145');
        expect(runSubline(makeRun({ kind: 'training_run', id: 't1', trial: makeTrial(0, { path: 'notebook' }) }))).toBe('Training run · notebook');
        expect(runSubline(makeRun({ kind: 'training_run', id: 't1' }))).toBe('Training run');
        expect(runSubline(makeRun({ kind: 'notebook_run', id: 'w1', title: 'prep.py' }))).toBe('Notebook run');
        expect(runSubline(makeRun({ plan_id: 'p1' }))).toBe('Training search · template');
    });

    it('the plan link says the step when the gateway knows it', () => {
        expect(planLinkText(makeRun({ plan_id: 'p1', plan_step: 4 }))).toBe('Plan step 4');
        expect(planLinkText(makeRun({ plan_id: 'p1' }))).toBe('Plan');
        expect(planLinkText(makeRun())).toBeUndefined();
    });

    it('the best value is the figure in full with the short metric under it, or nothing', () => {
        expect(bestValue(makeRun())).toEqual({ value: '0.91', metric: 'val. accuracy', title: 'Best validation accuracy (trial 2)' });
        expect(bestValue(makeRun({ score: { metric: 'val_loss', mode: 'min', value: 0.4106 } }))).toEqual({ value: '0.411', metric: 'val. loss', title: 'Best validation loss' });
        expect(bestValue(makeRun({ score: { metric: 'val_acc', mode: 'max', value: 0.9734, trial: 5 } }))?.value).toBe('0.97');
        expect(bestValue(makeRun({ score: null }))).toBeUndefined();
        expect(bestValue(makeRun({ score: { metric: 'val_acc', mode: 'max', value: null } }))).toBeUndefined();
    });

    it('the old bare Docker status of a failed training reads as "Exited without a score"', () => {
        expect(failedText('exited')).toBe('Exited without a score');
        expect(failedText('Dead')).toBe('Exited without a score');
        expect(failedText('RuntimeError: CUDA out of memory')).toBe('RuntimeError: CUDA out of memory');
        expect(failedText('')).toBe('');
        expect(runProgress(makeRun({ state: 'failed', error: 'exited' }), NOW)).toMatchObject({ label: 'Exited without a score', tone: 'failed' });
    });

    it('the start is a clock time today and a date with the clock before', () => {
        expect(startedText('2026-10-26T09:05:00', NOW)).toBe('09:05');
        expect(startedText('2026-10-24T15:51:00', NOW)).toBe('24 Oct 15:51');
        expect(startedText(undefined, NOW)).toBe('–');
    });

    it('the duration of a running row ticks on from the last answer', () => {
        const r = makeRun({ duration_s: 720 });
        expect(liveDuration(r, NOW, NOW)).toBe(720);
        expect(liveDuration(r, NOW, NOW + 30000)).toBe(750);
        expect(liveDuration({ ...r, state: 'done', duration_s: 90 }, NOW, NOW + 60000)).toBe(90);
        expect(liveDuration({ state: 'running', started_at: new Date(NOW - 60000).toISOString() }, undefined, NOW)).toBe(60);
    });

    it('maps the raw states like the gateway', () => {
        expect(searchRunState({ state: 'proposed' })).toBe('waiting');
        expect(searchRunState({ state: 'running' })).toBe('running');
        expect(searchRunState({ state: 'ended', end_reason: 'start_failed' })).toBe('failed');
        expect(searchRunState({ state: 'ended', end_reason: 'stopped_by_user' })).toBe('stopped');
        expect(searchRunState({ state: 'ended', end_reason: 'budget_runs' })).toBe('done');
        expect(trialRunState({ state: 'declared' })).toBe('running');
        expect(trialRunState({ state: 'stopped' })).toBe('stopped');
        expect(jobRunState({ state: 'done', stopped_by: 'user' })).toBe('stopped');
        expect(jobRunState({ state: 'done' })).toBe('done');
        expect(jobRunState({ state: 'failed' })).toBe('failed');
        expect(runStateView('waiting').label).toBe('Waiting for approval');
    });
});

describe('request and address', () => {
    it('builds the query from filters, period, sort and page', () => {
        expect(runsQuery(OVERVIEW_DEFAULTS, new Date(2026, 9, 26, 12))).toBe('?limit=25');
        const q = new URLSearchParams(
            runsQuery(
                { period: 'today', filters: { status: 'running,waiting', kind: 'notebook_run', in_chat: 'c1' }, sort: { by: 'duration', order: 'desc' }, page: 2, size: 50 },
                new Date(2026, 9, 26, 12),
            ),
        );
        expect(q.get('state')).toBe('running,waiting');
        expect(q.get('kind')).toBe('notebook_run');
        expect(q.get('chat')).toBe('c1');
        expect(q.get('sort')).toBe('duration');
        expect(q.get('order')).toBe('desc');
        expect(q.get('offset')).toBe('100');
        expect(q.get('limit')).toBe('50');
        expect(q.get('since')).toBe(new Date(2026, 9, 26).toISOString().replace(/\.\d{3}Z$/, 'Z'));
    });

    it('reads the detail from chat and run, an older ?search= link counts as run', () => {
        expect(detailOf(new URLSearchParams('tab=experiments&chat=c1&run=s1&trial=t2'))).toEqual({ chatId: 'c1', runId: 's1', trialId: 't2' });
        expect(detailOf(new URLSearchParams('tab=experiments&search=s1'), 'c9')).toEqual({ chatId: 'c9', runId: 's1', trialId: undefined });
        expect(detailOf(new URLSearchParams('tab=experiments&search=s1'))).toBeUndefined();
        expect(detailOf(new URLSearchParams('tab=experiments&status=running'), 'c9')).toBeUndefined();
    });

    it('knows the kind from the first letter of the id', () => {
        expect(runKindOf('s12')).toBe('training_search');
        expect(runKindOf('t3')).toBe('training_run');
        expect(runKindOf('w7')).toBe('notebook_run');
        expect(runKindOf('x1')).toBeUndefined();
    });

    it('opening adds chat and run, closing removes only the detail parameters', () => {
        const open = openRunParams(new URLSearchParams('tab=experiments&status=running&page=1&search=old&trial=t1'), 'c1', 's2');
        expect(open.get('chat')).toBe('c1');
        expect(open.get('run')).toBe('s2');
        expect(open.has('trial')).toBe(false);
        expect(open.has('search')).toBe(false);
        const back = closeRunParams(open);
        expect(back.toString()).toBe('tab=experiments&status=running&page=1');
    });
});

describe('names of single runs (issue #227)', () => {
    const arch = 'efficientnet_v2_s';
    it('subjectText: architecture on dataset, else the parts, else the container', () => {
        expect(subjectText({ container_id: 145, architecture: arch, dataset: { id: 177, name: 'Pig tail biting' } })).toBe('efficientnet_v2_s on Pig tail biting');
        expect(subjectText({ container_id: 145, architecture: arch })).toBe(arch);
        expect(subjectText({ container_id: 145, dataset: { id: 177, name: 'Pig tail biting' } })).toBe('Training on Pig tail biting');
        expect(subjectText({ container_id: 145, architecture: arch, dataset: { id: 177 } })).toBe('efficientnet_v2_s on dataset 177');
        expect(subjectText({ container_id: 145 })).toBe('Training container 145');
        expect(subjectText({ container_id: 0 })).toBe('Training run');
        expect(subjectText(undefined)).toBe('Training run');
    });

    it('singleRunTitle: the subject, else the entry file, else the container, else "Training run"', () => {
        const t = (o: object) => makeTrial(0, { idx: 0, search_id: undefined, ...o });
        expect(singleRunTitle(t({ subject: { container_id: 145, architecture: arch, dataset: { id: 1, name: 'Pigs' } } }))).toBe('efficientnet_v2_s on Pigs');
        expect(singleRunTitle(t({ path: 'notebook', name: 'train.py' }))).toBe('train.py');
        expect(singleRunTitle(t({ ref: '66' }))).toBe('Training container 66');
        expect(singleRunTitle(t({ path: 'notebook' }))).toBe('Training run');
        expect(singleRunTitle(t({ subject: { container_id: 66 }, ref: '66' }))).toBe('Training container 66');
    });
});
