// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import { chipOf, visibleSearches } from './searchChip';
import { mockSearch, mockTrials } from './searchMock';

describe('the header chip', () => {
    it('has no chip without a search', () => {
        expect(chipOf(undefined)).toBeUndefined();
        expect(chipOf({ searches: [mockSearch({ state: 'rejected' })], trials: [] })).toBeUndefined();
    });

    it('says the runs and the best value of a running search, on the page and in the panel', () => {
        const c = chipOf({ searches: [mockSearch()], trials: mockTrials() });
        expect(c?.label).toBe('Search · 3/6 · best 0.86');
        expect(c?.short).toBe('Search 3/6 · 0.86');
        expect(c?.aria).toBe('Search, 3 of 6 runs, best 0.86. Show searches');
        expect(c?.kind).toBe('live');
    });

    it('waits, ends and fails', () => {
        expect(chipOf({ searches: [mockSearch({ state: 'proposed' })], trials: [] })?.label).toBe('Search · Waiting for you');
        expect(chipOf({ searches: [mockSearch({ state: 'proposed' })], trials: [] })?.short).toBe('Search · Waiting');
        const ended = chipOf({ searches: [mockSearch({ state: 'ended', end_reason: 'budget_runs' })], trials: mockTrials() });
        expect(ended?.label).toBe('Search · Ended');
        expect(ended?.kind).toBe('ok');
        const failed = chipOf({ searches: [mockSearch({ state: 'ended', end_reason: 'start_failed' })], trials: [] });
        expect(failed?.label).toBe('Search · Failed');
        expect(failed?.kind).toBe('error');
    });

    it('counts several searches and lists the running one first', () => {
        const older = mockSearch({ id: 's0', state: 'ended', end_reason: 'target_reached', title: 'lr sweep', created_at: '2026-10-19T08:00:00Z' });
        const book = { searches: [older, mockSearch()], trials: mockTrials() };
        expect(visibleSearches(book).map((s) => s.id)).toEqual(['s1', 's0']);
        const c = chipOf(book);
        expect(c?.label).toBe('Searches · 2');
        expect(c?.short).toBe('Searches 2');
        expect(c?.rows[0].sub).toBe('Running · 3 of 6 runs · best 0.86 (trial 2)');
        expect(c?.rows[1].sub).toBe('Ended · target reached');
    });
});
