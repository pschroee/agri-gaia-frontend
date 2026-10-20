// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { Trial } from '../../experiments';
import { ReconnectingHint, TrialChartEmpty } from './TrialChartEmpty';

afterEach(cleanup);

const trial = (over: Partial<Trial> = {}): Trial => ({ id: 't1', idx: 1, state: 'running', ...over } as Trial);

describe('TrialChartEmpty', () => {
    it('shows the text per kind', () => {
        render(<TrialChartEmpty trial={trial({ figures: 'none' })} kind="figures" />);
        expect(screen.getByText('This training writes no figures')).toBeTruthy();
    });
    it('shows a skeleton while loading', () => {
        render(<TrialChartEmpty trial={trial()} kind="figures" loading />);
        expect(screen.getByLabelText('Loading chart')).toBeTruthy();
    });
    it('shows the error', () => {
        render(<TrialChartEmpty trial={trial()} kind="gpu" error="500 boom" />);
        expect(screen.getByText('Could not load the data')).toBeTruthy();
        expect(screen.getByText('500 boom')).toBeTruthy();
    });
    it('reconnecting hint names the time', () => {
        render(<ReconnectingHint since="09:52:14" />);
        expect(screen.getByText('Reconnecting… · showing the last values from 09:52:14')).toBeTruthy();
    });
});
