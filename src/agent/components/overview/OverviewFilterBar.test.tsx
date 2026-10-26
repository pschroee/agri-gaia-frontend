// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import OverviewFilterBar, { optionText, statusText } from './OverviewFilterBar';
import type { OverviewFilterBarProps } from './OverviewFilterBar';

afterEach(cleanup);

const base: OverviewFilterBarProps = {
    period: 'all',
    onPeriod: vi.fn(),
    selects: [
        {
            id: 'status',
            label: 'Status',
            value: '',
            options: [
                { value: '', label: 'All states' },
                { value: 'running', label: 'Running', count: 2 },
            ],
        },
    ],
    onSelect: vi.fn(),
    showReset: false,
    onReset: vi.fn(),
    status: { refreshing: false, live: true, failed: false, fetchedAt: new Date(2026, 9, 26, 15, 51, 20).getTime() },
};

describe('OverviewFilterBar', () => {
    it('puts the count into an option text', () => {
        expect(optionText({ value: 'running', label: 'Running', count: 2 })).toBe('Running (2)');
        expect(optionText({ value: '', label: 'All states' })).toBe('All states');
    });

    it('shows Reset only when asked to', () => {
        render(<OverviewFilterBar {...base} />);
        expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull();
        cleanup();
        render(<OverviewFilterBar {...base} showReset />);
        fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
        expect(base.onReset).toHaveBeenCalled();
    });

    it('words the status line', () => {
        expect(statusText(base.status)).toBe('Live · updated 15:51:20');
        expect(statusText({ ...base.status, live: false })).toBe('Updated 15:51:20');
        expect(statusText({ ...base.status, failed: true })).toBe('Could not refresh · retrying');
        expect(statusText({ refreshing: true, live: true, failed: false })).toBe('');
    });

    it('shows the status and a spinner while refreshing', () => {
        render(<OverviewFilterBar {...base} status={{ ...base.status, refreshing: true }} />);
        expect(screen.getByTestId('overview-status').textContent).toBe('Live · updated 15:51:20');
        expect(screen.getByLabelText('Refreshing')).toBeTruthy();
    });

    it('changes the period', () => {
        render(<OverviewFilterBar {...base} />);
        fireEvent.click(screen.getByRole('button', { name: '7 days' }));
        expect(base.onPeriod).toHaveBeenCalledWith('7d');
    });

    it('has no period buttons without a period', () => {
        render(<OverviewFilterBar {...base} period={undefined} onPeriod={undefined} />);
        expect(screen.queryByRole('group', { name: 'Period' })).toBeNull();
    });
});
