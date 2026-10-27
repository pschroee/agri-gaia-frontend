// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The confusion matrix of a check card (#249): counts and row shares as text, the diagonal bold, a folded matrix
// from 11 classes on, and the per-class table of the card next to it.

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { checkCard, confusionView } from '../assess';
import type { AssessCheck, TrainingFigures } from '../types';
import AnnotationCard from './AnnotationCard';
import ConfusionMatrix, { cellBackground, sharePercent } from './ConfusionMatrix';

afterEach(() => cleanup());

describe('ConfusionMatrix', () => {
    it('shows a 2-class matrix with counts, row shares and a bold diagonal', () => {
        render(<ConfusionMatrix view={confusionView({ a: { a: 9, b: 1 }, b: { b: 4 } })!} />);
        const table = screen.getByRole('table', { name: 'Confusion matrix' });
        expect(within(table).getAllByTestId('agent-confusion-cell')).toHaveLength(4);
        const aa = within(table).getByLabelText('true a, predicted a: 9 of 10');
        expect(aa.textContent).toContain('9');
        expect(aa.textContent).toContain('90%');
        // a missing cell is 0 and has no share line
        const ba = within(table).getByLabelText('true b, predicted a: 0 of 4');
        expect(ba.textContent).toBe('0');
        const bb = within(table).getByLabelText('true b, predicted b: 4 of 4');
        expect(bb.textContent).toContain('100%');
        expect(getComputedStyle(aa.querySelector('span')!).fontWeight).toBe('700');
        expect(getComputedStyle(within(table).getByLabelText('true a, predicted b: 1 of 10').querySelector('span')!).fontWeight).toBe('400');
    });

    it('shows ten classes open and folds eleven behind a button', () => {
        const make = (n: number) =>
            Object.fromEntries(Array.from({ length: n }, (_, i) => [`c${String(i).padStart(2, '0')}`, { [`c${String(i).padStart(2, '0')}`]: 2 }]));
        render(<ConfusionMatrix view={confusionView(make(10))!} />);
        expect(screen.getAllByTestId('agent-confusion-cell')).toHaveLength(100);
        expect(screen.queryByRole('button')).toBeNull();
        cleanup();
        render(<ConfusionMatrix view={confusionView(make(11))!} />);
        expect(screen.queryByTestId('agent-confusion-matrix')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Show confusion matrix' }));
        expect(screen.getAllByTestId('agent-confusion-cell')).toHaveLength(121);
        expect(screen.getByRole('button', { name: 'Hide confusion matrix' })).toBeTruthy();
    });

    it('scales the background with the share and leaves empty cells clear', () => {
        expect(cellBackground(0)).toBeUndefined();
        expect(cellBackground(1)).toBe('rgba(15, 84, 50, 0.90)');
        expect(cellBackground(0.5)).toBe('rgba(15, 84, 50, 0.49)');
        expect(sharePercent(0.256)).toBe('26%');
    });
});

describe('the check card with the matrix', () => {
    const check = (confusion?: TrainingFigures['confusion']): AssessCheck => ({
        check_id: 'chk-6',
        kind: 'training_model',
        subject: 'model:7',
        final: true,
        state: 'finished',
        created_at: '2026-10-27T10:00:00Z',
        started_at: '2026-10-27T10:00:00Z',
        ended_at: '2026-10-27T10:01:00Z',
        report: {
            kind: 'training_model',
            verdict: 'usable',
            final: true,
            set: 'holdout',
            measured_images: 14,
            image_review: { done: false },
            reasons: [],
            hints: [],
            suggestions: [],
            header: 'Result: usable (held-out images, statistics only, no image review)',
            figures: {
                model: { id: 7, name: 'mnist' },
                eval_dataset: { id: 41, name: 'mnist-check' },
                measured_images: 14,
                per_class: {
                    '3': { precision: 0.9, recall: 0.9, f1: 0.9, support: 10 },
                    '7': { precision: 0.75, recall: 0.75, f1: 0.75, support: 4 },
                },
                confusion,
                overall: { accuracy: 0.86, macro_f1: 0.83 },
                baseline: { kind: 'majority', class: '3', accuracy: 0.7, macro_f1: 0.4, p_value: 0.1 },
                seen_sample: { images: 20, accuracy: 0.95 },
            } as TrainingFigures,
        },
    });
    const render1 = (c: AssessCheck) => render(<AnnotationCard view={checkCard(c, undefined, Date.parse('2026-10-27T10:02:00Z'))} layout="page" />);

    it('shows the per-class table and the matrix under it', () => {
        render1(check({ '3': { '3': 9, '7': 1 }, '7': { '3': 1, '7': 3 } }));
        const tables = screen.getAllByTestId('agent-annotation-table');
        expect(within(tables[0]).getByText('Support')).toBeTruthy();
        expect(within(tables[0]).getByText('10')).toBeTruthy();
        expect(screen.getByTestId('agent-confusion')).toBeTruthy();
        expect(screen.getByLabelText('true 7, predicted 3: 1 of 4').textContent).toContain('25%');
    });

    it('shows only the table when an old report has no confusion', () => {
        render1(check(undefined));
        expect(screen.getAllByTestId('agent-annotation-table')).toHaveLength(1);
        expect(screen.queryByTestId('agent-confusion')).toBeNull();
    });
});
