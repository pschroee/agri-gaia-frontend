// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Smoke tests of the plan indicator in the chat header (A-E4, D4.2): it is hidden while the plan is only
// proposed, names the step and the state per variant and jumps to the card on a click. The chip is the only part
// of the header that touches the plan; the controls live in the card.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Plan, PlanStep } from '../plan';
import PlanIndicator from './PlanIndicator';

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
        steps: [step({ idx: 1, state: 'done' }), step({ idx: 2, state: 'running' })],
        ...over,
    } as Plan);

describe('what the indicator shows', () => {
    it('is hidden while the plan is only proposed (the approval covers that)', () => {
        const { container } = render(
            <PlanIndicator plan={plan({ state: 'proposed' })} variant="panel" onShow={vi.fn()} />,
        );
        expect(container.firstChild).toBeNull();
    });

    it('is hidden without a plan', () => {
        const { container } = render(<PlanIndicator plan={undefined} variant="panel" onShow={vi.fn()} />);
        expect(container.firstChild).toBeNull();
    });

    it('names the step and, on the page, the title of the step it is on', () => {
        const p = plan({
            steps: [
                step({ idx: 1, state: 'done' }),
                step({ idx: 2, state: 'running', summary: 'Run training "EfficientNet-B0" on the dataset' }),
            ],
        });
        const { unmount } = render(<PlanIndicator plan={p} variant="panel" onShow={vi.fn()} />);
        expect(screen.getByTestId('agent-plan-indicator').textContent).toContain('Plan 2/2');
        expect(screen.getByTestId('agent-plan-indicator').textContent).not.toContain('Run training');
        unmount();

        render(<PlanIndicator plan={p} variant="page" onShow={vi.fn()} />);
        expect(screen.getByTestId('agent-plan-indicator').textContent).toContain('Plan 2/2 · Run training');
    });

    it('carries the state and the tooltip of the design', () => {
        render(<PlanIndicator plan={plan({ state: 'paused' })} variant="page" onShow={vi.fn()} />);
        const chip = screen.getByTestId('agent-plan-indicator');
        expect(chip.getAttribute('data-plan-state')).toBe('paused');
        expect(chip.getAttribute('aria-label')).toBe('Plan paused · step 2 of 2 · click to show the plan');
    });

    it('a step waiting for the user is announced as needing approval', () => {
        render(
            <PlanIndicator
                plan={plan({ steps: [step({ idx: 1, parked_approval: 'a1' })] })}
                variant="panel"
                pending={new Set(['a1'])}
                onShow={vi.fn()}
            />,
        );
        expect(screen.getByTestId('agent-plan-indicator').getAttribute('aria-label')).toBe(
            'Step 1 of 1 needs your approval · click to show the plan',
        );
    });
});

describe('the click', () => {
    it('jumps to the plan card', () => {
        const onShow = vi.fn();
        render(<PlanIndicator plan={plan()} variant="panel" onShow={onShow} />);
        fireEvent.click(screen.getByTestId('agent-plan-indicator'));
        expect(onShow).toHaveBeenCalledTimes(1);
    });
});

describe('a plan being approved (issue #166)', () => {
    it('is shown while the approval is on its way, and hidden when merely proposed', () => {
        const shown = render(
            <PlanIndicator plan={plan({ state: 'proposed', approving: true })} variant="panel" onShow={vi.fn()} />,
        );
        expect(shown.container.firstChild).not.toBeNull();
        cleanup();
        const hidden = render(<PlanIndicator plan={plan({ state: 'proposed' })} variant="panel" onShow={vi.fn()} />);
        expect(hidden.container.firstChild).toBeNull();
    });
});
