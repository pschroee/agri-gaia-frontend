// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Smoke tests of the search card in the states of the design (gateway issue #168): running, between trials, a failed
// trial, the ends (target, budget, patience, stopped, adopted, failed) and the lost connection. The rules behind the
// words are checked in searchView.test.ts; here the card only has to put them together. Written in phase A, run in B.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ExperimentsActions, ExperimentsState, Search, Trial } from '../../experiments';
import { emptyExperiments } from '../../experiments';
import { mockLossSearch, mockSearch, mockTrial, mockTrials } from '../../searchMock';
import SearchCard from './SearchCard';
import type { SearchEnv } from './SearchCard';

vi.mock('../../experiments', async (orig) => ({
    ...(await orig<typeof import('../../experiments')>()),
    // the card reads the detail of its running trial; the tests give it none
    useTrialDetail: () => ({ detail: undefined, loading: false }),
}));

afterEach(cleanup);

const actions: ExperimentsActions = {
    stopTrial: vi.fn(),
    stopSearch: vi.fn(),
    changeBudget: vi.fn(),
    giveHint: vi.fn(),
    adoptTrial: vi.fn(),
    reload: vi.fn(),
};

const env = (trials: Trial[], over: Partial<ExperimentsState> = {}, layout: 'panel' | 'page' = 'page'): SearchEnv => ({
    chatId: 'c1',
    experiments: { ...emptyExperiments, loaded: true, trials, ...over },
    actions,
    checks: [],
    layout,
});

const render1 = (search: Search, trials: Trial[], over: Partial<ExperimentsState> = {}, layout: 'panel' | 'page' = 'page') =>
    render(<SearchCard search={search} env={env(trials, over, layout)} />);

describe('a running search', () => {
    it('shows the title, the state, the four meters and the trial that runs', () => {
        render1(mockSearch(), mockTrials());
        expect(screen.getByRole('region', { name: 'Training search tf-flowers' })).toBeTruthy();
        expect(screen.getByText('Training search · tf-flowers')).toBeTruthy();
        expect(screen.getByText('Running')).toBeTruthy();
        expect(screen.getByText('Validation accuracy · higher is better · platform template')).toBeTruthy();
        expect(screen.getByText('3 of 6 · trial 4 running')).toBeTruthy();
        expect(screen.getByText('1 h 12 min of 3 h')).toBeTruthy();
        expect(screen.getByText('best 0.86 · goal ≥ 0.9')).toBeTruthy();
        expect(screen.getByText('1 of 3 without improvement')).toBeTruthy();
        expect(screen.getByText('Epoch 7/20')).toBeTruthy();
        expect(screen.getByText('Trial 4')).toBeTruthy();
        expect(screen.getByText('TEMPLATE')).toBeTruthy();
        expect(screen.getByText('Agent\'s note – not verified')).toBeTruthy();
    });

    it('names the parameters with their real names', () => {
        render1(mockSearch(), mockTrials());
        expect(screen.getByText('learning_rate 3e-4 · batch_size 64 · epochs 20 · img_size 300')).toBeTruthy();
    });

    it('says "Stopping…" for a trial the user asked to stop', () => {
        render1(mockSearch(), mockTrials(), { stopping: { t4: true } });
        expect(screen.getByText('Stopping…')).toBeTruthy();
        expect(screen.getByText('3 of 6 · trial 4 stopping')).toBeTruthy();
    });

    it('says why there is no curve: no figures yet, a template without figures, no GPU', () => {
        render1(mockSearch(), [mockTrial(4, { state: 'running', epoch: null, figures: '', gpu_available: false })]);
        expect(screen.getByText('No figures yet')).toBeTruthy();
        expect(screen.getByText('No GPU in this run')).toBeTruthy();
        cleanup();
        render1(mockSearch(), [mockTrial(4, { state: 'running', epoch: null, figures: 'none' })]);
        expect(screen.getByText('This training writes no figures')).toBeTruthy();
    });

    it('shows the lost connection and keeps the values', () => {
        render1(mockSearch(), mockTrials(), { reconnecting: true, lastAt: '2026-10-20T09:52:14Z' });
        expect(screen.getByText(/Reconnecting…/)).toBeTruthy();
        expect(screen.getByText('Epoch 7/20')).toBeTruthy();
    });

    it('is smaller in the panel but says the same', () => {
        render1(mockSearch(), mockTrials(), {}, 'panel');
        expect(screen.getByText('3 of 6 · trial 4 running')).toBeTruthy();
    });
});

describe('between trials and a failed trial', () => {
    const done = mockTrials().slice(0, 3);
    it('says that the agent is choosing the next trial', () => {
        render1(mockSearch({ running_trial: null, used: { runs: 3, compute_minutes: 72, since_improvement: 1 } }), done);
        expect(screen.getByText('Choosing next trial')).toBeTruthy();
        expect(screen.getByText('The agent is choosing trial 4')).toBeTruthy();
        expect(screen.getByText(/Trial 3 finished · val\. accuracy 0\.83 · 14 min · no improvement on trial 2/)).toBeTruthy();
    });

    it('shows the failed trial and goes on', () => {
        const failed = mockTrial(4, { path: 'notebook', state: 'failed', error: 'CUDA out of memory', score: null });
        render1(mockSearch({ running_trial: null }), [...done, failed]);
        expect(screen.getByText('Failed')).toBeTruthy();
        expect(screen.getByText('CUDA out of memory')).toBeTruthy();
        expect(screen.getByText('The search continues. The agent is choosing trial 5.')).toBeTruthy();
        expect(screen.getByText('3 of 6 · 1 failed')).toBeTruthy();
    });
});

describe('the ends', () => {
    const done = mockTrials().slice(0, 3);
    const ended = (reason: Search['end_reason'], over: Partial<Search> = {}) =>
        mockSearch({ state: 'ended', end_reason: reason, running_trial: null, winner_idx: 2, ended_at: '2026-10-20T11:17:00Z', ...over });

    it('budget used up: the winner, the value and the final test pending', () => {
        render1(ended('budget_runs', { holdout: { available: true, images: 92, final_state: 'pending' } }), done);
        expect(screen.getByText('Budget used up')).toBeTruthy();
        expect(screen.getByText('Winner · Trial 2')).toBeTruthy();
        expect(screen.getByText('0.86')).toBeTruthy();
        expect(screen.getByText('Final test pending')).toBeTruthy();
        expect(screen.getByText('Ended: budget used up. Runs limit reached (6 of 6).')).toBeTruthy();
    });

    it('without a test set the final test is skipped', () => {
        render1(ended('stopped_by_user', { holdout: { available: false, final_state: 'none' } }), done);
        expect(screen.getByText('Stopped by you')).toBeTruthy();
        expect(screen.getByText('No test set — the final test is skipped.')).toBeTruthy();
    });

    it('target, patience and adopted have their own chip', () => {
        render1(ended('target_reached'), done);
        expect(screen.getByText('Target reached')).toBeTruthy();
        cleanup();
        render1(ended('patience'), done);
        expect(screen.getByText('No improvement')).toBeTruthy();
        cleanup();
        render1(ended('adopted'), done);
        expect(screen.getByText('Trial adopted')).toBeTruthy();
        expect(screen.getByText('Winner · Trial 2 (adopted by you)')).toBeTruthy();
    });

    it('failed: the alert, the best finished trial and the test still pending (G13)', () => {
        const f = mockTrial(4, { state: 'failed', score: null, error: 'no start' });
        render1(ended('start_failed', { holdout: { available: true, images: 92, final_state: 'pending' } }), [...done, f]);
        expect(screen.getByRole('alert').textContent).toContain('The platform could not run trials.');
        expect(screen.getByText(/Best finished trial: trial 2/)).toBeTruthy();
        expect(screen.getByText(/final test pending/)).toBeTruthy();
    });

    it('failed without a finished trial: no final test', () => {
        render1(ended('start_failed', { winner_idx: null, best_idx: null }), [mockTrial(1, { state: 'failed', score: null })]);
        expect(screen.getByText('No finished trial – no final test.')).toBeTruthy();
    });
});

describe('a search that minimises the loss (G7)', () => {
    it('says lower is better and the goal with ≤', () => {
        const s = mockLossSearch();
        render1(s, [mockTrial(1, { search_id: 's2', score: 0.52 }), mockTrial(2, { search_id: 's2', score: 0.44 })]);
        expect(screen.getByText('Validation loss · lower is better · platform template')).toBeTruthy();
        expect(screen.getByText('best 0.440 · goal ≤ 0.4')).toBeTruthy();
    });
});

describe('searches that are not running', () => {
    it('shows no card for a proposal that waits or was refused', () => {
        render1(mockSearch({ state: 'proposed' }), []);
        expect(screen.queryByTestId('agent-search-card')).toBeNull();
    });
});
