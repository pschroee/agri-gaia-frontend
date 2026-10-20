// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import {
    bestTrialOf,
    budgetBody,
    budgetErrors,
    budgetForm,
    budgetMeters,
    compactNumber,
    endText,
    epochText,
    etaText,
    figuresMissing,
    firstErrorLine,
    gpuMissing,
    maxRunsCap,
    paramsLine,
    refusalText,
    scoreText,
    searchView,
    specText,
    testView,
    trialsOf,
} from './searchView';
import { mockLossSearch, mockSearch, mockTrial, mockTrials } from './searchMock';

describe('numbers', () => {
    it('writes hyper-parameters as a person does', () => {
        expect(compactNumber(0.0003)).toBe('3e-4');
        expect(compactNumber(0.05)).toBe('0.05');
        expect(compactNumber(32)).toBe('32');
        expect(paramsLine({ learning_rate: 3e-4, pretrained: true }, ['learning_rate'])).toBe('learning_rate 3e-4 · pretrained yes');
        expect(scoreText(0.8612)).toBe('0.86');
        expect(scoreText(0.4412, mockLossSearch().objective)).toBe('0.441');
        expect(scoreText(null)).toBe('–');
    });

    it('describes the bounds of the space', () => {
        const s = mockSearch().space;
        expect(specText(s.learning_rate)).toEqual({ kind: 'range · log', vals: '1e-4 … 1e-2' });
        expect(specText(s.batch_size)).toEqual({ kind: 'values', vals: '16 · 32 · 64' });
        expect(specText({ type: 'bool' })).toEqual({ kind: 'yes/no', vals: 'yes · no' });
    });

    it('estimates the time left', () => {
        const now = Date.parse('2026-10-20T10:00:00Z');
        expect(etaText('2026-10-20T10:09:10Z', now)).toBe('about 9 min left');
        expect(etaText('2026-10-20T10:00:20Z', now)).toBe('less than a minute left');
        expect(etaText(undefined, now)).toBeUndefined();
        expect(epochText({ epoch: 7, epochs: 20 })).toBe('Epoch 7/20');
    });
});

describe('the best trial and the state', () => {
    it('takes the gateway\'s best, else the best finished score by the direction', () => {
        const list = trialsOf(mockTrials(), 's1');
        expect(bestTrialOf(mockSearch(), list)?.idx).toBe(2);
        expect(bestTrialOf(mockSearch({ best_idx: null }), list)?.idx).toBe(2);
        expect(bestTrialOf(mockLossSearch(), [mockTrial(1, { score: 0.5 }), mockTrial(2, { score: 0.4 })].map((t) => ({ ...t, search_id: 's2' })))?.idx).toBe(2);
    });

    it('tells running, between, failed trial and the ends', () => {
        const done = mockTrials().slice(0, 3);
        expect(searchView(mockSearch(), mockTrials()).state).toBe('running');
        expect(searchView(mockSearch(), done).state).toBe('between');
        expect(searchView(mockSearch(), [...done, mockTrial(4, { state: 'failed' })]).state).toBe('failedTrial');
        expect(searchView(mockSearch({ state: 'ended', end_reason: 'patience' }), done)).toMatchObject({ state: 'patience', chip: 'No improvement', ended: true });
        expect(searchView(mockSearch({ state: 'ended', end_reason: 'start_failed' }), done).kind).toBe('error');
    });
});

describe('the budget', () => {
    it('counts the running trial in the runs (G10) and flags a reached limit', () => {
        const m = budgetMeters(mockSearch(), trialsOf(mockTrials(), 's1'));
        expect(m.map((x) => x.value)).toEqual(['3 of 6 · trial 4 running', '1 h 12 min of 3 h', 'best 0.86 · goal ≥ 0.9', '1 of 3 without improvement']);
        const full = budgetMeters(mockSearch({ used: { runs: 6, compute_minutes: 200, since_improvement: 3 } }), []);
        expect(full.map((x) => x.reached)).toEqual([true, true, false, true]);
        expect(full[2].pct).toBeNull();
    });

    it('says "not set" for a limit that is not set', () => {
        const m = budgetMeters(mockSearch({ budget: {} }), []);
        expect(m.map((x) => x.set)).toEqual([false, false, false, false]);
        expect(m[3].value).toBe('not set');
    });

    it('reads the goal in the direction of the metric (A16, G7)', () => {
        const s = mockLossSearch();
        const m = budgetMeters(s, [mockTrial(2, { search_id: 's2', score: 0.38 })]);
        expect(m[2].value).toBe('best 0.380 · goal ≤ 0.4');
        expect(m[2].reached).toBe(true);
    });
});

describe('the budget dialog rules (G10, G11)', () => {
    it('allows at most what is used plus the compute calls left', () => {
        expect(maxRunsCap(mockSearch())).toBe(8);
        const f = budgetForm(mockSearch());
        f.runs.value = '9';
        expect(budgetErrors(f, mockSearch()).runs).toBe('At most 8: 5 compute calls left in this chat');
        f.runs.value = '8';
        expect(budgetErrors(f, mockSearch())).toEqual({});
    });

    it('checks the target against the metric', () => {
        const f = budgetForm(mockSearch());
        f.target.value = '1.5';
        expect(budgetErrors(f, mockSearch()).target).toBe('Between 0 and 1');
        const l = budgetForm(mockLossSearch());
        l.target.value = '1.5';
        expect(budgetErrors(l, mockLossSearch()).target).toBeUndefined();
    });

    it('sends null for a limit that is not set', () => {
        const f = budgetForm(mockSearch());
        f.runs.set = false;
        f.timeSet = false;
        expect(budgetBody(f)).toEqual({ max_runs: null, max_compute_minutes: null, target: 0.9, patience: 3 });
    });
});

describe('the end and the final test', () => {
    const done = mockTrials().slice(0, 3);
    it('writes the reason of each end', () => {
        const ended = (r: string) => mockSearch({ state: 'ended', end_reason: r as never, winner_idx: 2, ended_at: '2026-10-20T11:17:00Z' });
        expect(endText(ended('budget_runs'), done)).toBe('Ended: budget used up. Runs limit reached (6 of 6).');
        expect(endText(ended('budget_time'), done)).toBe('Ended: compute time used up.');
        expect(endText(ended('compute_limit'), done)).toBe('Ended: no compute calls left in this chat.');
        expect(endText(ended('patience'), [...done, mockTrial(4, { score: 0.8 }), mockTrial(5, { score: 0.8 })])).toBe('Ended: no improvement. Trials 3, 4 and 5 did not beat trial 2 (patience 3 runs).');
        expect(endText(ended('target_reached'), done)).toContain('target reached');
        expect(endText(mockSearch(), done)).toBe('');
    });

    it('tells pending, none and no finished trial', () => {
        const s = mockSearch({ state: 'ended', end_reason: 'budget_runs', winner_idx: 2 });
        expect(testView({ ...s, holdout: { available: true, images: 92, final_state: 'pending' } }, done)?.kind).toBe('pending');
        expect(testView({ ...s, holdout: { available: false, final_state: 'none' } }, done)?.kind).toBe('none');
        expect(testView({ ...s, holdout: { available: true, final_state: 'pending' } }, [])).toEqual({ kind: 'none', text: 'No finished trial – no final test.' });
        expect(testView(mockSearch(), done)).toBeUndefined();
        // the result the gateway copied into the search is used while the check is not loaded
        const started = { ...s, holdout: { available: true, final_state: 'started' as const, check_id: 'k1', result: { state: 'finished' as const, accuracy: 0.87, images: 92 } } };
        expect(testView(started, done)).toMatchObject({ kind: 'measured', accuracy: 0.87, images: 92 });
        expect(testView({ ...started, holdout: { ...started.holdout, result: undefined } }, done)?.kind).toBe('running');
    });
});
describe('missing data (G1)', () => {
    it('tells no figures yet from a template without figures', () => {
        expect(figuresMissing({ figures: '', state: 'running' }, [])?.title).toBe('No figures yet');
        expect(figuresMissing({ figures: 'none', state: 'running' }, [])?.title).toBe('This training writes no figures');
        expect(figuresMissing({ figures: 'ok', state: 'running' }, [{ epoch: 1 }])).toBeUndefined();
    });

    it('tells no GPU from no GPU data', () => {
        expect(gpuMissing({ gpu_available: false, state: 'running' }, [])?.title).toBe('No GPU in this run');
        expect(gpuMissing({ gpu_available: undefined, state: 'done' }, [])?.title).toBe('GPU data not available');
    });
});

describe('the log and the refusal text', () => {
    it('marks the log from the first error on', () => {
        expect(firstErrorLine(['epoch 1', 'epoch 2', 'RuntimeError: CUDA out of memory', 'exit 1'])).toBe(2);
        expect(firstErrorLine(['all fine'])).toBe(-1);
    });

    it('takes the gateway\'s line without noise', () => {
        expect(refusalText('error: learning_rate = 0.05 is outside the search space')).toBe('learning_rate = 0.05 is outside the search space');
    });
});
