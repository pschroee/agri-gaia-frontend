// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The context panel's plan chip (issue #221): the chip opens the large plan dialog (issue #250), the
// chat stays mounted underneath, and another chat closes the view.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { agentApi } from '../api';
import type { Plan } from '../plan';
import { mockSearch } from '../searchMock';

const state = vi.hoisted(() => ({
    selected: 'c1' as string,
    // the search book of c1 (issue #261): empty = no search chip in the header
    searches: [] as unknown[],
}));

vi.mock('../AgentContext', () => ({
    useAgent: () => ({
        status: 'ready',
        panelOpen: true,
        setPanelOpen: () => undefined,
        selectedChatId: state.selected,
        selectChat: () => undefined,
        chatsLoaded: true,
        chats: [
            { id: 'c1', title: 'One', running: true, running_since: '2026-10-26T15:50:00.000Z' },
            { id: 'c2', title: 'Two' },
        ],
        compacting: {},
        taskLists: {},
        planLists: {
            c1: [
                {
                    id: 'p1',
                    chat_id: 'c1',
                    via: 'cli',
                    state: 'approved',
                    mode: 'autonomous',
                    created_at: '2026-10-26T15:50:00.000Z',
                    decided_at: '2026-10-26T15:51:00.000Z',
                    steps: [
                        { idx: 1, method: 'POST', path: '/x', effect: 'write', covered: true, state: 'done' },
                        { idx: 2, method: 'POST', path: '/y', effect: 'write', covered: true, state: 'running' },
                    ],
                } as Plan,
            ],
        },
        searchLists: state.searches.length ? { c1: { searches: state.searches, trials: [] } } : {},
        pendingApprovals: [],
    }),
    useAgentOptional: () => undefined,
}));
vi.mock('./ChatView', () => ({ default: ({ chatId }: { chatId: string }) => <div data-testid="chat-view">{chatId}</div> }));
vi.mock('./ChatSelector', () => ({ default: () => <div /> }));
vi.mock('./ContextMeter', () => ({ ContextMeter: () => <div /> }));
vi.mock('./TaskButton', () => ({ default: () => <div /> }));
vi.mock('./search/SearchIndicator', () => ({ default: () => <div /> }));
vi.mock('./RunStateChip', () => ({
    default: ({ dense }: { dense?: boolean }) => <div data-testid="run-state-chip" data-dense={String(!!dense)} />,
}));
vi.mock('./AgentDropZone', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('./SignInNotice', () => ({ default: () => <div /> }));

import AgentContextPanel from './AgentContextPanel';

beforeEach(() => {
    state.selected = 'c1';
    state.searches = [];
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

const draw = () =>
    render(
        <MemoryRouter>
            <AgentContextPanel />
        </MemoryRouter>,
    );

describe('the plan chip in the panel header', () => {
    it('opens the same large plan dialog as the agent page, the chat stays mounted', () => {
        draw();
        expect(screen.queryByTestId('agent-plan-dialog')).toBeNull();
        fireEvent.click(screen.getByTestId('agent-plan-chip'));
        expect(screen.getByTestId('agent-plan-dialog')).toBeTruthy();
        expect(screen.queryByTestId('agent-plan-panel')).toBeNull();
        expect(screen.getByTestId('chat-view')).toBeTruthy();
    });

    it('another chat closes the dialog', async () => {
        const { rerender } = draw();
        fireEvent.click(screen.getByTestId('agent-plan-chip'));
        expect(screen.getByTestId('agent-plan-dialog')).toBeTruthy();
        state.selected = 'c2';
        rerender(
            <MemoryRouter>
                <AgentContextPanel />
            </MemoryRouter>,
        );
        // the dialog leaves with its exit transition
        await waitFor(() => expect(screen.queryByTestId('agent-plan-dialog')).toBeNull());
    });
});

describe('the run state in the panel header (issue #261)', () => {
    it('shows the word and the timer without a search', () => {
        draw();
        expect(screen.getByTestId('run-state-chip').getAttribute('data-dense')).toBe('false');
    });

    it('shows only dot and timer while a search fills the header', () => {
        state.searches = [mockSearch()];
        draw();
        expect(screen.getByTestId('run-state-chip').getAttribute('data-dense')).toBe('true');
    });

    it('clips the state box so that it never paints over the plan chip', () => {
        draw();
        const box = screen.getByTestId('agent-panel-state');
        expect(getComputedStyle(box).overflow).toBe('hidden');
    });
});
