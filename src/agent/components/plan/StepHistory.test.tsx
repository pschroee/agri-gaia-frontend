// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { WatchJob } from '../../jobs';
import type { PlanStep } from '../../plan';
import StepHistory from './StepHistory';

afterEach(cleanup);

const NOW = Date.parse('2026-10-27T10:20:00.000Z');
const step: PlanStep = {
    idx: 1,
    method: 'POST',
    path: '/train/containers',
    tool: 'create_training',
    effect: 'compute',
    covered: true,
    state: 'waiting',
};
const job = (over: Partial<WatchJob> = {}): WatchJob => ({
    id: 'j1',
    chat_id: 'c1',
    kind: 'platform_task',
    state: 'running',
    ...over,
});

describe('StepHistory', () => {
    it('renders nothing for an empty history', () => {
        const { container } = render(<StepHistory job={job({ history: [] })} step={step} now={NOW} />);
        expect(container.textContent).toBe('');
        cleanup();
        const none = render(<StepHistory step={step} now={NOW} />);
        expect(none.container.textContent).toBe('');
    });

    it('shows done, running and pending phases in order', () => {
        render(
            <StepHistory
                step={step}
                now={NOW}
                job={job({
                    history: [
                        { at: '2026-10-27T10:00:00.000Z', text: 'Preparing the build' },
                        { at: '2026-10-27T10:02:00.000Z', text: 'Building the image (step 3/9)' },
                    ],
                })}
            />,
        );
        const rows = screen.getAllByTestId('agent-plan-history-row');
        expect(rows.map((r) => r.getAttribute('data-state'))).toEqual(['done', 'running', 'pending', 'pending']);
        expect(within(rows[0]).getByText('Preparing the build')).toBeTruthy();
        expect(within(rows[1]).getByText('18 min')).toBeTruthy();
        expect(within(rows[1]).getByRole('progressbar')).toBeTruthy();
        expect(within(rows[3]).getByText('Creating the training container')).toBeTruthy();
        // a phase to come has no time
        expect(within(rows[2]).queryByTestId('agent-plan-history-when')).toBeNull();
    });
});
