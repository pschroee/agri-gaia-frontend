// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { mockSearch, mockTrials } from '../../searchMock';
import SearchIndicator from './SearchIndicator';

afterEach(cleanup);

describe('the chip in the header', () => {
    it('is not there without a search', () => {
        const { container } = render(<SearchIndicator book={undefined} variant="page" />);
        expect(container.textContent).toBe('');
    });

    it('shows the runs and the best value, shorter in the panel', () => {
        const book = { searches: [mockSearch()], trials: mockTrials() };
        render(<SearchIndicator book={book} variant="page" />);
        expect(screen.getByRole('button', { name: 'Search, 3 of 6 runs, best 0.86. Show searches' }).textContent).toBe('Search · 3/6 · best 0.86');
        cleanup();
        render(<SearchIndicator book={book} variant="panel" />);
        expect(screen.getByRole('button', { name: /Show searches/ }).textContent).toBe('Search 3/6 · 0.86');
    });

    it('opens the popover with the searches', () => {
        render(<SearchIndicator book={{ searches: [mockSearch()], trials: mockTrials() }} variant="page" />);
        fireEvent.click(screen.getByRole('button', { name: /Show searches/ }));
        expect(screen.getByRole('dialog', { name: 'Searches' })).toBeTruthy();
        expect(screen.getByText('Training search · tf-flowers')).toBeTruthy();
        expect(screen.getByText('Running · 3 of 6 runs · best 0.86 (trial 2)')).toBeTruthy();
        expect(screen.getByText('1 search')).toBeTruthy();
    });
});
