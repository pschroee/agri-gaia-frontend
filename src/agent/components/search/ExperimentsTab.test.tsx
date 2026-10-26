// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The tab "Experiments" is a switch (issue #222): the overview without a run in the address, the detail with one;
// opening a run keeps the state of the overview in the address and "Back to overview" removes only the detail.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ExperimentsTab from './ExperimentsTab';

vi.mock('../../AgentContext', () => ({ useAgent: () => ({ chats: [], selectedChatId: 'c9' }) }));
vi.mock('./ExperimentsOverview', () => ({
    default: (p: { onOpenRun: (r: unknown) => void; onOpenChat: (id: string) => void }) => (
        <div data-testid="experiments-overview">
            <button onClick={() => p.onOpenRun({ id: 's1', chat_id: 'c1' })}>open run</button>
            <button onClick={() => p.onOpenChat('c2')}>open chat</button>
        </div>
    ),
}));
vi.mock('./ExperimentDetail', () => ({
    default: (p: { chatId: string; runId: string; trialId?: string; row?: { id: string }; onBack: () => void; onSelectTrial: (t: string) => void; onAllRuns: (c: string) => void }) => (
        <div data-testid="experiment-detail">
            {p.chatId}/{p.runId}/{p.trialId ?? '-'}/{p.row?.id ?? 'no row'}
            <button onClick={p.onBack}>back</button>
            <button onClick={() => p.onSelectTrial('t3')}>select</button>
            <button onClick={() => p.onAllRuns('c1')}>all runs</button>
        </div>
    ),
}));

function Probe() {
    return <div data-testid="search">{useLocation().search}</div>;
}

const mount = (url: string, onOpenChat = vi.fn()) =>
    render(
        <MemoryRouter initialEntries={[url]}>
            <ExperimentsTab onOpenChat={onOpenChat} />
            <Probe />
        </MemoryRouter>,
    );

afterEach(cleanup);

describe('ExperimentsTab', () => {
    it('shows the overview when the address names no run, and no chat choice', () => {
        mount('/ai-agent?tab=experiments&status=running');
        expect(screen.getByTestId('experiments-overview')).toBeTruthy();
        expect(screen.queryByTestId('experiment-detail')).toBeNull();
        expect(screen.queryByRole('combobox')).toBeNull();
    });

    it('opens a run into the address, keeping the filters, and goes back to them', () => {
        mount('/ai-agent?tab=experiments&status=running&page=1');
        fireEvent.click(screen.getByText('open run'));
        expect(screen.getByTestId('experiment-detail').textContent).toContain('c1/s1/-/s1');
        expect(screen.getByTestId('search').textContent).toBe('?tab=experiments&status=running&page=1&chat=c1&run=s1');
        fireEvent.click(screen.getByText('back'));
        expect(screen.getByTestId('experiments-overview')).toBeTruthy();
        expect(screen.getByTestId('search').textContent).toBe('?tab=experiments&status=running&page=1');
    });

    it('shows the detail from an address, without a row, and an older ?search= link too', () => {
        mount('/ai-agent?tab=experiments&chat=c1&run=s5&trial=t2');
        expect(screen.getByTestId('experiment-detail').textContent).toContain('c1/s5/t2/no row');
        cleanup();
        mount('/ai-agent?tab=experiments&search=s7');
        expect(screen.getByTestId('experiment-detail').textContent).toContain('c9/s7/-/no row');
    });

    it('writes the chosen trial into the address', () => {
        mount('/ai-agent?tab=experiments&chat=c1&run=s5');
        fireEvent.click(screen.getByText('select'));
        expect(screen.getByTestId('search').textContent).toContain('trial=t3');
    });

    it('"All runs of this chat" returns to the overview filtered to the chat', () => {
        mount('/ai-agent?tab=experiments&chat=c1&run=s5&page=2');
        fireEvent.click(screen.getByText('all runs'));
        expect(screen.getByTestId('experiments-overview')).toBeTruthy();
        expect(screen.getByTestId('search').textContent).toBe('?tab=experiments&in_chat=c1');
    });

    it('passes the chat link on', () => {
        const onOpenChat = vi.fn();
        mount('/ai-agent?tab=experiments', onOpenChat);
        fireEvent.click(screen.getByText('open chat'));
        expect(onOpenChat).toHaveBeenCalledWith('c2');
    });
});
