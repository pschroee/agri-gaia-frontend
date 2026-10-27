// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Smoke tests of the tab "Plans" (issue #223): the cells of a running training row, the order as delivered, the filter
// in the address, the empty, filtered-empty and error states, the plan dialog on a click on the row and the chat link
// that opens the chat without opening the dialog. The rules behind the words are checked in plansOverview.test.ts.

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Plan, PlanStep } from '../../plan';
import type { PlanListItem } from '../../plansOverview';
import type { PlanOverview } from '../../usePlanOverview';
import PlansTab from './PlansTab';

const h = vi.hoisted(() => ({ overview: undefined as unknown, lastFilters: undefined as unknown }));

vi.mock('../../AgentContext', () => ({
    useAgent: () => ({
        chats: [
            { id: 'c1', title: 'Flower classifier' },
            { id: 'c2', title: 'Dataset cleanup' },
        ],
        pendingApprovals: [],
    }),
}));
vi.mock('../../usePlanOverview', () => ({
    usePlanOverview: (f: unknown) => {
        h.lastFilters = f;
        return h.overview;
    },
}));
vi.mock('../plan/PlanDialog', () => ({
    default: (p: {
        chatId: string;
        planId?: string;
        chatTitle?: string;
        onOpenChat?: (pl: Plan) => void;
        plans: Plan[];
    }) => (
        <div data-testid="agent-plan-dialog">
            dialog {p.planId} {p.chatTitle}
            <button onClick={() => p.onOpenChat?.(p.plans[0])}>Open chat</button>
        </div>
    ),
}));

const NOW = Date.now();
const ago = (s: number) => new Date(NOW - s * 1000).toISOString();

const step = (idx: number, over: Partial<PlanStep> = {}): PlanStep => ({
    idx,
    summary: `Do thing ${idx}`,
    method: 'POST',
    path: `/x/${idx}`,
    effect: 'write',
    covered: true,
    state: 'open',
    ...over,
});

const training: PlanListItem = {
    id: 'p-train',
    chat_id: 'c1',
    chat_title: 'Flower classifier',
    agent_title: 'Train the classifier',
    via: 'cli',
    state: 'approved',
    mode: 'autonomous',
    created_at: ago(1500),
    decided_at: ago(1400),
    budget: { max_duration_s: 7200, max_llm_cost: 1.5, max_auto_turns: 20 },
    usage: { llm_cost: 0.42, auto_turns: 3, compute_used: 0, compute_max: 4 },
    steps: [
        step(1, { state: 'done' }),
        step(2, { state: 'done' }),
        step(3, { state: 'done' }),
        step(4, {
            summary: 'Start training "flowers"',
            state: 'waiting',
            last_epoch: { epoch: 3, epochs: 10, values: { val_accuracy: 0.912, loss: 0.231 } },
        }),
        step(5),
    ],
};
const completed: PlanListItem = {
    id: 'p-done',
    chat_id: 'c2',
    chat_title: 'Dataset cleanup',
    agent_title: 'Prepare data',
    via: 'cli',
    state: 'completed',
    mode: 'interactive',
    created_at: ago(90000),
    decided_at: ago(89900),
    ended_at: ago(88000),
    steps: [step(1, { state: 'done' }), step(2, { state: 'done' })],
};

const setOverview = (over: Partial<PlanOverview> & { plans?: PlanListItem[]; total?: number } = {}) => {
    const plans = over.plans ?? [training, completed];
    h.overview = {
        page: { plans, total: over.total ?? plans.length, running: 1 },
        loading: false,
        reload: vi.fn(),
        live: 'live',
        updatedAt: NOW,
        ...over,
    };
};

function Where() {
    const l = useLocation();
    return <div data-testid="where">{l.search}</div>;
}

const mount = (onOpenChat = vi.fn(), url = '/ai-agent?tab=plans') => {
    render(
        <MemoryRouter initialEntries={[url]}>
            <PlansTab onOpenChat={onOpenChat} />
            <Where />
        </MemoryRouter>,
    );
    return onOpenChat;
};

beforeEach(() => setOverview());
afterEach(cleanup);

describe('PlansTab', () => {
    it('shows the cells of a running training row', () => {
        mount();
        const row = screen.getAllByTestId('overview-row')[0];
        expect(row.getAttribute('data-plan-id')).toBe('p-train');
        expect(row.getAttribute('data-plan-state')).toBe('approved');
        const r = within(row);
        expect(r.getByText('Train the classifier')).toBeTruthy();
        expect(r.getByText('Autonomous · 5 steps')).toBeTruthy();
        expect(r.getByText('3/5')).toBeTruthy();
        expect(r.getByText('Step 4 · Start training')).toBeTruthy();
        expect(r.getByText('Epoch 3 of 10 · val_accuracy 0.912 · loss 0.231')).toBeTruthy();
        expect(r.getByText('0.42 / 1.50 USD')).toBeTruthy();
        expect(r.getByText('23 min')).toBeTruthy();
        expect(r.getByRole('button', { name: 'Open chat Flower classifier' })).toBeTruthy();
    });

    it('shows the whole progress figure of a ten-step plan', () => {
        const ten: PlanListItem = {
            ...completed,
            id: 'p-ten',
            steps: Array.from({ length: 10 }, (_, i) => step(i + 1, { state: 'done' })),
        };
        setOverview({ plans: [ten] });
        mount();
        const text = screen.getByTestId('plan-progress-text');
        expect(text.textContent).toBe('10/10');
        const css = getComputedStyle(text);
        expect(css.whiteSpace).toBe('nowrap');
        expect(css.flex).toMatch(/^(none|0 0 auto)/);
        expect(screen.getByRole('progressbar', { name: '10 of 10 steps done' })).toBeTruthy();
    });

    it('keeps the order the gateway delivered and shows the running count', () => {
        mount();
        const ids = screen.getAllByTestId('overview-row').map((r) => r.getAttribute('data-plan-id'));
        expect(ids).toEqual(['p-train', 'p-done']);
        expect(screen.getByTestId('plans-running').textContent).toBe('1 running');
    });

    it('writes a filter to the address and asks for it', () => {
        mount();
        fireEvent.mouseDown(within(screen.getByTestId('overview-filter-bar')).getAllByRole('combobox')[0]);
        fireEvent.click(screen.getByRole('option', { name: 'Failed' }));
        expect(screen.getByTestId('where').textContent).toContain('status=failed');
        expect(screen.getByTestId('where').textContent).toContain('tab=plans');
        expect((h.lastFilters as { status: string }).status).toBe('failed');
    });

    it('reads the filters from the address', () => {
        mount(vi.fn(), '/ai-agent?tab=plans&status=active&mode=autonomous&chat=c1');
        expect(h.lastFilters).toMatchObject({
            status: 'active',
            mode: 'autonomous',
            chat: 'c1',
            page: 0,
            rowsPerPage: 25,
        });
        expect(screen.getByRole('button', { name: 'Reset' })).toBeTruthy();
    });

    it('says so when there are no plans, and when no plan matches', () => {
        setOverview({ plans: [], total: 0 });
        mount();
        expect(screen.getByText('No plans yet. Plans appear here once the agent proposes one in a chat.')).toBeTruthy();
        cleanup();
        mount(vi.fn(), '/ai-agent?tab=plans&status=failed');
        expect(screen.getByText('No plans match these filters.')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Reset filters' })).toBeTruthy();
    });

    it('shows the error with a retry', () => {
        const reload = vi.fn();
        h.overview = {
            page: undefined,
            loading: false,
            error: '500 Internal Server Error',
            reload,
            live: 'reconnecting',
        };
        mount();
        expect(screen.getByTestId('overview-error').textContent).toContain(
            'Could not load the plans: 500 Internal Server Error',
        );
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(reload).toHaveBeenCalled();
    });

    it('shows the skeleton while the first page loads', () => {
        h.overview = { page: undefined, loading: true, reload: vi.fn(), live: 'reconnecting' };
        mount();
        expect(screen.getByTestId('overview-loading')).toBeTruthy();
    });

    it('opens the plan dialog on a click on the row, with the chat title, and the dialog opens the chat', () => {
        const onOpenChat = mount();
        fireEvent.click(screen.getAllByTestId('overview-row')[0]);
        const dialog = screen.getByTestId('agent-plan-dialog');
        expect(dialog.textContent).toContain('p-train');
        expect(dialog.textContent).toContain('Flower classifier');
        fireEvent.click(within(dialog).getByRole('button', { name: 'Open chat' }));
        expect(onOpenChat).toHaveBeenCalledWith('c1');
    });

    it('opens the chat from the chat link and not the dialog', () => {
        const onOpenChat = mount();
        fireEvent.click(screen.getByRole('button', { name: 'Open chat Dataset cleanup' }));
        expect(onOpenChat).toHaveBeenCalledWith('c2');
        expect(screen.queryByTestId('agent-plan-dialog')).toBeNull();
    });
});
