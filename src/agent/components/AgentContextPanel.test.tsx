// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The context panel's plan chip (issue #221): the chip opens the large plan dialog (issue #250), the
// chat stays mounted underneath, and another chat closes the view.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { agentApi } from '../api';
import type { Plan } from '../plan';

const state = vi.hoisted(() => ({ selected: 'c1' as string }));

vi.mock('../AgentContext', () => ({
    useAgent: () => ({
        status: 'ready',
        panelOpen: true,
        setPanelOpen: () => undefined,
        selectedChatId: state.selected,
        selectChat: () => undefined,
        chatsLoaded: true,
        chats: [
            { id: 'c1', title: 'One' },
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
        searchLists: {},
        pendingApprovals: [],
    }),
    useAgentOptional: () => undefined,
}));
vi.mock('./ChatView', () => ({ default: ({ chatId }: { chatId: string }) => <div data-testid="chat-view">{chatId}</div> }));
vi.mock('./ChatSelector', () => ({ default: () => <div /> }));
vi.mock('./ContextMeter', () => ({ ContextMeter: () => <div /> }));
vi.mock('./TaskButton', () => ({ default: () => <div /> }));
vi.mock('./search/SearchIndicator', () => ({ default: () => <div /> }));
vi.mock('./RunStateChip', () => ({ default: () => <div /> }));
vi.mock('./AgentDropZone', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('./SignInNotice', () => ({ default: () => <div /> }));

import AgentContextPanel from './AgentContextPanel';

beforeEach(() => {
    state.selected = 'c1';
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

    it('another chat closes the dialog', () => {
        const { rerender } = draw();
        fireEvent.click(screen.getByTestId('agent-plan-chip'));
        expect(screen.getByTestId('agent-plan-dialog')).toBeTruthy();
        state.selected = 'c2';
        rerender(
            <MemoryRouter>
                <AgentContextPanel />
            </MemoryRouter>,
        );
        expect(screen.queryByTestId('agent-plan-dialog')).toBeNull();
    });
});
