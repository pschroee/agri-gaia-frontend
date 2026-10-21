// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Smoke tests of the approval of a run in the chat's notebook server (own code C-E4): the title with the effect chip,
// the datasets, the files as tabs (the entry file first), the code as plain text, the decision buttons, the expand
// dialog and the collapsed line of a decided approval. The rules behind it are checked in notebook.test.ts; here the
// card only has to put them together.

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { NotebookApprovalData } from '../notebook';
import type { Approval } from '../types';
import NotebookRunApproval from './NotebookRunApproval';

afterEach(cleanup);

const approval = (over: Partial<Approval> = {}): Approval =>
    ({
        id: 'a1',
        chat_id: 'c1',
        kind: 'platform_write',
        via: 'cli',
        name: 'POST /_agw/notebook/runs',
        size: 12,
        sha256: '',
        content_type: 'application/json',
        state: 'pending',
        created_at: '2026-10-16T14:58:00.000Z',
        summary: 'Run train.py in your notebook server (no internet, no platform access, at most 120 min)',
        effect: 'compute',
        ...over,
    } as Approval);

const data = (over: Partial<NotebookApprovalData> = {}): NotebookApprovalData => ({
    entry: 'train.py',
    files: [
        { name: 'utils.py', size: 900, sha256: 'a'.repeat(64), text: 'def load(name):\n    return name\n' },
        { name: 'train.py', size: 1740, sha256: 'b'.repeat(64), text: 'print("epoch 1")\n' },
    ],
    datasets: [{ id: 1, name: 'mnist-mini' }],
    limits: { cpus: 2, mem_gb: 8, timeout_min: 120, internet: false },
    ...over,
});

const NOTE = 'Trains an EfficientNet-B0 image classifier on mnist-mini for 8 epochs.';

describe('the pending approval', () => {
    it('shows the title, the effect chip, the note and the datasets', () => {
        render(<NotebookRunApproval approval={approval()} data={data()} layout="panel" />);
        expect(screen.getByRole('heading', { name: 'Run train.py in your notebook server' })).toBeTruthy();
        expect(screen.getByText('Compute')).toBeTruthy();
        expect(screen.getByText('Approval for every run')).toBeTruthy();
        expect(screen.getByText('mnist-mini · id 1')).toBeTruthy();
        expect(screen.getByText('2 CPUs · 8 GB · no internet · max 120 min')).toBeTruthy();
        expect(screen.getByText('Datasets')).toBeTruthy();
        expect(screen.getByText('Limits')).toBeTruthy();
    });

    it('shows the agent note in a block of its own, marked as not verified (gateway issue #92)', () => {
        render(<NotebookRunApproval approval={approval()} data={data({ note: NOTE })} layout="panel" />);
        const block = screen.getByTestId('agent-notebook-approval-note');
        expect(block.textContent).toContain("Agent's note – not verified");
        expect(block.textContent).toContain(NOTE);
    });

    it('shows no note block while the agent wrote none', () => {
        render(<NotebookRunApproval approval={approval()} data={data()} layout="panel" />);
        expect(screen.queryByTestId('agent-notebook-approval-note')).toBeNull();
    });

    it('sets the agent note as plain text, never as markup', () => {
        const { container } = render(
            <NotebookRunApproval approval={approval()} data={data({ note: '<b>bold</b>' })} layout="panel" />,
        );
        expect(container.querySelector('b')).toBeNull();
        expect(screen.getByText('<b>bold</b>')).toBeTruthy();
    });

    it('lists the files as tabs with the entry file first and marked', () => {
        render(<NotebookRunApproval approval={approval()} data={data()} layout="panel" />);
        expect(screen.getAllByRole('tab').map((t) => t.getAttribute('aria-label'))).toEqual([
            'train.py, entry file',
            'utils.py',
        ]);
    });

    it('says that a notebook entry runs as a notebook and keeps its outputs (gateway issue #193)', () => {
        const nb = data({
            entry: 'train.ipynb',
            files: [{ name: 'train.ipynb', size: 1200, sha256: 'c'.repeat(64), text: '{"cells":[]}' }],
        });
        render(<NotebookRunApproval approval={approval()} data={nb} layout="panel" />);
        expect(screen.getByTestId('agent-notebook-approval').textContent).toContain(
            'Entry file · runs as a notebook; outputs are saved · ',
        );
    });

    it('does not say that for a script entry', () => {
        render(<NotebookRunApproval approval={approval()} data={data()} layout="panel" />);
        expect(screen.getByTestId('agent-notebook-approval').textContent).not.toContain('runs as a notebook');
    });

    it('shows the code of the chosen file with line numbers and the meta line of the file', () => {
        render(<NotebookRunApproval approval={approval()} data={data()} layout="panel" />);
        expect(screen.getByText('1')).toBeTruthy();
        expect(screen.getByText('print("epoch 1")')).toBeTruthy();
        expect(screen.getByTestId('agent-notebook-approval').textContent).toContain('Entry file');
        // the short SHA-256 as the design writes it: the first eight and the last four characters (notebook.ts)
        expect(screen.getByTestId('agent-notebook-approval').textContent).toContain('SHA-256 bbbbbbbb…bbbb');
        expect(screen.getByLabelText(/train\.py, 1 lines, read-only/)).toBeTruthy();
    });

    it('switches to another file on a click on its tab', () => {
        render(<NotebookRunApproval approval={approval()} data={data()} layout="panel" />);
        fireEvent.click(screen.getByRole('tab', { name: 'utils.py' }));
        expect(screen.getByText('def load(name):')).toBeTruthy();
        expect(screen.getByText('return name')).toBeTruthy();
    });

    it('shows a notebook as its code cells with a separator per cell', () => {
        const nb = data({
            entry: 'analysis.ipynb',
            files: [
                {
                    name: 'analysis.ipynb',
                    size: 6400,
                    sha256: 'c'.repeat(64),
                    text: JSON.stringify({
                        cells: [
                            { cell_type: 'markdown', source: '# Counting' },
                            { cell_type: 'code', source: 'import pandas\n' },
                            { cell_type: 'code', source: 'len(files)' },
                        ],
                    }),
                },
            ],
        });
        render(<NotebookRunApproval approval={approval()} data={nb} layout="page" />);
        expect(screen.getByText('cell 1')).toBeTruthy();
        expect(screen.getByText('cell 2')).toBeTruthy();
        expect(screen.queryByText('cell 3')).toBeNull();
        expect(screen.getByText('import pandas')).toBeTruthy();
    });

    it('sets the code as text, never as markup or a link', () => {
        const evil = data({
            files: [
                {
                    name: 'train.py',
                    size: 30,
                    sha256: 'd'.repeat(64),
                    text: '<script>alert(1)</script>\n[link](https://example.org)',
                },
            ],
        });
        const { container } = render(<NotebookRunApproval approval={approval()} data={evil} layout="panel" />);
        expect(container.querySelector('script')).toBeNull();
        expect(container.querySelector('a[href="https://example.org"]')).toBeNull();
        expect(screen.getByText('<script>alert(1)</script>')).toBeTruthy();
    });

    it('says so when a file has no preview, and then offers no copy button', () => {
        const binary = data({
            entry: 'class_weights.pt',
            files: [{ name: 'class_weights.pt', size: 3100, sha256: 'e'.repeat(64) }],
        });
        render(<NotebookRunApproval approval={approval()} data={binary} layout="panel" />);
        expect(screen.getByText('No preview for this file type.')).toBeTruthy();
        expect(screen.queryByLabelText('Copy class_weights.pt')).toBeNull();
    });

    it('says "none" when the run gets no dataset', () => {
        render(<NotebookRunApproval approval={approval()} data={data({ datasets: [] })} layout="panel" />);
        expect(screen.getByText('none')).toBeTruthy();
    });

    it('keeps the technical details collapsed, as before', () => {
        render(<NotebookRunApproval approval={approval()} data={data()} layout="panel" />);
        expect(screen.getByTestId('agent-approval-technical')).toBeTruthy();
        expect(screen.getByText('Technical details')).toBeTruthy();
    });

    it('approves and rejects through the callbacks', async () => {
        const onApprove = vi.fn(async () => undefined);
        const onReject = vi.fn(async () => undefined);
        render(
            <NotebookRunApproval approval={approval()} data={data()} layout="panel" onApprove={onApprove} onReject={onReject} />,
        );
        fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
        await screen.findByTestId('agent-notebook-approval');
        expect(onApprove).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
        await screen.findByTestId('agent-notebook-approval');
        expect(onReject).toHaveBeenCalledTimes(1);
    });

    it('locks both buttons while a decision runs', async () => {
        let release: () => void = () => undefined;
        const onApprove = vi.fn(() => new Promise<void>((r) => (release = () => r())));
        render(<NotebookRunApproval approval={approval()} data={data()} layout="panel" onApprove={onApprove} />);
        fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
        expect((screen.getByRole('button', { name: 'Approve' }) as HTMLButtonElement).disabled).toBe(true);
        expect((screen.getByRole('button', { name: 'Reject' }) as HTMLButtonElement).disabled).toBe(true);
        release();
        await screen.findByTestId('agent-notebook-approval');
    });
});

describe('the footer', () => {
    it('offers Expand as an icon button in the panel and as a text button on the page', () => {
        render(<NotebookRunApproval approval={approval()} data={data()} layout="panel" />);
        const icon = screen.getByRole('button', { name: 'Expand' });
        expect(icon.textContent).toBe('');
        cleanup();
        render(<NotebookRunApproval approval={approval()} data={data()} layout="page" />);
        expect(screen.getByRole('button', { name: 'Expand' }).textContent).toContain('Expand');
    });

    it('orders Technical details, Expand, Reject, Approve', () => {
        render(<NotebookRunApproval approval={approval()} data={data()} layout="page" />);
        const footer = screen.getByTestId('agent-approval-footer');
        expect(within(footer).getAllByRole('button').map((b) => b.textContent?.trim())).toEqual(['Expand', 'Reject', 'Approve']);
    });
});

describe('the expand dialog', () => {
    it('opens on Expand, shows the code without a limit and decides from its footer', async () => {
        const onApprove = vi.fn(async () => undefined);
        render(<NotebookRunApproval approval={approval()} data={data()} layout="panel" onApprove={onApprove} />);
        fireEvent.click(screen.getByRole('button', { name: 'Expand' }));
        const dialog = await screen.findByRole('dialog');
        expect(dialog.textContent).toContain('Run train.py in your notebook server');
        // the card's own buttons are behind the dialog: the footer holds the decision
        fireEvent.click(within(dialog).getByRole('button', { name: 'Approve' }));
        await screen.findByTestId('agent-notebook-approval');
        expect(onApprove).toHaveBeenCalledTimes(1);
    });

    it('shows the agent note and no technical details (gaps L2/L6)', async () => {
        render(<NotebookRunApproval approval={approval()} data={data({ note: NOTE })} layout="panel" />);
        fireEvent.click(screen.getByRole('button', { name: 'Expand' }));
        const dialog = await screen.findByRole('dialog');
        expect(within(dialog).getByTestId('agent-notebook-approval-note').textContent).toContain(NOTE);
        expect(within(dialog).queryByTestId('agent-approval-technical')).toBeNull();
    });

    it('closes on Escape without deciding anything', async () => {
        const onApprove = vi.fn(async () => undefined);
        const onReject = vi.fn(async () => undefined);
        render(
            <NotebookRunApproval approval={approval()} data={data()} layout="panel" onApprove={onApprove} onReject={onReject} />,
        );
        fireEvent.click(screen.getByRole('button', { name: 'Expand' }));
        const dialog = await screen.findByRole('dialog');
        fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' });
        // the dialog leaves with MUI's transition, so it is gone a tick later, not on the spot
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(onApprove).not.toHaveBeenCalled();
        expect(onReject).not.toHaveBeenCalled();
    });

    it('closes on the Close button without deciding anything', async () => {
        const onApprove = vi.fn(async () => undefined);
        render(<NotebookRunApproval approval={approval()} data={data()} layout="panel" onApprove={onApprove} />);
        fireEvent.click(screen.getByRole('button', { name: 'Expand' }));
        await screen.findByRole('dialog');
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(onApprove).not.toHaveBeenCalled();
    });
});

describe('a decided approval', () => {
    it('is one line without buttons and without the code, and opens again without them', () => {
        render(
            <NotebookRunApproval
                approval={approval({ state: 'approved', decided_at: '2026-10-16T14:58:00.000Z' })}
                data={data()}
                layout="panel"
                onApprove={vi.fn(async () => undefined)}
                onReject={vi.fn(async () => undefined)}
            />,
        );
        expect(screen.getByText('Approved')).toBeTruthy();
        expect(screen.getByText(/Run train\.py in your notebook server/)).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull();
        expect(screen.queryByText('print("epoch 1")')).toBeNull();

        // the row of the decision is the button; the group around it carries the same label
        fireEvent.click(screen.getByRole('button', { name: /^Approved: Run train\.py/ }));
        expect(screen.getByText('print("epoch 1")')).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    });

    it('shows the agent note again in the opened decision (gap L2)', () => {
        render(
            <NotebookRunApproval
                approval={approval({ state: 'approved', decided_at: '2026-10-16T14:58:00.000Z' })}
                data={data({ note: NOTE })}
                layout="panel"
            />,
        );
        expect(screen.queryByTestId('agent-notebook-approval-note')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: /^Approved: Run train\.py/ }));
        expect(screen.getByTestId('agent-notebook-approval-note').textContent).toContain(NOTE);
    });

    it('says that a rejected run did not run, and that an expired one was not decided in time', () => {
        const { unmount } = render(
            <NotebookRunApproval approval={approval({ state: 'rejected' })} data={data()} layout="panel" />,
        );
        expect(screen.getByText(/Run train\.py in your notebook server · not run/)).toBeTruthy();
        unmount();

        render(<NotebookRunApproval approval={approval({ state: 'expired' })} data={data()} layout="page" />);
        expect(screen.getByText('Expired')).toBeTruthy();
        expect(screen.getByText(/no decision within the time limit, not run/)).toBeTruthy();
    });
});

describe('the decided line sits flush with the tool groups (issue #192)', () => {
    it('has no side margin', () => {
        render(<NotebookRunApproval approval={approval({ state: 'approved' })} data={data()} layout="panel" />);
        const box = screen.getByTestId('agent-notebook-approval');
        const style = getComputedStyle(box);
        expect(['', '0', '0px']).toContain(style.marginLeft);
        expect(['', '0', '0px']).toContain(style.marginRight);
    });
});
