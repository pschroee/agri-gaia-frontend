// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Every pending approval kind except plans ends in the shared footer, and the group carries the amber left mark
// (issue #190). Run in phase B.

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { mockCodeChange, mockProposal } from '../searchMock';
import type { Approval } from '../types';
import ApprovalCard from './ApprovalCard';

afterEach(cleanup);

const onDecide = () => Promise.resolve();

const base = (over: Partial<Approval>): Approval =>
    ({
        id: 'a1',
        chat_id: 'c1',
        kind: 'platform_write',
        via: 'cli',
        name: 'PATCH /datasets/7',
        size: 12,
        sha256: '',
        content_type: 'application/json',
        state: 'pending',
        created_at: '2026-10-21T14:00:00.000Z',
        ...over,
    }) as Approval;

const internet = (kind: string) => ({
    grant_id: 0,
    kind,
    domains: kind === 'full' ? [] : ['download.tensorflow.org'],
    packages: [],
    minutes: 30,
    megabytes: 500,
    ends_when_installed: false,
    by: 'agent',
});

const CASES: [string, Approval][] = [
    ['platform call', base({ summary: 'Rename dataset 7 to "flowers"', effect: 'write' })],
    ['irreversible platform call', base({ name: 'DELETE /datasets/7', summary: 'Delete dataset 7', effect: 'irreversible' })],
    ['artifact', base({ kind: 'artifact_upload', name: 'plot.csv', content_type: 'text/csv', preview: 'a,b\n1,2' })],
    ['search', base({ kind: 'search', name: 'search', summary: 'Training search', search: mockProposal() })],
    ['code change', base({ kind: 'search', name: 'search', summary: 'Code changed', search: mockCodeChange() })],
    [
        'notebook run',
        base({
            name: 'POST /_agw/notebook/runs',
            summary: 'Run train.py',
            notebook: {
                entry: 'train.py',
                files: [{ name: 'train.py', size: 10, sha256: 'b'.repeat(64), text: 'print(1)\n' }],
                datasets: [],
                limits: { cpus: 2, mem_gb: 8, timeout_min: 120, internet: false },
            },
        } as Partial<Approval>),
    ],
    ['internet sites', base({ kind: 'internet_access', name: 'Fetch', internet: internet('domains') } as Partial<Approval>)],
    ['internet full', base({ kind: 'internet_access', name: 'Fetch', internet: internet('full') } as Partial<Approval>)],
    ['legacy internet', base({ kind: 'internet_access', name: 'Fetch' })],
];

describe('the footer in every pending approval card', () => {
    it.each(CASES)('%s: exactly one footer with Approve (or Allow) as its last button', (_name, approval) => {
        render(<ApprovalCard approvals={[approval]} onDecide={onDecide} />);
        const footers = screen.getAllByTestId('agent-approval-footer');
        expect(footers).toHaveLength(1);
        const buttons = within(footers[0]).getAllByRole('button');
        expect(buttons.length).toBeGreaterThanOrEqual(2);
        const last = buttons[buttons.length - 1];
        expect(/^(approve|allow)/i.test(last.textContent ?? '')).toBe(true);
        expect(within(footers[0]).getByRole('button', { name: 'Reject' })).toBeTruthy();
    });

    it('keeps the amber left mark on the group "Waiting for your approval"', () => {
        render(<ApprovalCard approvals={[base({ summary: 'Rename dataset 7' })]} onDecide={onDecide} />);
        const group = screen.getByText('Waiting for your approval').parentElement?.parentElement as HTMLElement;
        expect(getComputedStyle(group).borderLeftWidth).toBe('3px');
    });

    it('shows the details of an irreversible call open and before the buttons', () => {
        render(<ApprovalCard approvals={[CASES[1][1]]} onDecide={onDecide} />);
        const technical = screen.getByTestId('agent-approval-technical') as HTMLDetailsElement;
        expect(technical.open).toBe(true);
        const buttons = screen.getByTestId('agent-approval-buttons');
        expect(technical.compareDocumentPosition(buttons) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
});
