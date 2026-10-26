// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Smoke tests of the detail of a training search (moved from the tab "Experiments" for issue #222): a running search
// (head, meters, comparison, table with real parameter names, detail, export while it runs), an ended search (final
// result with the test result once) and a val_loss search. The rules behind the words are checked in
// experimentsTab.test.ts and searchView; here the pieces only have to be put together.

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExperimentsState, Search } from '../../experiments';
import { emptyExperiments } from '../../experiments';
import { epochRows, lossSearch, lossTrials, makeSearch, trials } from '../../experimentsFixtures';
import SearchDetail from './SearchDetail';

const h = vi.hoisted(() => ({ stopTrial: vi.fn(async () => undefined), checks: [] as unknown[] }));

vi.mock('../../assess', () => ({ useChecks: () => h.checks }));
vi.mock('../../experiments', async (orig) => {
    const real = await orig<typeof import('../../experiments')>();
    return {
        ...real,
        useTrialDetail: () => ({ detail: { trial: trials()[3], epochs: epochRows(7), gpu: [], log_tail: 'epoch 7/20\nTraceback (most recent call last)\nRuntimeError: out of memory' }, loading: false }),
    };
});
vi.mock('./SearchControls', () => ({ default: (p: { trial?: { idx: number } }) => <div data-testid="controls">controls {p.trial?.idx ?? 'none'}</div> }));

const actions = { stopTrial: h.stopTrial, stopSearch: vi.fn(), changeBudget: vi.fn(), giveHint: vi.fn(), adoptTrial: vi.fn(), reload: vi.fn() };

function Wrapper({ search, state }: { search: Search; state: ExperimentsState }) {
    const [trialId, setTrialId] = useState<string>();
    return <SearchDetail chatId="c1" search={search} state={state} actions={actions} trialId={trialId} onSelectTrial={setTrialId} />;
}

const mount = (search: Search, over: Partial<ExperimentsState>) =>
    render(<Wrapper search={search} state={{ ...emptyExperiments, loaded: true, searches: [search], ...over }} />);

afterEach(cleanup);
beforeEach(() => {
    h.checks = [];
    h.stopTrial.mockClear();
});

describe('SearchDetail', () => {
    it('shows a running search: head, meters with aria-valuetext, export, table columns from the space, detail', () => {
        mount(makeSearch(), { trials: trials() });
        expect(screen.getByText('Training search · tf-flowers')).toBeTruthy();
        expect(screen.getByTestId('search-export')).toBeTruthy();
        const runs = within(screen.getByTestId('search-meter-runs')).getByRole('progressbar');
        expect(runs.getAttribute('aria-valuetext')).toBe('4 of 6 runs');
        // the target has no fill
        expect(within(screen.getByTestId('search-meter-target')).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0');
        const table = screen.getByTestId('trial-table');
        for (const c of ['learning_rate', 'batch_size', 'epochs', 'img_size']) expect(within(table).getByText(c)).toBeTruthy();
        expect(within(table).queryByText('augmentation')).toBeNull();
        // the running trial is selected by default and its controls are offered with it
        expect(screen.getByTestId('trial-detail').getAttribute('aria-label')).toBe('Trial 4');
        expect(screen.getByTestId('controls').textContent).toBe('controls 4');
        expect(screen.getByTestId('trial-table-footer').textContent).toContain('4 trials');
        expect(screen.getByTestId('trial-log').textContent).toContain('last 3 lines');
        expect(screen.getByTestId('trial-note')).toBeTruthy();
    });

    it('selects a row by click and by keyboard, and stops the open trial from the row menu', () => {
        mount(makeSearch(), { trials: trials() });
        fireEvent.keyDown(screen.getByTestId('trial-row-t2'), { key: 'Enter' });
        expect(screen.getByTestId('trial-detail').getAttribute('aria-label')).toBe('Trial 2');
        fireEvent.click(screen.getByTestId('trial-row-t3'));
        expect(screen.getByTestId('trial-detail').getAttribute('aria-label')).toBe('Trial 3');
        fireEvent.click(screen.getByRole('button', { name: 'Actions for trial 4' }));
        fireEvent.click(screen.getByText('Stop trial'));
        expect(h.stopTrial).toHaveBeenCalledWith('s1', 't4');
    });

    it('shows "Stopping…" in the state column from the local stopping state', () => {
        mount(makeSearch(), { trials: trials(), stopping: { t4: true } });
        expect(within(screen.getByTestId('trial-row-t4')).getByText('Stopping…')).toBeTruthy();
    });

    it('shows the final result of an ended search: winner, validation value, the test result once, why it ended', () => {
        const s = makeSearch({
            state: 'ended',
            end_reason: 'budget_runs',
            winner_idx: 2,
            ended_at: '2026-10-20T11:17:00Z',
            holdout: { available: true, final_state: 'started', check_id: 'k1', images: 92, eval_dataset: { id: 58, name: 'tf-flowers-mini', images: 92 } },
        });
        h.checks = [{ check_id: 'k1', state: 'done', report: { verdict: 'usable', measured_images: 92, figures: { overall: { accuracy: 0.88 } } } }];
        mount(s, { trials: trials().slice(0, 3) });
        const final = screen.getByTestId('search-final');
        expect(within(final).getByText('Winner')).toBeTruthy();
        expect(within(final).getByText('0.86')).toBeTruthy();
        expect(screen.getAllByTestId('search-test-result')).toHaveLength(1);
        expect(screen.getByTestId('search-test-result').textContent).toContain('0.88');
        expect(screen.getByTestId('search-test-result').textContent).toContain('92 held-back images of tf-flowers-mini (#58)');
        expect(within(final).getByText('usable')).toBeTruthy();
        expect(screen.getByTestId('search-end-text').textContent).toContain('budget used up');
        // the Epoch column is gone after the end, and the export is in the final block
        expect(within(screen.getByTestId('trial-table')).queryByText('Epoch')).toBeNull();
        expect(within(final).getByTestId('search-export')).toBeTruthy();
    });

    it('says the final test is pending when the check is not there yet', () => {
        const s = makeSearch({ state: 'ended', end_reason: 'patience', winner_idx: 2, holdout: { available: true, final_state: 'pending', images: 92 } });
        mount(s, { trials: trials().slice(0, 3) });
        expect(screen.getByTestId('search-test-text').textContent).toContain('Final test pending');
    });

    it('lets a val_loss search say validation loss, with 3 decimals, lower is better (G7)', () => {
        mount(lossSearch(), { trials: lossTrials() });
        expect(screen.getByTestId('search-subline').textContent).toContain('Validation loss · lower is better');
        expect(screen.getByTestId('search-compare-caption').textContent).toContain('Best so far: trial 2 with 0.410');
        expect(within(screen.getByTestId('trial-table')).getByText('Val. loss')).toBeTruthy();
    });

});
