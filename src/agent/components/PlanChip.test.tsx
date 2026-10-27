// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The plan chip in the status row (issue #221): which plan it takes, the count of steps done, the tone per state and
// the click that opens the dialog.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Plan, PlanStep } from '../plan';
import PlanChip from './PlanChip';

afterEach(cleanup);

const step = (over: Partial<PlanStep> = {}): PlanStep => ({
    idx: 1,
    method: 'POST',
    path: '/datasets',
    effect: 'write',
    covered: true,
    state: 'open',
    ...over,
});

const plan = (over: Partial<Plan> = {}): Plan =>
    ({
        id: 'p1',
        chat_id: 'c1',
        via: 'cli',
        state: 'approved',
        mode: 'autonomous',
        created_at: '2026-10-16T12:00:00.000Z',
        steps: [
            step({ idx: 1, state: 'done' }),
            step({ idx: 2, state: 'done' }),
            step({ idx: 3, state: 'running' }),
            step({ idx: 4 }),
        ],
        ...over,
    }) as Plan;

const none: ReadonlySet<string> = new Set();
const chip = () => screen.getByTestId('agent-plan-chip');

describe('PlanChip', () => {
    it('shows nothing without a plan', () => {
        const { container } = render(<PlanChip plans={[]} pending={none} onOpen={vi.fn()} />);
        expect(container.firstChild).toBeNull();
        cleanup();
        const { container: c2 } = render(<PlanChip plans={undefined} pending={none} onOpen={vi.fn()} />);
        expect(c2.firstChild).toBeNull();
    });

    it('counts the steps done of all, not the step the plan is on', () => {
        render(<PlanChip plans={[plan()]} pending={none} onOpen={vi.fn()} />);
        expect(chip().textContent).toBe('Plan 2/4');
    });

    it('drops the word where there is no room', () => {
        render(<PlanChip plans={[plan()]} pending={none} compact onOpen={vi.fn()} />);
        expect(chip().textContent).toBe('2/4');
    });

    it('takes the plan that waits for the approval before an older running one', () => {
        const run = plan({ id: 'run' });
        const wait = plan({ id: 'wait', state: 'proposed', created_at: '2026-10-16T12:05:00.000Z' });
        render(<PlanChip plans={[run, wait]} pending={none} onOpen={vi.fn()} />);
        expect(chip().getAttribute('data-plan-id')).toBe('wait');
        expect(chip().getAttribute('aria-label')).toBe(
            'Plan with 4 steps waits for your approval · click to show the plan',
        );
    });

    it('is shown for a plan that is over, too', () => {
        render(<PlanChip plans={[plan({ state: 'completed' })]} pending={none} onOpen={vi.fn()} />);
        expect(chip().getAttribute('data-plan-state')).toBe('completed');
    });

    it('has a tone per state', () => {
        const tone = (p: Plan, pending: ReadonlySet<string> = none) => {
            const { unmount } = render(<PlanChip plans={[p]} pending={pending} onOpen={vi.fn()} />);
            const t = chip().getAttribute('data-tone');
            unmount();
            return t;
        };
        expect(tone(plan())).toBe('running');
        expect(tone(plan({ state: 'paused' }))).toBe('attention');
        expect(tone(plan({ state: 'failed' }))).toBe('failed');
        expect(tone(plan({ state: 'completed' }))).toBe('default');
        const asking = plan({ steps: [step({ idx: 1, parked_approval: 'a1' })] });
        expect(tone(asking, new Set(['a1']))).toBe('attention');
    });

    it('opens with the plan it shows', () => {
        const onOpen = vi.fn();
        render(<PlanChip plans={[plan()]} pending={none} onOpen={onOpen} />);
        fireEvent.click(chip());
        expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }));
    });

    it('moves the ring only while a step runs or waits (issue #250)', () => {
        const active = (p: Plan) => {
            const { unmount } = render(<PlanChip plans={[p]} pending={none} onOpen={vi.fn()} />);
            const on = screen.queryByTestId('agent-plan-ring-active') !== null;
            unmount();
            return on;
        };
        expect(active(plan())).toBe(true);
        expect(
            active(plan({ steps: [step({ idx: 1, state: 'done' }), step({ idx: 2, state: 'waiting' })] })),
        ).toBe(true);
        expect(active(plan({ state: 'proposed', approving: true }))).toBe(true);
        expect(active(plan({ state: 'proposed' }))).toBe(false);
        expect(active(plan({ state: 'paused' }))).toBe(false);
        expect(active(plan({ steps: [step({ idx: 1, state: 'done' }), step({ idx: 2 })] }))).toBe(false);
    });

    it('names the running step in the tooltip', () => {
        const started = new Date(Date.now() - 4 * 60000 - 5000).toISOString();
        const p = plan({
            steps: [step({ idx: 1, state: 'done' }), step({ idx: 2, state: 'running', step_started_at: started })],
        });
        render(<PlanChip plans={[p]} pending={none} onOpen={vi.fn()} />);
        expect(chip().getAttribute('aria-label')).toMatch(/^Step 2\/2 running: .* · 4 min$/);
    });
});
