// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Smoke tests of the approval "Start a training search" and of the question about changed code (gateway issue #168):
// the terms the user hands over, both ways, the decided line, and the diff of the code change. Run in phase B.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { mockCodeChange, mockProposal } from '../../searchMock';
import type { Approval } from '../../types';
import CodeChangeApproval from './CodeChangeApproval';
import SearchApproval from './SearchApproval';

afterEach(cleanup);

const approval = (over: Partial<Approval> = {}): Approval =>
    ({
        id: 'a1',
        chat_id: 'c1',
        kind: 'search',
        via: 'cli',
        name: 'Training search',
        size: 1,
        sha256: '',
        content_type: 'application/json',
        state: 'pending',
        created_at: '2026-10-20T09:00:00.000Z',
        summary: 'Training search "tf-flowers"',
        effect: 'compute',
        ...over,
    }) as Approval;

describe('the proposal', () => {
    it('shows goal, space, budget, way, test set and autonomy', () => {
        render(<SearchApproval approval={approval()} data={mockProposal()} layout="page" />);
        expect(screen.getByRole('heading', { name: 'Start a training search' })).toBeTruthy();
        expect(screen.getByText('Compute')).toBeTruthy();
        expect(screen.getByText('Validation accuracy · higher is better')).toBeTruthy();
        expect(screen.getByRole('table', { name: 'Search space' })).toBeTruthy();
        expect(screen.getByText('learning_rate')).toBeTruthy();
        expect(screen.getByText('1e-4 … 1e-2')).toBeTruthy();
        expect(screen.getByText('range · log')).toBeTruthy();
        expect(screen.getByText('16 · 32 · 64')).toBeTruthy();
        expect(screen.getByText(/5 compute calls left in this chat after the search/)).toBeTruthy();
        expect(screen.getByText('The first limit reached ends the search.')).toBeTruthy();
        expect(screen.getByText('Platform template')).toBeTruthy();
        expect(screen.getByText('#63 · Torchvision · EfficientNet')).toBeTruthy();
        expect(screen.getByText('tf-flowers-mini-train (#59) · 5 classes · 450 images')).toBeTruthy();
        expect(screen.getByText(/Held-back test set: 92 images of tf-flowers-mini \(#58\)/)).toBeTruthy();
        expect(screen.getByText(/at most 21 turns without you/)).toBeTruthy();
        expect(screen.getByText("Agent's note – not verified")).toBeTruthy();
    });

    it('says "not set" for a limit that is not set and "No held-back test set" without one', () => {
        render(<SearchApproval approval={approval()} data={mockProposal({ holdout: { available: false } })} layout="panel" />);
        expect(screen.getByText('No held-back test set — the final test is skipped.')).toBeTruthy();
        expect(screen.getAllByText('not set').length).toBeGreaterThan(0);
    });

    it('counts down to the expiry of the approval', () => {
        render(<SearchApproval approval={approval()} data={mockProposal({ expires_at: new Date(Date.now() + 9 * 60_000 - 1000).toISOString() })} layout="page" />);
        expect(screen.getByText('Waiting for you · 9 min left')).toBeTruthy();
    });

    it('calls the decision', async () => {
        const onApprove = vi.fn().mockResolvedValue(undefined);
        const onReject = vi.fn().mockResolvedValue(undefined);
        render(<SearchApproval approval={approval()} data={mockProposal()} layout="page" onApprove={onApprove} onReject={onReject} />);
        // Both buttons are disabled while a decision is sent, so the second click comes after the first settled.
        fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
        expect(onApprove).toHaveBeenCalledTimes(1);
        await waitFor(() => expect((screen.getByRole('button', { name: 'Reject' }) as HTMLButtonElement).disabled).toBe(false));
        fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
        expect(onReject).toHaveBeenCalledTimes(1);
    });

    it('shows the own code with the files, the params.json line and the expand button', () => {
        const code = {
            entry: 'train.py',
            files: [
                { name: 'train.py', size: 3100, sha256: 'a'.repeat(64), text: 'print("x")\n' },
                { name: 'params.json', size: 300, sha256: 'b'.repeat(64), text: '{}' },
            ],
            datasets: [{ id: 59, name: 'tf-flowers-mini-train' }],
            limits: { cpus: 4, mem_gb: 16, timeout_min: 45, internet: false, gpu: true },
        };
        render(<SearchApproval approval={approval()} data={mockProposal({ path: 'notebook', base: undefined, code })} layout="page" />);
        expect(screen.getByText('Own code in your notebook server')).toBeTruthy();
        expect(screen.getByText('params.json · written per trial')).toBeTruthy();
        expect(screen.queryByRole('tab', { name: /params\.json/ })).toBeNull();
        expect(screen.getByRole('button', { name: /Expand code/ })).toBeTruthy();
        expect(screen.getByText(/any code change asks you again/)).toBeTruthy();
    });
});

describe('the decided proposal', () => {
    it('is one line that opens to the terms', () => {
        render(<SearchApproval approval={approval({ state: 'approved', decided_at: '2026-10-20T09:12:00.000Z' })} data={mockProposal()} layout="panel" />);
        expect(screen.getByText('Approved')).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
        expect(screen.queryByRole('table', { name: 'Search space' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: /Show details/ }));
        expect(screen.getByRole('table', { name: 'Search space' })).toBeTruthy();
    });

    it('says rejected and expired', () => {
        render(<SearchApproval approval={approval({ state: 'rejected' })} data={mockProposal()} layout="panel" />);
        expect(screen.getByText('Rejected')).toBeTruthy();
        cleanup();
        render(<SearchApproval approval={approval({ state: 'expired' })} data={mockProposal()} layout="panel" />);
        expect(screen.getByText('Expired')).toBeTruthy();
    });
});

describe('the code change', () => {
    it('shows the versions, the files and the diff with signs', () => {
        render(<CodeChangeApproval approval={approval({ kind: 'platform_write' })} data={mockCodeChange()} />);
        expect(screen.getByRole('heading', { name: "Code changed in training search 'tf-flowers'" })).toBeTruthy();
        expect(screen.getByText('Version 1 → 2 · train.py changed · applies to trial 6 and later')).toBeTruthy();
        expect(screen.getByText('changed')).toBeTruthy();
        expect(screen.getByText('unchanged')).toBeTruthy();
        expect(screen.getByText('per trial')).toBeTruthy();
        expect(screen.getByRole('region', { name: 'Changes in train.py' })).toBeTruthy();
        expect(screen.getByText('old line')).toBeTruthy();
        expect(screen.getAllByLabelText('added', { selector: 'span' }).length).toBeGreaterThan(0);
        expect(screen.getByText('Approving makes version 2 the code of the following trials. Trials 1–5 keep version 1.')).toBeTruthy();
    });

    it('shows the whole new file when the diff is too long', () => {
        const c = mockCodeChange();
        c.files[0] = { ...c.files[0], diff: undefined, diff_too_long: true, new_text: 'whole new file' };
        render(<CodeChangeApproval approval={approval({ kind: 'platform_write' })} data={c} />);
        expect(screen.getByText(/diff too long/)).toBeTruthy();
        expect(screen.getByText('whole new file')).toBeTruthy();
    });

    it('is one line once decided', () => {
        render(<CodeChangeApproval approval={approval({ kind: 'platform_write', state: 'approved' })} data={mockCodeChange()} />);
        expect(screen.getByText(/version 2 for trial 6 and later/)).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    });
});
