// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import type { Search, Trial } from '../../experiments';
import { budgetErrors, budgetForm } from '../../searchView';
import { figuresMissing, gpuMissing } from '../../searchView';
import {
    ADOPT_TEXT,
    HINT_MAX,
    budgetUsedText,
    canAdopt,
    canStopTrial,
    hintCounter,
    hintError,
    isStopping,
    pruneStopping,
    stopSearchDetail,
} from './controlRules';
import { emptyState } from './TrialChartEmpty';

const search = (over: Partial<Search> = {}): Search =>
    ({
        id: 's1',
        state: 'running',
        objective: { metric: 'val_acc', mode: 'max' },
        budget: { max_runs: 4 },
        used: { runs: 4, compute_minutes: 10, since_improvement: 1 },
        compute_left: 4,
        ...over,
    } as Search);
const trial = (over: Partial<Trial> = {}): Trial =>
    ({ id: 't1', search_id: 's1', idx: 2, state: 'running', ...over } as Trial);

describe('budget limit (G10)', () => {
    it('allows used.runs + compute_left and names the calls left', () => {
        const s = search();
        const f = budgetForm(s);
        expect(budgetErrors({ ...f, runs: { set: true, value: '8' } }, s).runs).toBeUndefined();
        expect(budgetErrors({ ...f, runs: { set: true, value: '9' } }, s).runs).toBe(
            'At most 8: 4 compute calls left in this chat',
        );
    });
    it('accepts "not set" for every kind', () => {
        const s = search({ budget: {} });
        expect(budgetErrors(budgetForm(s), s)).toEqual({});
    });
});

describe('target direction', () => {
    it('val_loss needs a value above 0 and takes more than 1', () => {
        const s = search({ objective: { metric: 'val_loss', mode: 'min' } });
        const f = budgetForm(s);
        expect(budgetErrors({ ...f, target: { set: true, value: '1.5' } }, s).target).toBeUndefined();
        expect(budgetErrors({ ...f, target: { set: true, value: '0' } }, s).target).toBe('Above 0');
    });
    it('accuracy stays within 0 and 1', () => {
        const s = search();
        expect(budgetErrors({ ...budgetForm(s), target: { set: true, value: '1.5' } }, s).target).toBe(
            'Between 0 and 1',
        );
    });
});

describe('hint', () => {
    it('rejects empty and over-long text', () => {
        expect(hintError('  ')).toBeDefined();
        expect(hintError('a'.repeat(HINT_MAX))).toBeUndefined();
        expect(hintError('a'.repeat(HINT_MAX + 1))).toBe('At most 500 characters');
    });
});

describe('controls offered', () => {
    it('stops only open trials of a running search', () => {
        expect(canStopTrial(search(), trial())).toBe(true);
        expect(canStopTrial(search(), trial({ state: 'done' }))).toBe(false);
        expect(canStopTrial(search({ state: 'ended' }), trial())).toBe(false);
    });
    it('adopts only finished trials of the running search (G8)', () => {
        expect(canAdopt(search(), trial({ state: 'done' }))).toBe(true);
        expect(canAdopt(search(), trial({ state: 'failed' }))).toBe(false);
        expect(canAdopt(search(), trial({ state: 'done', search_id: 'other' }))).toBe(false);
        expect(canAdopt(search({ state: 'ended' }), trial({ state: 'done' }))).toBe(false);
        expect(ADOPT_TEXT(3).title).toBe('Adopt trial 3 as the result?');
    });
});

describe('Stopping state (G3)', () => {
    it('holds until the trial has ended, then is pruned', () => {
        const req = new Set(['t1']);
        expect(isStopping(trial(), req)).toBe(true);
        expect(isStopping(trial({ state: 'stopped' }), req)).toBe(false);
        expect(pruneStopping(req, trial()).has('t1')).toBe(true);
        expect(pruneStopping(req, trial({ state: 'stopped' })).has('t1')).toBe(false);
    });
    it('a second click is idle: not stopping for another trial', () => {
        expect(isStopping(trial({ id: 't2' }), new Set(['t1']))).toBe(false);
    });
});

describe('empty states (G1)', () => {
    it('no figures yet', () => {
        expect(emptyState(trial({ figures: 'ok' }), 'figures').title).toBe('No figures yet');
        expect(figuresMissing(trial({ figures: 'ok' }), [])?.title).toBe('No figures yet');
    });
    it('this training writes no figures', () => {
        expect(emptyState(trial({ figures: 'none' }), 'figures').title).toBe('This training writes no figures');
    });
    it('no GPU in this run', () => {
        expect(emptyState(trial({ gpu_available: false }), 'gpu').title).toBe('No GPU in this run');
    });
    it('GPU data not available when a finished run has no points', () => {
        expect(emptyState(trial({ gpu_available: true, state: 'done' }), 'gpu').title).toBe('GPU data not available');
        expect(gpuMissing(trial({ gpu_available: null, state: 'done' }), [])?.title).toBe('GPU data not available');
    });
});

describe('dialog lines (#182)', () => {
    it('says what happens to the open trial when the search stops', () => {
        const final = 'The final test runs once for the winner.';
        expect(stopSearchDetail(trial({ idx: 4, state: 'running', epoch: 7, epochs: 20 }))).toBe(
            `Trial 4 (epoch 7/20) is stopped and not considered. ${final}`,
        );
        expect(stopSearchDetail(trial({ idx: 5, state: 'declared' }))).toBe(
            `Trial 5 (starting) is stopped and not considered. ${final}`,
        );
        expect(stopSearchDetail(undefined)).toBe(final);
        expect(stopSearchDetail(trial({ state: 'done' }))).toBe(final);
    });

    it('names what the search has used so far', () => {
        const base = { dataset: { id: 1, name: 'tf-flowers' } };
        expect(budgetUsedText({ used: { runs: 3, compute_minutes: 72, since_improvement: 0 }, base } as Search)).toBe(
            'Training search · tf-flowers · used so far: 3 runs, 1 h 12 min',
        );
        expect(budgetUsedText({ used: { runs: 1, compute_minutes: 5, since_improvement: 0 }, base } as Search)).toBe(
            'Training search · tf-flowers · used so far: 1 run, 5 min',
        );
    });

    it('falls back to the dataset id when the name is missing, and skips the part without a dataset', () => {
        const used = { runs: 2, compute_minutes: 5, since_improvement: 0 };
        expect(budgetUsedText({ used, base: { container_id: 1, dataset: { id: 59 } } } as Search)).toBe(
            'Training search · dataset #59 · used so far: 2 runs, 5 min',
        );
        expect(budgetUsedText({ used } as Search)).toBe('Training search · used so far: 2 runs, 5 min');
    });

    it('counts the hint with spaces around the slash', () => {
        expect(hintCounter('a'.repeat(25))).toBe(`25 / ${HINT_MAX}`);
    });
});
