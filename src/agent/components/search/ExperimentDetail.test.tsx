// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The detail of one run (issue #222): the body of each kind, the head with "Back to overview" and "Open chat", the
// links that appear only when there is something to link to, and the hint for a run that is not there.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExperimentsState } from '../../experiments';
import { emptyExperiments } from '../../experiments';
import { makeRun, makeSearch, makeTrial, trials } from '../../experimentsFixtures';
import type { WatchJob } from '../../jobs';
import ExperimentDetail from './ExperimentDetail';

const h = vi.hoisted(() => ({ state: undefined as unknown, jobs: [] as unknown[], fetchRuns: vi.fn(), plans: vi.fn() }));

vi.mock('../../AgentContext', () => ({ useAgent: () => ({ chats: [{ id: 'c1', title: 'Train flowers classifier' }], selectedChatId: 'c1' }) }));
vi.mock('../../assess', () => ({ useChecks: () => [] }));
vi.mock('../../experiments', async (orig) => ({
    ...(await orig<typeof import('../../experiments')>()),
    useExperiments: () => ({ state: h.state, actions: { stopTrial: vi.fn(), stopSearch: vi.fn(), changeBudget: vi.fn(), giveHint: vi.fn(), adoptTrial: vi.fn(), reload: vi.fn() } }),
}));
vi.mock('../../jobs', async (orig) => ({ ...(await orig<typeof import('../../jobs')>()), useJobs: () => h.jobs }));
vi.mock('../../experimentRuns', async (orig) => ({ ...(await orig<typeof import('../../experimentRuns')>()), fetchExperimentRuns: h.fetchRuns }));
vi.mock('./SearchDetail', () => ({ default: (p: { search: { id: string }; trialId?: string }) => <div data-testid="body-search">search {p.search.id} trial {p.trialId ?? 'none'}</div> }));
vi.mock('./TrialDetail', () => ({ default: (p: { trial: { id: string }; search?: { id: string } }) => <div data-testid="body-trial">trial {p.trial.id} of {p.search?.id ?? 'no search'}</div> }));
vi.mock('../../api', async (orig) => {
    const real = await orig<typeof import('../../api')>();
    return { ...real, agentApi: { ...real.agentApi, plans: h.plans } };
});
vi.mock('../plan/PlanDialog', () => ({
    default: (p: { planId?: string; plans: unknown[] }) => <div data-testid="plan-dialog-probe">{`${p.planId} of ${p.plans.length}`}</div>,
}));
vi.mock('./NotebookRunDetail', () => ({ default: (p: { job?: { id: string } }) => <div data-testid="body-notebook">job {p.job?.id ?? 'none'}</div> }));

const load = (over: Partial<ExperimentsState>) => {
    h.state = { ...emptyExperiments, loaded: true, chatId: 'c1', ...over };
};

const onBack = vi.fn();
const onOpenChat = vi.fn();
const onAllRuns = vi.fn();

function Probe() {
    const l = useLocation();
    return <div data-testid="location">{l.pathname + l.search}</div>;
}

const mount = (runId: string, extra: Partial<React.ComponentProps<typeof ExperimentDetail>> = {}) =>
    render(
        <MemoryRouter>
            <ExperimentDetail chatId="c1" runId={runId} onBack={onBack} onOpenChat={onOpenChat} onSelectTrial={vi.fn()} onAllRuns={onAllRuns} {...extra} />
            <Probe />
        </MemoryRouter>,
    );

const job = (over: Partial<WatchJob> = {}): WatchJob => ({ id: 'w1', chat_id: 'c1', kind: 'notebook_run', state: 'running', ...over });

beforeEach(() => {
    h.jobs = [];
    h.fetchRuns.mockReset();
    h.fetchRuns.mockImplementation(async () => ({ runs: [], total: 0, offset: 0, limit: 100, counts: {}, chats: [], truncated: false }));
    onBack.mockClear();
    onOpenChat.mockClear();
    onAllRuns.mockClear();
});
afterEach(cleanup);

describe('ExperimentDetail', () => {
    it('shows the search view for a search, with the trial the address names', () => {
        load({ searches: [makeSearch()], trials: trials() });
        mount('s1', { trialId: 't2' });
        expect(screen.getByTestId('body-search').textContent).toBe('search s1 trial t2');
        expect(screen.getByTestId('experiment-detail').getAttribute('data-kind')).toBe('training_search');
        expect(screen.getByRole('heading', { name: 'tf-flowers' })).toBeTruthy();
        expect(screen.getByText('Training search')).toBeTruthy();
    });

    it('shows TrialDetail without a search for a single run', () => {
        load({ trials: [makeTrial(0, { id: 't9', idx: 0, seq: 1, search_id: undefined, path: 'notebook', state: 'done' })] });
        mount('t9');
        expect(screen.getByTestId('body-trial').textContent).toBe('trial t9 of no search');
        expect(screen.getByText('Training run')).toBeTruthy();
    });

    it('a single run opened by its address names what it trains and offers its plan (issue #227)', async () => {
        load({
            trials: [
                makeTrial(0, {
                    id: 't-render-2',
                    idx: 0,
                    seq: 2,
                    search_id: undefined,
                    state: 'running',
                    subject: { container_id: 145, architecture: 'efficientnet_v2_s', dataset: { id: 177, name: 'Pig tail biting' } },
                    plan_id: 'p1',
                    plan_step: 3,
                }),
            ],
        });
        h.plans.mockResolvedValue([{ id: 'p1', chat_id: 'c1', title: 'Demo', state: 'approved', mode: 'interactive', created_at: '2026-10-26T10:00:00Z', steps: [] }]);
        mount('t-render-2');
        expect(screen.getByRole('heading', { name: 'efficientnet_v2_s on Pig tail biting' })).toBeTruthy();
        fireEvent.click(screen.getByText('Plan step 3 · Show plan'));
        expect(h.plans).toHaveBeenCalledWith('c1');
        expect((await screen.findByTestId('plan-dialog-probe')).textContent).toBe('p1 of 1');
    });

    it('shows the notebook body for a notebook run from the jobs of the chat', () => {
        h.jobs = [job()];
        load({});
        mount('w1', { row: makeRun({ kind: 'notebook_run', id: 'w1', title: 'prep.py' }) });
        expect(screen.getByTestId('body-notebook').textContent).toBe('job w1');
        expect(screen.getByRole('heading', { name: 'prep.py' })).toBeTruthy();
    });

    it('goes back to the overview and opens the chat', () => {
        load({ searches: [makeSearch()], trials: trials() });
        mount('s1');
        fireEvent.click(screen.getByTestId('detail-back'));
        expect(onBack).toHaveBeenCalled();
        fireEvent.click(screen.getByTestId('detail-open-chat'));
        expect(onOpenChat).toHaveBeenCalledWith('c1');
        expect(screen.getByText('Train flowers classifier')).toBeTruthy();
    });

    it('offers all runs of the chat', () => {
        load({ searches: [makeSearch()], trials: trials() });
        mount('s1');
        fireEvent.click(screen.getByRole('button', { name: 'All runs of this chat' }));
        expect(onAllRuns).toHaveBeenCalledWith('c1');
    });

    it('links to the platform calls only when the run has a tool call', () => {
        load({ searches: [makeSearch({ tool_call_id: 'call-7' })], trials: trials() });
        mount('s1');
        fireEvent.click(screen.getByRole('button', { name: 'Platform calls in Activity' }));
        expect(screen.getByTestId('location').textContent).toBe('/ai-agent?tab=activity&chat=c1&call=call-7');
        cleanup();
        load({ searches: [makeSearch({ tool_call_id: undefined })], trials: trials() });
        mount('s1');
        expect(screen.queryByRole('button', { name: 'Platform calls in Activity' })).toBeNull();
    });

    it('offers JupyterHub only with an https address from the gateway', () => {
        h.jobs = [job({ link: 'https://hub.example/lab/tree/run1' })];
        load({});
        mount('w1');
        expect(screen.getByRole('link', { name: 'Open in JupyterHub' }).getAttribute('href')).toBe('https://hub.example/lab/tree/run1');
        cleanup();
        h.jobs = [job({ link: 'http://hub.example/x' })];
        mount('w1');
        expect(screen.queryByRole('link', { name: 'Open in JupyterHub' })).toBeNull();
    });

    it('offers "Plan step n · Show plan" only for a run a plan started and opens the plan dialog', async () => {
        load({ searches: [makeSearch()], trials: trials() });
        mount('s1');
        expect(screen.queryByText(/Show plan/)).toBeNull();
        cleanup();
        h.plans.mockResolvedValue([{ id: 'p1', chat_id: 'c1', title: 'Demo', state: 'approved', mode: 'interactive', created_at: '2026-10-26T10:00:00Z', steps: [] }]);
        mount('s1', { row: makeRun({ plan_id: 'p1', plan_step: 3 }) });
        fireEvent.click(screen.getByText('Plan step 3 · Show plan'));
        expect(h.plans).toHaveBeenCalledWith('c1');
        expect(await screen.findByTestId('plan-dialog-probe')).toBeTruthy();
        expect(screen.getByTestId('plan-dialog-probe').textContent).toBe('p1 of 1');
    });

    it('says the run was not found for an unknown id or a chat in the trash', () => {
        load({ searches: [], trials: [] });
        mount('s404');
        expect(screen.getByTestId('detail-not-found').textContent).toContain('This run was not found. It may belong to a chat in the trash.');
        fireEvent.click(screen.getByRole('button', { name: 'Back to overview' }));
        expect(onBack).toHaveBeenCalled();
        cleanup();
        mount('x1');
        expect(screen.getByTestId('detail-not-found')).toBeTruthy();
    });

    it('shows a placeholder while the book of the chat loads', () => {
        load({ loaded: false });
        mount('s1');
        expect(screen.getByTestId('detail-loading')).toBeTruthy();
        expect(screen.queryByTestId('detail-not-found')).toBeNull();
    });
});
