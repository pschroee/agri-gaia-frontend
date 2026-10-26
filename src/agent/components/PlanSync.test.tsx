// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Header button and card show the same plan (issue #166): both render from one list, so one plan event moves both.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { agentApi } from '../api';

import { upsertPlan } from '../plan';
import type { Plan, PlanStep } from '../plan';
import PlanButton from './PlanButton';
import PlanCard from './PlanCard';

beforeEach(() => {
    vi.spyOn(agentApi, 'activity').mockResolvedValue({ calls: [], chats: {}, summary: { total: 0, outcomes: {}, chats: 0, runs: 0 } } as never);
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

const step = (over: Partial<PlanStep> = {}): PlanStep => ({
    idx: 1,
    method: 'PATCH',
    path: '/datasets/16',
    effect: 'write',
    covered: true,
    state: 'open',
    ...over,
});

const base: Plan = {
    id: 'p1',
    chat_id: 'c1',
    via: 'cli',
    state: 'proposed',
    created_at: '2026-10-17T10:00:00Z',
    steps: [step()],
} as Plan;

function Frame({ plans }: { plans: Plan[] }) {
    return (
        <>
            <PlanButton plans={plans} />
            <PlanCard plan={plans[0]} onControl={async () => undefined} />
        </>
    );
}

describe('one list feeds the button and the card', () => {
    it('shows the running step in both after one plan event', () => {
        const { rerender } = render(<Frame plans={[base]} />);
        // jsdom has no width, so the button shows its compact label; the mark carries the state
        expect(screen.getByTestId('agent-plan-button').getAttribute('data-plan-mark')).toBe('approval');
        const event: Plan = {
            ...base,
            state: 'approved',
            expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
            steps: [step({ state: 'running' })],
        };
        rerender(<Frame plans={upsertPlan([base], event)} />);
        expect(screen.getByTestId('agent-plan-button').getAttribute('data-plan-mark')).toBe('running');
        expect(screen.getByTestId('agent-plan-step-row').getAttribute('data-status')).toBe('running');
        fireEvent.click(screen.getByTestId('agent-plan-button'));
        expect(screen.getAllByText(/Approved · valid until/).length).toBeGreaterThan(0);
    });
});
