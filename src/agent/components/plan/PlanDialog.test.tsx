// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The plan dialog (issue #221): title, head band, the choice between two plans, "Show in chat" only where the card
// exists, the jump after the dialog has closed, and "Open chat" for the plans tab.

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { agentApi } from '../../api';
import type { Plan, PlanStep } from '../../plan';
import { PlanCardRegistryProvider, useRegisterPlanCard } from '../../planRegistry';
import PlanDialog from './PlanDialog';

const EVENTS_STUB = class {
    onmessage: unknown = null;
    onerror: unknown = null;
    close() {
        // nothing to close
    }
};

beforeEach(() => {
    vi.stubGlobal('EventSource', EVENTS_STUB);
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

const plan = (over: Partial<Plan> = {}): Plan =>
    ({
        id: 'p1',
        chat_id: 'c1',
        via: 'cli',
        state: 'approved',
        mode: 'autonomous',
        created_at: '2026-10-26T15:50:00.000Z',
        decided_at: '2026-10-26T15:51:00.000Z',
        agent_title: 'Train and ship',
        steps: [step({ idx: 1, state: 'done' }), step({ idx: 2, state: 'running' }), step({ idx: 3 })],
        ...over,
    }) as Plan;

function Card({ id }: { id: string }) {
    useRegisterPlanCard(id, true);
    return <div data-testid="agent-plan-card" data-plan-id={id} />;
}

const draw = (props: Partial<Parameters<typeof PlanDialog>[0]> = {}, withCard = true) => {
    const p = plan();
    const onClose = vi.fn();
    const out = render(
        <PlanCardRegistryProvider>
            {withCard && <Card id={p.id} />}
            <PlanDialog open onClose={onClose} chatId="c1" plans={[p]} planId="p1" {...props} />
        </PlanCardRegistryProvider>,
    );
    return { ...out, onClose };
};

describe('PlanDialog', () => {
    it('shows the title, the agent title marked as unverified and the head band', async () => {
        draw();
        const dialog = await screen.findByTestId('agent-plan-dialog');
        expect(within(dialog).getByText('Plan · 3 steps')).toBeTruthy();
        expect(within(dialog).getByTestId('agent-plan-dialog-agent-title').textContent).toContain('Train and ship');
        expect(within(dialog).getByTestId('agent-plan-dialog-agent-title').textContent).toContain('not verified');
        expect(within(dialog).getByTestId('agent-plan-head-line').textContent).toMatch(
            /^1 of 3 steps done · started \d\d:\d\d · running for /,
        );
        expect(within(dialog).getAllByTestId('agent-plan-step-row')).toHaveLength(3);
    });

    it('offers the choice only with more than one plan, newest first', async () => {
        const { unmount } = draw();
        await screen.findByTestId('agent-plan-dialog');
        expect(screen.queryByTestId('agent-plan-dialog-select')).toBeNull();
        unmount();
        const older = plan({ id: 'p0', created_at: '2026-10-26T14:00:00.000Z', agent_title: 'Older' });
        render(
            <PlanCardRegistryProvider>
                <PlanDialog open onClose={vi.fn()} chatId="c1" plans={[older, plan()]} planId="p1" />
            </PlanCardRegistryProvider>,
        );
        const select = await screen.findByTestId('agent-plan-dialog-select');
        expect(select).toBeTruthy();
        // a long plan title in the selector must not squeeze the dialog title (render check, #225)
        const box = select.closest('.MuiInputBase-root') as HTMLElement;
        expect(getComputedStyle(box).width).toBe('280px');
        expect(getComputedStyle(box).flexShrink).toBe('0');
    });

    it('shows "Show in chat" only when the card of the plan is in the chat', async () => {
        const { unmount } = draw({}, false);
        await screen.findByTestId('agent-plan-dialog');
        expect(screen.queryByText('Show in chat')).toBeNull();
        unmount();
        draw({}, true);
        expect(await screen.findByText('Show in chat')).toBeTruthy();
    });

    it('closes first and then scrolls to the card', async () => {
        const scrollIntoView = vi.fn();
        Element.prototype.scrollIntoView = scrollIntoView;
        const onShowInChat = vi.fn();
        const { rerender, onClose } = draw({ onShowInChat });
        fireEvent.click(await screen.findByTestId('agent-plan-dialog-show'));
        expect(onClose).toHaveBeenCalled();
        expect(onShowInChat).not.toHaveBeenCalled();
        rerender(
            <PlanCardRegistryProvider>
                <Card id="p1" />
                <PlanDialog open={false} onClose={onClose} chatId="c1" plans={[plan()]} planId="p1" onShowInChat={onShowInChat} />
            </PlanCardRegistryProvider>,
        );
        await waitFor(() => expect(onShowInChat).toHaveBeenCalledWith('p1'));
    });

    it('"Open chat" replaces the jump and names the chat', async () => {
        const onOpenChat = vi.fn();
        draw({ onOpenChat, chatTitle: 'Mnist run' }, false);
        expect((await screen.findByTestId('agent-plan-dialog-chat')).textContent).toBe('Chat: Mnist run');
        expect(screen.queryByTestId('agent-plan-dialog-show')).toBeNull();
        fireEvent.click(screen.getByTestId('agent-plan-dialog-open-chat'));
        expect(onOpenChat).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }));
    });

    it('names the step that waits for a single approval in the foot', async () => {
        const p = plan({ steps: [step({ idx: 1, state: 'done' }), step({ idx: 2, parked_approval: 'a1', covered: false })] });
        render(
            <PlanCardRegistryProvider>
                <PlanDialog open onClose={vi.fn()} chatId="c1" plans={[p]} planId="p1" pending={new Set(['a1'])} />
            </PlanCardRegistryProvider>,
        );
        expect((await screen.findByTestId('agent-plan-dialog-asking')).textContent).toBe(
            'Step 2 waits for your approval in the chat.',
        );
    });

    it('closes with Escape and with the buttons', async () => {
        const { onClose } = draw();
        const dialog = await screen.findByTestId('agent-plan-dialog');
        fireEvent.keyDown(dialog, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);
        const closers = within(dialog).getAllByRole('button', { name: 'Close' });
        expect(closers).toHaveLength(2);
        fireEvent.click(closers[1]);
        await act(async () => undefined);
        expect(onClose.mock.calls.length).toBeGreaterThan(1);
    });
});
