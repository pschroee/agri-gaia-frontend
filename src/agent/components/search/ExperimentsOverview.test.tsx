// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The overview of all runs (issue #222): rows of several chats without any chat choice, running ones marked, the chat
// as a link, filters that write the address and load again, the empty states. The rules behind the cells are
// checked in experimentRuns.test.ts, the table itself in overview/OverviewTable.test.tsx.

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RunPage } from '../../experimentRuns';
import { makePage, makeRun } from '../../experimentsFixtures';
import ExperimentsOverview from './ExperimentsOverview';

const h = vi.hoisted(() => ({ fetchRuns: vi.fn() }));

vi.mock('../../experimentRuns', async (orig) => ({
    ...(await orig<typeof import('../../experimentRuns')>()),
    fetchExperimentRuns: h.fetchRuns,
}));

function Probe() {
    return <div data-testid="search">{useLocation().search}</div>;
}

const onOpenRun = vi.fn();
const onOpenChat = vi.fn();

const mount = (url = '/ai-agent?tab=experiments') =>
    render(
        <MemoryRouter initialEntries={[url]}>
            <ExperimentsOverview onOpenRun={onOpenRun} onOpenChat={onOpenChat} />
            <Probe />
        </MemoryRouter>,
    );

const rows = () => [
    makeRun(),
    makeRun({ kind: 'notebook_run', id: 'w1', chat_id: 'c2', chat_title: 'Preprocess images', title: 'prep.py', progress: {}, score: null, duration_s: 90 }),
    makeRun({ id: 's2', state: 'waiting', chat_id: 'c3', chat_title: 'Tail biting', title: 'pig-search', progress: {}, score: null }),
    makeRun({ kind: 'training_run', id: 't1', state: 'done', title: 'Single run 1', progress: { epoch: 20, epochs: 20 }, ended_at: '2026-10-20T09:00:00Z' }),
];

beforeEach(() => {
    h.fetchRuns.mockReset();
    h.fetchRuns.mockImplementation(async () => makePage(rows()));
    onOpenRun.mockClear();
    onOpenChat.mockClear();
});
afterEach(cleanup);

describe('ExperimentsOverview', () => {
    it('lists the runs of several chats at once, without a chat choice', async () => {
        mount();
        const table = await screen.findByTestId('overview-table');
        expect(within(table).getAllByTestId('overview-row')).toHaveLength(4);
        expect(screen.queryByRole('combobox', { name: 'Show' })).toBeNull();
        const links = within(table).getAllByRole('button', { name: /Train flowers classifier|Preprocess images|Tail biting/ });
        expect(links.length).toBeGreaterThanOrEqual(3);
        expect(screen.getByTestId('overview-summary').textContent).toContain('1 running');
        expect(screen.getByTestId('overview-summary').textContent).toContain('1 waiting for your approval');
        expect(screen.getByTestId('overview-summary').textContent).toContain('4 runs');
        expect(screen.getByText('Running first, then newest')).toBeTruthy();
    });

    it('marks running and waiting rows and shows how far a run is', async () => {
        mount();
        const rs = await screen.findAllByTestId('overview-row');
        expect(rs[0].getAttribute('data-state')).toBe('running');
        expect(rs[0].getAttribute('data-tone')).toBe('active');
        expect(rs[2].getAttribute('data-tone')).toBe('attention');
        expect(within(rs[0]).getByText('Trial 3 of 10 · epoch 4/20')).toBeTruthy();
        expect(within(rs[1]).getByText('Running')).toBeTruthy();
        expect(within(rs[2]).getByText('Waits for your approval')).toBeTruthy();
    });

    it('opens the chat from its link without opening the run', async () => {
        mount();
        const rs = await screen.findAllByTestId('overview-row');
        fireEvent.click(within(rs[1]).getByRole('button', { name: 'Preprocess images' }));
        expect(onOpenChat).toHaveBeenCalledWith('c2');
        expect(onOpenRun).not.toHaveBeenCalled();
    });

    it('opens the run on a click on the row', async () => {
        mount();
        const rs = await screen.findAllByTestId('overview-row');
        fireEvent.click(rs[3]);
        expect(onOpenRun).toHaveBeenCalledWith(expect.objectContaining({ id: 't1', chat_id: 'c1' }));
    });

    it('writes a filter into the address and loads again with it', async () => {
        mount();
        await screen.findByTestId('overview-table');
        fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Status' }));
        fireEvent.click(screen.getByRole('option', { name: 'Running (1)' }));
        await waitFor(() => expect(screen.getByTestId('search').textContent).toContain('status=running'));
        await waitFor(() => expect(h.fetchRuns.mock.calls.some((c) => String(c[0]).includes('state=running'))).toBe(true));
        expect(screen.getByRole('button', { name: 'Reset' })).toBeTruthy();
    });

    it('starts from the state in the address and resets it', async () => {
        mount('/ai-agent?tab=experiments&status=failed&sort=duration&order=desc&page=1');
        await waitFor(() => expect(h.fetchRuns).toHaveBeenCalled());
        const q = String(h.fetchRuns.mock.calls[0][0]);
        expect(q).toContain('state=failed');
        expect(q).toContain('sort=duration');
        expect(q).toContain('offset=25');
        await screen.findByTestId('overview-table');
        fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
        await waitFor(() => expect(screen.getByTestId('search').textContent).toBe('?tab=experiments'));
    });

    it('sorts by a column header and starts from the first page', async () => {
        mount('/ai-agent?tab=experiments&page=1');
        await screen.findByTestId('overview-table');
        fireEvent.click(screen.getByText('Duration'));
        await waitFor(() => expect(screen.getByTestId('search').textContent).toContain('sort=duration'));
        expect(screen.getByTestId('search').textContent).toContain('order=desc');
        expect(screen.getByTestId('search').textContent).not.toContain('page=');
        expect(screen.queryByText('Running first, then newest')).toBeNull();
    });

    it('says there are no experiments yet when nothing was ever started', async () => {
        h.fetchRuns.mockImplementation(async () => makePage([]));
        mount();
        const empty = await screen.findByTestId('overview-empty');
        expect(empty.textContent).toContain('No experiments yet');
        expect(empty.textContent).toContain('appear here');
    });

    it('says no run matches the filters and offers to reset them', async () => {
        h.fetchRuns.mockImplementation(async () => makePage([]));
        mount('/ai-agent?tab=experiments&status=failed');
        const empty = await screen.findByTestId('overview-empty');
        expect(empty.textContent).toContain('No runs match these filters.');
        fireEvent.click(within(empty).getByRole('button', { name: 'Reset filters' }));
        await waitFor(() => expect(screen.getByTestId('search').textContent).toBe('?tab=experiments'));
    });

    it('shows an error with Retry when the first load fails', async () => {
        h.fetchRuns.mockImplementationOnce(async () => {
            throw new Error('500 Internal Server Error');
        });
        mount();
        const err = await screen.findByTestId('overview-error');
        expect(err.textContent).toContain('Could not load the experiments: 500 Internal Server Error');
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        await screen.findByTestId('overview-table');
    });

    it('shows skeletons while the first answer is on its way', () => {
        h.fetchRuns.mockImplementation(() => new Promise<RunPage>(() => undefined));
        mount();
        expect(screen.getByTestId('overview-loading')).toBeTruthy();
    });
});
