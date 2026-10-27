// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The search step of a plan (issue #245): the table before the start, the progress and the link after it.

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { agentApi } from '../../api';
import type { Plan, PlanStep } from '../../plan';
import PlanStepRow from './PlanStepRow';

beforeEach(() => {
    vi.spyOn(agentApi, 'activity').mockResolvedValue({
        calls: [],
        chats: {},
        summary: { total: 0, outcomes: {}, chats: 0, runs: 0 },
    } as never);
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

const SUMMARY =
    'Training search on the training container of step 2: lr 1e-4..1e-2 log; ' +
    'up to 6 trials, 30 compute minutes, objective val_acc (stop at >= 0.97); trials run without asking inside this space';

const searchStep = (over: Partial<PlanStep> = {}): PlanStep => ({
    idx: 3,
    method: 'POST',
    path: '/_agw/search',
    tool: 'propose_search',
    effect: 'compute',
    covered: true,
    state: 'open',
    summary: SUMMARY,
    ...over,
});

const plan = (steps: PlanStep[]): Plan =>
    ({ id: 'p1', chat_id: 'c1', via: 'cli', state: 'approved', created_at: '2026-10-27T09:00:00.000Z', steps }) as Plan;

const row = (s: PlanStep) => (
    <PlanStepRow
        plan={plan([s])}
        step={s}
        variant="detail"
        open
        onToggle={() => {}}
        current
        pending={new Set()}
        now={Date.parse('2026-10-27T10:00:00.000Z')}
        chatId="c1"
    />
);

describe('PlanStepRow with a search step', () => {
    it('shows the summary as a table before the start', () => {
        render(row(searchStep()));
        const table = screen.getByTestId('agent-plan-search-table');
        expect(within(table).getByText('lr · 1e-4..1e-2 log')).toBeTruthy();
        expect(within(table).getByText('up to 6 trials, 30 compute minutes')).toBeTruthy();
        expect(within(table).getByText('val_acc (stop at >= 0.97)')).toBeTruthy();
        expect(screen.queryByTestId('agent-plan-search-progress')).toBeNull();
    });

    it('shows the link to the search after the start, and no table', () => {
        render(row(searchStep({ state: 'waiting', search_id: 's1' })));
        expect(screen.queryByTestId('agent-plan-search-table')).toBeNull();
        expect(screen.getByTestId('agent-plan-search-show').textContent).toBe('Show search');
    });

    it('has neither for a step that is no search', () => {
        render(row(searchStep({ tool: 'start_training', summary: undefined })));
        expect(screen.queryByTestId('agent-plan-search-table')).toBeNull();
        expect(screen.queryByTestId('agent-plan-search-progress')).toBeNull();
    });
});
