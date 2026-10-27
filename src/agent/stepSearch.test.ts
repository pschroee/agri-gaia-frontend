// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import type { PlanStep } from './plan';
import type { SearchBook } from './searchChip';
import { isSearchStep, searchProgressLine, searchSummaryRows } from './stepSearch';

const step = (over: Partial<PlanStep> = {}): PlanStep => ({
    idx: 3,
    method: 'POST',
    path: '/_agw/search',
    tool: 'propose_search',
    effect: 'compute',
    covered: true,
    state: 'open',
    ...over,
});

const SUMMARY =
    'Training search on the training container of step 2: lr 1e-4..1e-2 log; batch_size 16|32|64; ' +
    'up to 6 trials, 30 compute minutes, objective val_acc (stop at >= 0.97); ' +
    'trials run without asking inside this space';

describe('searchSummaryRows', () => {
    it('reads parameters, budget, goal and note from the gateway summary', () => {
        expect(searchSummaryRows(step({ summary: SUMMARY }))).toEqual([
            { label: 'Parameter', value: 'lr · 1e-4..1e-2 log' },
            { label: 'Parameter', value: 'batch_size · 16|32|64' },
            { label: 'Budget', value: 'up to 6 trials, 30 compute minutes' },
            { label: 'Goal', value: 'val_acc (stop at >= 0.97)' },
            { label: 'Note', value: 'Trials run without asking inside this space' },
        ]);
    });

    it('has no rows without a summary', () => {
        expect(searchSummaryRows(step())).toEqual([]);
        expect(isSearchStep(step())).toBe(true);
        expect(isSearchStep(step({ tool: 'start_training' }))).toBe(false);
    });
});

describe('searchProgressLine', () => {
    const book = {
        searches: [
            {
                id: 's1',
                objective: { metric: 'val_acc', mode: 'max' },
                budget: { max_runs: 3 },
                used: { runs: 2, compute_minutes: 4, since_improvement: 0 },
                best_idx: 2,
            },
        ],
        trials: [
            { id: 't1', search_id: 's1', idx: 1, state: 'done', score: 0.91 },
            { id: 't2', search_id: 's1', idx: 2, state: 'done', score: 0.97 },
        ],
    } as unknown as SearchBook;

    it('names the trials and the best figure', () => {
        expect(searchProgressLine(step({ search_id: 's1' }), book)).toBe('Trials 2/3 · best val_acc 0.97 (trial 2)');
    });

    it('is empty before the start and while the chat has no data on the search', () => {
        expect(searchProgressLine(step(), book)).toBe('');
        expect(searchProgressLine(step({ search_id: 's9' }), book)).toBe('');
        expect(searchProgressLine(step({ search_id: 's1' }), undefined)).toBe('');
    });
});
