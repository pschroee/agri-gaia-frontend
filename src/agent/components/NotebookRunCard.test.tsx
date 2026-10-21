// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Smoke tests of the card of a run in the chat's notebook server (own code C-E4): the state word and its symbol per
// state, the facts, the log, the result files, the link to JupyterHub and the stop button. The rules behind it are
// checked in notebook.test.ts; here the card only has to put them together.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { WatchJob } from '../jobs';
import { LAUNCH_HINT } from '../notebook';
import type { NotebookApprovalData } from '../notebook';
import NotebookRunCard from './NotebookRunCard';

// the stop goes out over the gateway's route; the test only has to see that the card calls it
const { stopJob } = vi.hoisted(() => ({ stopJob: vi.fn(async () => ({})) }));
vi.mock('../api', () => ({ agentApi: { stopJob } }));

afterEach(cleanup);
beforeEach(() => stopJob.mockClear());

const data = (over: Partial<NotebookApprovalData> = {}): NotebookApprovalData => ({
    entry: 'train.py',
    files: [{ name: 'train.py', size: 1740, sha256: 'b'.repeat(64), text: 'print("epoch 1")\n' }],
    datasets: [{ id: 1, name: 'mnist-mini' }],
    limits: { cpus: 2, mem_gb: 8, timeout_min: 120, internet: false },
    ...over,
});

const tail = ['Loading datasets/mnist-mini …', 'found 2,000 images in 10 classes', 'epoch 1/8  loss 0.9137', 'epoch 2/8  loss 0.4920'].join(
    '\n',
);

const job = (over: Partial<WatchJob> = {}): WatchJob => ({
    id: 'w1',
    chat_id: 'c1',
    kind: 'notebook_run',
    tool_call_id: 't1',
    ref: 'r1',
    state: 'running',
    started_at: '2026-10-16T14:05:00.000Z',
    log_tail: tail,
    ...over,
});

const finished = (over: Partial<WatchJob> = {}): WatchJob =>
    job({
        state: 'done',
        message: 'exit 0 after 12 min 8 s',
        ended_at: '2026-10-16T14:17:08.000Z',
        ...over,
    });

describe('the state of a run', () => {
    it('shows a spinner and "Running" while it goes, with the time that passed', () => {
        render(<NotebookRunCard job={job()} layout="panel" data={data()} />);
        expect(screen.getByRole('status').textContent).toBe('Running');
        expect(screen.getByText('train.py')).toBeTruthy();
        expect(screen.getByTestId('agent-notebook-run').getAttribute('aria-label')).toBe('Notebook run train.py: Running');
    });

    it('shows "Finished" with its duration, the exit code and the start', () => {
        render(<NotebookRunCard job={finished()} layout="page" data={data()} />);
        expect(screen.getByRole('status').textContent).toBe('Finished');
        // the head and the facts grid both carry the duration of an ended run
        expect(screen.getAllByText('12 min 08 s').length).toBeGreaterThan(0);
        expect(screen.getByText('Exit code')).toBeTruthy();
        expect(screen.getByText('0')).toBeTruthy();
        expect(screen.getByText('14:05')).toBeTruthy();
    });

    it('shows "Failed" with the last lines of the log and the exit code', () => {
        render(
            <NotebookRunCard
                job={job({ state: 'failed', message: 'exit 1 after 41 s', ended_at: '2026-10-16T14:05:41.000Z' })}
                layout="panel"
                data={data()}
            />,
        );
        expect(screen.getByRole('status').textContent).toBe('Failed');
        expect(screen.getByText('Last log lines')).toBeTruthy();
        expect(screen.getByText(/exit 1/)).toBeTruthy();
    });

    it('shows "Timed out" with the limit of the run', () => {
        render(<NotebookRunCard job={job({ state: 'failed', message: 'exit 124 after 2 h 0 min' })} layout="page" data={data()} />);
        expect(screen.getByRole('status').textContent).toBe('Timed out');
        expect(screen.getByText('Stopped at the 120 min time limit.')).toBeTruthy();
    });

    it('shows a run the stop ended as "Stopped"', () => {
        render(
            <NotebookRunCard
                job={job({
                    state: 'failed',
                    message:
                        'the run ended without an exit code: the notebook server of this chat was stopped while it went',
                    ended_at: '2026-10-16T14:07:15.000Z',
                })}
                layout="panel"
                data={data()}
            />,
        );
        expect(screen.getByRole('status').textContent).toBe('Stopped');
        expect(screen.getByTestId('agent-notebook-run').getAttribute('data-state')).toBe('stopped');
    });

    it('names who stopped the run when the job says so (gap L14, gateway issue #92)', () => {
        const stopJob = (stopped_by: 'user' | 'agent' | undefined) =>
            job({
                state: 'failed',
                message: 'stopped while it went',
                ended_at: '2026-10-16T14:07:15.000Z',
                stopped_by,
            });
        const { unmount } = render(<NotebookRunCard job={stopJob('user')} layout="panel" data={data()} />);
        expect(screen.getByTestId('agent-notebook-run-facts').textContent).toContain('stopped by you');
        unmount();

        const { unmount: unmount2 } = render(<NotebookRunCard job={stopJob('agent')} layout="page" data={data()} />);
        expect(screen.getByText('Stopped by')).toBeTruthy();
        expect(screen.getByText('the agent')).toBeTruthy();
        unmount2();

        render(<NotebookRunCard job={stopJob(undefined)} layout="panel" data={data()} />);
        expect(screen.getByTestId('agent-notebook-run-facts').textContent).not.toContain('stopped by');
    });

    it('names the state in a word, never by the colour alone', () => {
        const words = new Set<string>();
        for (const j of [job(), finished(), job({ state: 'failed', message: 'exit 1' })]) {
            const { unmount } = render(<NotebookRunCard job={j} layout="panel" data={data()} />);
            words.add(screen.getByRole('status').textContent ?? '');
            unmount();
        }
        expect([...words].sort()).toEqual(['Failed', 'Finished', 'Running']);
    });
});

describe('the log of a run', () => {
    it('shows the last three lines and opens the whole tail on "Show log"', () => {
        render(<NotebookRunCard job={job()} layout="panel" data={data()} />);
        expect(screen.getByText('Last 3 log lines')).toBeTruthy();
        expect(screen.getByLabelText('Last 3 log lines').textContent).toBe(
            'found 2,000 images in 10 classes\nepoch 1/8  loss 0.9137\nepoch 2/8  loss 0.4920',
        );

        fireEvent.click(screen.getByRole('button', { name: /Show log/ }));
        expect(screen.getByText('Log · last 4 lines')).toBeTruthy();
        expect(screen.getByLabelText('Log · last 4 lines').textContent).toContain('Loading datasets/mnist-mini …');
        // the expanded log replaces the short one (gap L15)
        expect(screen.queryByText('Last 3 log lines')).toBeNull();
        expect(screen.getByRole('button', { name: /Hide log/ })).toBeTruthy();
    });

    it('sets the log as plain text', () => {
        const marked = '<b>bold</b>\n<script>alert(1)</script>';
        const { container } = render(<NotebookRunCard job={job({ log_tail: marked })} layout="panel" data={data()} />);
        expect(container.querySelector('script')).toBeNull();
        expect(container.querySelector('b')).toBeNull();
        expect(screen.getByText(/<b>bold<\/b>/)).toBeTruthy();
    });

    it('offers no Show log while the server still starts', () => {
        render(<NotebookRunCard job={job({ state: 'starting', started_at: undefined })} layout="panel" data={data()} />);
        expect(screen.getByRole('status').textContent).toBe('Starting notebook server');
        expect(screen.queryByRole('button', { name: /Show log/ })).toBeNull();
        expect(screen.getByText('train.py starts as soon as the server is ready.')).toBeTruthy();
        expect(screen.getByLabelText('Starting notebook server')).toBeTruthy();
    });
});

describe('the result files', () => {
    it('shows the size of each result file the job reports (gateway issue #92)', () => {
        render(
            <NotebookRunCard
                job={finished({
                    outputs: [
                        { resource: 'notebook_file', id: 'r1/outputs/model.onnx', label: 'outputs/model.onnx', size: 16357785 },
                        { resource: 'notebook_file', id: 'r1/outputs/metrics.json', label: 'outputs/metrics.json', size: 1126 },
                        { resource: 'notebook_file', id: 'r1/outputs/checkpoint.pt', label: 'outputs/checkpoint.pt', size: 0 },
                        // the gateway lists the whole run directory: the entry and the markers are no results (gap L12)
                        { resource: 'notebook_file', id: 'r1/helper.py', label: 'helper.py', size: 900 },
                        { resource: 'notebook_file', id: 'r1/.agw/run.sh', label: '.agw/run.sh', size: 279 },
                    ],
                })}
                layout="page"
                data={data()}
            />,
        );
        expect(screen.getByText('15.6 MB')).toBeTruthy();
        expect(screen.getByText('1.1 KB')).toBeTruthy();
        expect(screen.queryByText('helper.py')).toBeNull();
        expect(screen.queryByText('.agw/run.sh')).toBeNull();
        // a size of 0 means the kind does not know one: the card then shows none instead of "0 B"
        expect(screen.queryByText('0 B')).toBeNull();
    });

    it('lists what the run left in outputs/, or says that nothing is there', () => {
        const { unmount } = render(
            <NotebookRunCard
                job={finished({
                    outputs: [
                        { resource: 'notebook_file', id: 'r1/outputs/model.onnx', label: 'outputs/model.onnx' },
                        { resource: 'notebook_file', id: 'r1/outputs/metrics.json', label: 'outputs/metrics.json' },
                    ],
                })}
                layout="page"
                data={data()}
            />,
        );
        expect(screen.getByText('Result files in outputs/')).toBeTruthy();
        expect(screen.getByText('model.onnx')).toBeTruthy();
        expect(screen.getByText('metrics.json')).toBeTruthy();
        unmount();

        render(<NotebookRunCard job={finished()} layout="panel" data={data()} />);
        expect(screen.getByText('No files in outputs/.')).toBeTruthy();
    });
});

describe('the link and the stop button', () => {
    it('opens JupyterHub in a new tab and builds no address of its own', () => {
        const { unmount } = render(
            <NotebookRunCard job={job({ link: 'https://jupyter.example.org/user/agent-test/lab/tree/runs/r1' })} layout="panel" data={data()} />,
        );
        const link = screen.getByRole('link', { name: 'Open in JupyterHub (opens in a new tab)' });
        expect(link.getAttribute('href')).toBe('https://jupyter.example.org/user/agent-test/lab/tree/runs/r1');
        expect(link.getAttribute('target')).toBe('_blank');
        expect(link.getAttribute('rel')).toBe('noopener noreferrer');
        unmount();

        // without a link from the gateway the card offers none (gap L16)
        render(<NotebookRunCard job={job()} layout="panel" data={data()} />);
        expect(screen.queryByRole('link')).toBeNull();
    });

    it('says at the link of an ended run that JupyterHub restarts a stopped server, and not while it runs', async () => {
        const link = 'https://jupyter.example.org/user/agent-test/lab/tree/runs/r1';
        const { unmount } = render(<NotebookRunCard job={finished({ link })} layout="panel" data={data()} />);
        fireEvent.mouseOver(screen.getByRole('link', { name: 'Open in JupyterHub (opens in a new tab)' }));
        expect(await screen.findByText(LAUNCH_HINT)).toBeTruthy();
        unmount();

        render(<NotebookRunCard job={job({ link })} layout="panel" data={data()} />);
        fireEvent.mouseOver(screen.getByRole('link', { name: 'Open in JupyterHub (opens in a new tab)' }));
        await waitFor(() => expect(screen.queryByText(LAUNCH_HINT)).toBeNull());
    });

    it('offers Stop run while the run goes and calls the gateway route', async () => {
        render(<NotebookRunCard job={job()} layout="panel" data={data()} />);
        const stop = screen.getByRole('button', { name: 'Stop run' });
        fireEvent.click(stop);
        await screen.findByTestId('agent-notebook-run');
        expect(stopJob).toHaveBeenCalledWith('c1', 'w1');
    });

    it('offers no Stop run once the run has ended', () => {
        for (const j of [finished(), job({ state: 'failed', message: 'exit 1' })]) {
            const { unmount } = render(<NotebookRunCard job={j} layout="panel" data={data()} />);
            expect(screen.queryByRole('button', { name: 'Stop run' })).toBeNull();
            unmount();
        }
    });

    it('reports a refused stop and keeps the card usable', async () => {
        stopJob.mockRejectedValueOnce(new Error('409 the job is not running'));
        render(<NotebookRunCard job={job()} layout="panel" data={data()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Stop run' }));
        expect(await screen.findByRole('alert')).toBeTruthy();
        expect(screen.getByRole('alert').textContent).toContain('409 the job is not running');
        expect((screen.getByRole('button', { name: 'Stop run' }) as HTMLButtonElement).disabled).toBe(false);
    });
});

describe('the facts in the panel', () => {
    it('are one caption line with the exit code, the duration and the start', () => {
        render(<NotebookRunCard job={finished()} layout="panel" data={data()} />);
        expect(screen.getByTestId('agent-notebook-run-facts').textContent).toBe('exit 0 · 12 min 08 s · started 14:05');
    });

    it('are a grid on the page', () => {
        render(<NotebookRunCard job={job()} layout="page" data={data()} />);
        const facts = screen.getByTestId('agent-notebook-run-facts');
        expect(facts.textContent).toContain('Started');
        expect(facts.textContent).toContain('Time limit');
        expect(facts.textContent).toContain('120 min');
        expect(facts.textContent).toContain('mnist-mini');
    });
});
