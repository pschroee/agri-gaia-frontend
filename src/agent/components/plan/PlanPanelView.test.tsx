// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The plan view of the 400 px panel (issue #221): the surface, "Back to chat", Escape and "Show in chat".

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { agentApi } from '../../api';
import type { Plan, PlanStep } from '../../plan';
import PlanPanelView from './PlanPanelView';

beforeEach(() => {
    vi.stubGlobal(
        'EventSource',
        class {
            onmessage: unknown = null;
            onerror: unknown = null;
            close() {
        // nothing to close
    }
        },
    );
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => [] })));
    vi.spyOn(agentApi, 'activity').mockResolvedValue({
        calls: [],
        chats: {},
        summary: { total: 0, outcomes: {}, chats: 0, runs: 0 },
    } as never);
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

const step = (over: Partial<PlanStep> = {}): PlanStep => ({
    idx: 1,
    method: 'POST',
    path: '/datasets',
    effect: 'write',
    covered: true,
    state: 'open',
    ...over,
});

const p1 = {
    id: 'p1',
    chat_id: 'c1',
    via: 'cli',
    state: 'approved',
    mode: 'autonomous',
    created_at: '2026-10-26T15:50:00.000Z',
    decided_at: '2026-10-26T15:51:00.000Z',
    steps: [step({ idx: 1, state: 'done' }), step({ idx: 2, state: 'running' })],
} as Plan;

describe('PlanPanelView', () => {
    it('covers the chat area with the plan in compact rows', () => {
        render(<PlanPanelView chatId="c1" plans={[p1]} planId="p1" onBack={vi.fn()} />);
        const view = screen.getByTestId('agent-plan-panel');
        expect(getComputedStyle(view).position).toBe('absolute');
        expect(screen.getByText('Plan · 2 steps')).toBeTruthy();
        expect(screen.getByTestId('agent-plan-steps').getAttribute('data-variant')).toBe('compact');
        expect(screen.getAllByTestId('agent-plan-step-row')).toHaveLength(2);
    });

    it('goes back with the button and with Escape', () => {
        const onBack = vi.fn();
        render(<PlanPanelView chatId="c1" plans={[p1]} planId="p1" onBack={onBack} />);
        fireEvent.click(screen.getByRole('button', { name: 'Back to chat' }));
        expect(onBack).toHaveBeenCalledTimes(1);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onBack).toHaveBeenCalledTimes(2);
    });

    it('offers "Show in chat" only while the card is in the document', () => {
        const { unmount } = render(<PlanPanelView chatId="c1" plans={[p1]} planId="p1" onBack={vi.fn()} />);
        expect(screen.queryByTestId('agent-plan-panel-show')).toBeNull();
        unmount();
        const card = document.createElement('div');
        card.setAttribute('data-testid', 'agent-plan-card');
        card.setAttribute('data-plan-id', 'p1');
        document.body.appendChild(card);
        render(<PlanPanelView chatId="c1" plans={[p1]} planId="p1" onBack={vi.fn()} />);
        expect(screen.getByTestId('agent-plan-panel-show')).toBeTruthy();
        card.remove();
    });

    it('draws nothing for a plan that is gone', () => {
        const { container } = render(<PlanPanelView chatId="c1" plans={[p1]} planId="nope" onBack={vi.fn()} />);
        expect(container.firstChild).toBeNull();
    });
});
