// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Smoke tests of the internet approval card (gateway issue #175): title and chip per kind, the lists, the fold after
// five packages, the full-access warning, the buttons and the decided line.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { InternetApproval as Data, InternetGrant } from '../../internet';
import type { Approval } from '../../types';
import InternetApproval, { agentNote, InternetDecided, InternetDecidedRows } from './InternetApproval';

afterEach(cleanup);

const data = (over: Partial<Data> = {}): Data => ({
    grant_id: 0,
    kind: 'domains',
    domains: ['download.tensorflow.org'],
    packages: [],
    minutes: 30,
    megabytes: 500,
    ends_when_installed: false,
    by: 'agent',
    ...over,
});

const approval = (over: Partial<Approval> = {}, internet: Data = data()): Approval =>
    ({
        id: 'a1',
        chat_id: 'c1',
        kind: 'internet_access',
        via: 'cli',
        name: 'Fetch the flower photos',
        size: 0,
        sha256: '',
        content_type: '',
        state: 'pending',
        created_at: '2026-10-21T14:00:00.000Z',
        tool_call_id: 't1',
        internet,
        ...over,
    }) as Approval;

describe('the pending card', () => {
    it('shows title, chip, hosts, the limits and the buttons for sites', async () => {
        const onDecide = vi.fn().mockResolvedValue(undefined);
        render(<InternetApproval approval={approval()} onDecide={onDecide} />);
        expect(screen.getByText('The agent asks to download from 1 site')).toBeTruthy();
        expect(screen.getByText('SITES')).toBeTruthy();
        expect(screen.getByText('download.tensorflow.org')).toBeTruthy();
        expect(screen.getByText(/Ends after 30 min or 500 MB/)).toBeTruthy();
        expect(screen.getByText("Agent's note – not verified")).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Allow 1 site: download.tensorflow.org' }));
        await waitFor(() => expect(onDecide).toHaveBeenCalledWith(true));
        fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
        await waitFor(() => expect(onDecide).toHaveBeenCalledWith(false));
    });

    it('names a helper', () => {
        render(<InternetApproval approval={approval({}, data({ by: 'helper' }))} onDecide={vi.fn()} />);
        expect(screen.getByText('A helper of the agent asks to download from 1 site')).toBeTruthy();
    });

    it('writes "any version" for a package without a pin and never "latest"', () => {
        render(
            <InternetApproval
                approval={approval({}, data({ kind: 'packages', domains: [], packages: ['pip:torch', 'pip:timm==1.0.11'] }))}
                onDecide={vi.fn()}
            />,
        );
        expect(screen.getByText('any version')).toBeTruthy();
        expect(screen.getByText('1.0.11')).toBeTruthy();
        expect(screen.queryByText('latest')).toBeNull();
        expect(screen.getByText('ALLOW 2 PACKAGES')).toBeTruthy();
    });

    it('folds more than five packages behind "Show all"', () => {
        const packages = Array.from({ length: 8 }, (_, i) => `pip:pkg${i}`);
        render(<InternetApproval approval={approval({}, data({ kind: 'packages', domains: [], packages }))} onDecide={vi.fn()} />);
        expect(screen.queryByText('pkg7')).toBeNull();
        const more = screen.getByRole('button', { name: 'Show all 8' });
        expect(more.getAttribute('aria-expanded')).toBe('false');
        fireEvent.click(more);
        expect(screen.getByText('pkg7')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Show fewer' })).toBeTruthy();
    });

    it('warns for full access', () => {
        render(<InternetApproval approval={approval({}, data({ kind: 'full', domains: [] }))} onDecide={vi.fn()} />);
        expect(screen.getByText('FULL ACCESS')).toBeTruthy();
        expect(screen.getByRole('alert').textContent).toMatch(/Full access: the agent can reach any address/);
        expect(screen.getByText('ALLOW FULL ACCESS')).toBeTruthy();
    });

    it('shows when the request lapses', () => {
        render(
            <InternetApproval approval={approval({}, data({ expires_at: '2026-10-21T14:20:00.000Z' }))} onDecide={vi.fn()} />,
        );
        expect(screen.getByText(/Request lapses at/)).toBeTruthy();
    });

    it('keeps a plain card for a gateway without the internet data', () => {
        render(<InternetApproval approval={approval({ internet: undefined })} onDecide={vi.fn()} />);
        expect(screen.getByText('The agent asks for internet access')).toBeTruthy();
        expect(screen.getByRole('button', { name: /Allow internet/ })).toBeTruthy();
    });
});

describe('agentNote', () => {
    it('drops the placeholder and prefers the grant', () => {
        expect(agentNote({ name: '(no reason given)' })).toBeUndefined();
        expect(agentNote({ name: ' ' })).toBeUndefined();
        expect(agentNote({ name: 'a' }, { reason: 'b' })).toBe('b');
    });
});

describe('the decided line', () => {
    const grant = (over: Partial<InternetGrant> = {}): InternetGrant =>
        ({
            id: 1,
            chat_id: 'c1',
            approval_id: 'a1',
            kind: 'domains',
            origin: 'agent',
            domains: ['download.tensorflow.org'],
            packages: [],
            state: 'active',
            max_minutes: 30,
            max_bytes: 500 << 20,
            bytes: 0,
            blocked: 0,
            created_at: '2026-10-21T14:08:00.000Z',
            started_at: '2026-10-21T14:08:00.000Z',
            expires_at: '2026-10-21T14:38:00.000Z',
            ...over,
        }) as InternetGrant;

    it('sits flush with the tool groups, without side margin (issue #192)', () => {
        render(<InternetDecided approval={approval({ state: 'approved', decided_at: '2026-10-21T14:08:00.000Z' })} grant={grant()} />);
        const style = getComputedStyle(screen.getByTestId('agent-internet-decided'));
        expect(['', '0px']).toContain(style.marginLeft);
        expect(['', '0px']).toContain(style.marginRight);
    });

    it('opens to the list without buttons', () => {
        render(<InternetDecided approval={approval({ state: 'approved', decided_at: '2026-10-21T14:08:00.000Z' })} grant={grant()} />);
        const row = screen.getByTestId('agent-internet-decided');
        expect(row.textContent).toMatch(/Download from 1 site/);
        expect(row.textContent).toMatch(/active until/);
        expect(screen.queryByText('download.tensorflow.org', { selector: 'li' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { expanded: false }));
        expect(screen.getByText('download.tensorflow.org', { selector: 'li' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull();
    });

    it('says rejected, no decision and ended', () => {
        const { rerender } = render(<InternetDecided approval={approval({ state: 'rejected', decided_at: '2026-10-21T14:09:00.000Z' })} />);
        expect(screen.getByTestId('agent-internet-decided').textContent).toMatch(/rejected/);
        rerender(<InternetDecided approval={approval({ state: 'expired' })} />);
        expect(screen.getByTestId('agent-internet-decided').textContent).toMatch(/no decision in time/);
        rerender(
            <InternetDecided
                approval={approval({ state: 'approved' })}
                grant={grant({ state: 'ended', ended_reason: 'time', ended_at: '2026-10-21T14:38:00.000Z' })}
            />,
        );
        expect(screen.getByTestId('agent-internet-decided').textContent).toMatch(/ended: time is up/);
    });

    it('lists only decided approvals of the given steps', () => {
        render(
            <InternetDecidedRows
                steps={[{ id: 't1' }]}
                approvals={[
                    approval({ id: 'x1', state: 'approved' }),
                    approval({ id: 'x2', state: 'pending' }),
                    approval({ id: 'x3', state: 'rejected', tool_call_id: 'other' }),
                ]}
            />,
        );
        expect(screen.getAllByTestId('agent-internet-decided')).toHaveLength(1);
    });
});
