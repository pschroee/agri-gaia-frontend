// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import {
    closeRunParams,
    detailOf,
    jobRunState,
    liveDuration,
    OVERVIEW_DEFAULTS,
    openRunParams,
    runKindOf,
    runProgress,
    runsQuery,
    runStateView,
    runSubline,
    scoreCell,
    searchRunState,
    startedText,
    trialRunState,
} from './experimentRuns';
import { makeRun } from './experimentsFixtures';

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
    it('the second line names the kind, what ran and the plan step', () => {
        expect(runSubline(makeRun())).toBe('Training search · template');
        expect(runSubline(makeRun({ kind: 'training_run', id: 't1', plan_id: 'p1', plan_step: 3 }))).toBe('Training run · plan step 3');
        expect(runSubline(makeRun({ kind: 'notebook_run', id: 'w1', title: 'prep.py' }))).toBe('Notebook run · prep.py');
        // the gateway leaves step 0 out
        expect(runSubline(makeRun({ plan_id: 'p1' }))).toBe('Training search · template · plan step');
    });

    it('the best value carries the words of the metric, or a dash', () => {
        expect(scoreCell(makeRun())).toMatch(/0\.91$/);
        expect(scoreCell(makeRun({ score: { metric: 'val_loss', mode: 'min', value: 0.4106 } }))).toMatch(/0\.411$/);
        expect(scoreCell(makeRun({ score: null }))).toBe('–');
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
