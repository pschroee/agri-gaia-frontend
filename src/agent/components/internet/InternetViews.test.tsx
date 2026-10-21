// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Smoke test of the two internet views of the Activity (issue #175, E3-c): the connection table with its summary line,
// reasons, targets, approval chips, the line for unlisted data and "Show more", and the access table with its
// summary line and the details of an open row. The wording lives in internetView.test.ts and activity.test.ts; here the
// views only have to put it together.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { activityRows } from '../../activity';
import { agentApi } from '../../api';
import type { Connection, ConnectionsPage } from '../../internet';
import type { ActivityCall, ActivityPage } from '../../types';
import InternetAccessView from './InternetAccessView';
import InternetConnectionsView from './InternetConnectionsView';

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

const conn = (id: number, over: Partial<Connection> = {}): Connection => ({
    id,
    chat_id: 'c1',
    method: 'GET',
    host: 'pytorch.org',
    port: 443,
    status: 200,
    bytes_up: 6000,
    bytes_down: 4.8 * 1024 * 1024,
    started_at: '2026-10-21T14:22:18Z',
    duration_ms: 120,
    grant_id: 1,
    origin: 'pi',
    count: 1,
    ...over,
});

const pageOf = (connections: Connection[], over: Partial<ConnectionsPage> = {}): ConnectionsPage => ({
    connections,
    chats: { c1: { id: 'c1', title: 'Train a flower classifier', model: 'm', variant: 'cli' } },
    summary: { count: connections.length, bytes_down: 5 * 1024 * 1024, bytes_up: 0, blocked: 0 },
    total: connections.length,
    grants: { '1': { kind: 'search', domains: [], packages: [] } },
    unlisted: [],
    ...over,
});

describe('InternetConnectionsView', () => {
    let spy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
        spy = vi.spyOn(agentApi, 'connections');
    });

    it('shows the summary, the target, the reason of a refusal and the approval chip', async () => {
        spy.mockResolvedValue(
            pageOf(
                [
                    conn(3, {
                        host: 'pypi.org',
                        package: 'opencv-python',
                        denied: 'no',
                        reason: 'package_not_listed',
                        origin: 'pkg',
                        grant_id: 2,
                        bytes_down: 0,
                        bytes_up: 0,
                    }),
                    conn(2, { service: 'search', count: 214, origin: 'pi' }),
                    conn(1, {
                        host: 'github.com',
                        denied: 'no',
                        reason: 'a_new_reason_code',
                        origin: 'exec',
                        grant_id: 0,
                    }),
                ],
                {
                    summary: { count: 3, bytes_down: 2.5 * 1024 ** 3, bytes_up: 0, blocked: 2 },
                    grants: { '2': { kind: 'packages', domains: [], packages: ['pip:torch', 'pip:timm'] } },
                },
            ),
        );
        render(<InternetConnectionsView filter={{}} />);
        await waitFor(() => expect(screen.getAllByTestId('connection-row')).toHaveLength(3));
        expect(screen.getByTestId('connections-summary').textContent).toBe('3 connections · 2.5 GB · ');
        expect(screen.getByText('2 blocked')).toBeTruthy();
        expect(screen.getByText('web search')).toBeTruthy();
        expect(screen.getByText('214 requests')).toBeTruthy();
        expect(screen.getByText('opencv-python')).toBeTruthy();
        // known and unknown reason codes
        expect(screen.getByText('· not in the list')).toBeTruthy();
        expect(screen.getByText('· a new reason code')).toBeTruthy();
        expect(screen.getByText('2 PACKAGES')).toBeTruthy();
        // a refusal without an approval has no chip
        expect(screen.getAllByText('–').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Train a flower classifier').length).toBe(3);
    });

    it('narrows to the blocked ones by the blocked figure, and tells an empty blocked list', async () => {
        spy.mockResolvedValue(pageOf([conn(1)], { summary: { count: 1, bytes_down: 1, bytes_up: 0, blocked: 4 } }));
        const onBlocked = vi.fn();
        render(<InternetConnectionsView filter={{}} onShowBlocked={onBlocked} />);
        await waitFor(() => screen.getByText('4 blocked'));
        fireEvent.click(screen.getByText('4 blocked'));
        expect(onBlocked).toHaveBeenCalled();
        cleanup();
        spy.mockResolvedValue(pageOf([]));
        render(<InternetConnectionsView filter={{ result: 'blocked' }} />);
        await waitFor(() => expect(screen.getByTestId('connections-empty').textContent).toBe('Nothing blocked.'));
        cleanup();
        render(<InternetConnectionsView filter={{}} />);
        await waitFor(() =>
            expect(screen.getByTestId('connections-empty').textContent).toBe('No internet connections in this period.'),
        );
    });

    it('lists the data of a full access that no connection accounts for, and offers the rest', async () => {
        spy.mockResolvedValueOnce(
            pageOf([conn(1)], {
                total: 17,
                next_before: 1,
                unlisted: [{ grant_id: 9, chat_id: 'c1', bytes: 46 * 1024 * 1024 }],
                grants: {
                    '1': { kind: 'search', domains: [], packages: [] },
                    '9': { kind: 'full', domains: [], packages: [] },
                },
            }),
        );
        render(<InternetConnectionsView filter={{}} />);
        await waitFor(() => screen.getByText('Full access · 46 MB · not listed'));
        expect(screen.getByText('SHOW 16 MORE')).toBeTruthy();
        spy.mockResolvedValueOnce(pageOf([conn(0)], { total: 17 }));
        fireEvent.click(screen.getByText('SHOW 16 MORE'));
        await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
        expect(spy.mock.calls[1][0]).toContain('before=1');
    });

    it('hides the unlisted line while a result or origin filter is set', async () => {
        spy.mockResolvedValue(pageOf([conn(1)], { unlisted: [{ grant_id: 9, chat_id: 'c1', bytes: 1024 }] }));
        render(<InternetConnectionsView filter={{ result: 'allowed' }} />);
        await waitFor(() => expect(screen.getAllByTestId('connection-row')).toHaveLength(1));
        expect(screen.queryByTestId('connection-unlisted')).toBeNull();
    });

    it('opens the access row of an approval by its chip', async () => {
        spy.mockResolvedValue(pageOf([conn(1)]));
        const open = vi.fn();
        render(<InternetConnectionsView filter={{}} onOpenGrant={open} />);
        await waitFor(() => screen.getByText('SEARCH'));
        fireEvent.click(screen.getByText('SEARCH'));
        expect(open).toHaveBeenCalledWith(1);
    });
});

const grant = {
    id: 1,
    kind: 'packages' as const,
    domains: [],
    packages: ['pip:torch'],
    bytes: 2.6 * 1024 ** 3,
    max_bytes: 4096 * 1024 * 1024,
    state: 'ended' as const,
    origin: 'agent' as const,
    started_at: '2026-10-21T14:06:00Z',
    expires_at: '2026-10-21T15:06:00Z',
    ended_at: '2026-10-21T14:12:00Z',
    ended_reason: 'installed' as const,
};

const entry = (id: number, op: string, result: string, over: Partial<ActivityCall> = {}): ActivityCall => ({
    id,
    chat_id: 'c1',
    slot_id: 'p',
    via: 'cli',
    op,
    detail: '',
    result,
    created_at: `2026-10-21T14:0${id}:00Z`,
    kind: 'internet',
    ...over,
});

const accessPage = (calls: ActivityCall[]): ActivityPage => ({
    calls,
    chats: { c1: { id: 'c1', title: 'Train a flower classifier', model: 'm', variant: 'cli' } },
    summary: { total: 0, outcomes: {}, chats: 1, runs: 1, duration: { count: 0 } },
});

describe('InternetAccessView', () => {
    beforeEach(() => {
        vi.spyOn(agentApi, 'connections').mockResolvedValue(
            pageOf(
                [
                    conn(5, {
                        host: 'pypi.org',
                        package: 'opencv-python',
                        denied: 'no',
                        reason: 'package_not_listed',
                        origin: 'pkg',
                    }),
                ],
                {
                    summary: { count: 23, bytes_down: 2.6 * 1024 ** 3, bytes_up: 0, blocked: 1 },
                    total: 23,
                },
            ),
        );
    });

    it('shows one row per entry with title, chip, list, via, result and data', () => {
        const rows = activityRows(
            accessPage([
                entry(1, 'internet', 'approved', { grant, detail: 'Install PyTorch.', tool_call_id: 'call_1' }),
                entry(2, 'internet_end', 'installed', { grant, via: 'orchestrator' }),
                entry(3, 'internet', 'refused', { via: 'mcp' }),
            ]),
            'internet',
        );
        render(<InternetAccessView rows={rows} emptyText="none" summary="1 approval · 2.6 GB · 1 blocked" />);
        expect(screen.getByTestId('access-summary').textContent).toBe('1 approval · 2.6 GB · 1 blocked');
        expect(screen.getAllByTestId('access-row')).toHaveLength(3);
        expect(screen.getByText('Packages approved for the agent')).toBeTruthy();
        expect(screen.getByText('Packages installed, access ended')).toBeTruthy();
        expect(screen.getByText('Internet access request refused')).toBeTruthy();
        expect(screen.getAllByText('PACKAGES').length).toBe(2);
        expect(screen.getByText('ended: installed')).toBeTruthy();
        expect(screen.getByText('refused')).toBeTruthy();
        expect(screen.getByText('2.6 GB')).toBeTruthy();
    });

    it('says so when there is nothing', () => {
        render(<InternetAccessView rows={[]} emptyText="No internet access in total." />);
        expect(screen.getByText('No internet access in total.')).toBeTruthy();
    });

    it('opens a row to the time line, the note, the limits and the connections of the approval', async () => {
        const rows = activityRows(
            accessPage([
                entry(1, 'internet', 'approved', {
                    grant,
                    detail: 'Install PyTorch.',
                    tool_call_id: 'call_1',
                    approval: {
                        id: 'a1',
                        state: 'approved',
                        created_at: '2026-10-21T14:05:00Z',
                        decided_at: '2026-10-21T14:06:00Z',
                    },
                }),
            ]),
            'internet',
        );
        render(<InternetAccessView rows={rows} emptyText="none" />);
        expect(screen.queryByTestId('access-details')).toBeNull();
        fireEvent.click(screen.getByTestId('access-row'));
        await waitFor(() => screen.getByTestId('access-details'));
        const d = screen.getByTestId('access-details');
        expect(d.textContent).toContain('requested by the agent');
        expect(d.textContent).toContain('approved by you');
        expect(d.textContent).toContain('ended: packages installed · 2.6 GB');
        expect(d.textContent).toContain("Agent's note – not verified");
        expect(d.textContent).toContain('Install PyTorch.');
        expect(d.textContent).toContain('pip torch any version · and the packages these need');
        expect(d.textContent).toContain('Ends when these packages are installed');
        expect(d.textContent).toContain('call_1');
        await waitFor(() =>
            expect(screen.getByTestId('grant-connections').textContent).toContain(
                '23 connections · 2.6 GB · 1 blocked',
            ),
        );
        expect(screen.getByTestId('grant-connections').textContent).toContain('SHOW ALL 23');
        // the first refusal appears on the time line
        expect(d.textContent).toContain('blocked opencv-python (not in the list)');
    });

    it('opens the row of the focused grant by itself', () => {
        const rows = activityRows(accessPage([entry(1, 'internet', 'approved', { grant })]), 'internet');
        render(<InternetAccessView rows={rows} emptyText="none" focusGrant={1} />);
        expect(screen.getByTestId('access-details')).toBeTruthy();
    });
});
