// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Tests of the budget and adopt dialogs (frontend issue #188): row names, the explanation below the rows, the first
// field in focus, and the summary box of the adopt dialog. Written in phase A, run in phase B.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ExperimentsActions } from '../../experiments';
import { mockSearch, mockTrial } from '../../searchMock';
import { BUDGET_DIALOG_TEXT } from './controlRules';
import SearchControls from './SearchControls';

afterEach(cleanup);

const actions: ExperimentsActions = {
    stopTrial: vi.fn(),
    stopSearch: vi.fn(),
    changeBudget: vi.fn(),
    giveHint: vi.fn(),
    adoptTrial: vi.fn(),
    reload: vi.fn(),
};

describe('the budget dialog', () => {
    it('names the rows, puts the explanation below them and focuses the first field', () => {
        render(<SearchControls chatId="c1" search={mockSearch()} variant="page" actions={actions} />);
        fireEvent.click(screen.getByRole('button', { name: 'Change budget' }));
        for (const name of ['Runs', 'Compute time', 'Target', 'Patience']) expect(screen.getByText(name)).toBeTruthy();
        const field = screen.getByLabelText('Number of runs');
        expect(document.activeElement).toBe(field);
        const text = screen.getByText(BUDGET_DIALOG_TEXT);
        const last = screen.getByLabelText('Runs without improvement');
        expect(last.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
});

describe('the adopt dialog', () => {
    const open = (score: number | null | undefined, bestIdx: number | undefined) => {
        const trial = mockTrial(2, { score });
        render(<SearchControls chatId="c1" search={mockSearch()} trial={trial} bestIdx={bestIdx} variant="page" actions={actions} />);
        fireEvent.click(screen.getByRole('button', { name: /^Adopt/ }));
    };

    it('shows the trial with its score and parameters, and a star only for the best one', () => {
        open(0.86, 2);
        expect(screen.getByText('Trial 2 · val. accuracy 0.86')).toBeTruthy();
        expect(screen.getByText(/learning_rate/)).toBeTruthy();
        expect(screen.getByLabelText('Best trial so far')).toBeTruthy();
    });

    it('has no star for a trial that is not the best', () => {
        open(0.7, 3);
        expect(screen.queryByLabelText('Best trial so far')).toBeNull();
    });

    it('shows only the trial number without a score', () => {
        open(undefined, undefined);
        expect(screen.getByText('Trial 2')).toBeTruthy();
    });
});
