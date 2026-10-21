// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Refusal lines under `bash` calls (gateway issue #175, A8): one line, a collapsed group, nothing for web tools.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Connection } from '../../internet';

const webRequests = vi.fn();
vi.mock('../../api', () => ({ agentApi: { webRequests: (...a: unknown[]) => webRequests(...a) } }));
vi.mock('../../InternetContext', () => ({
    useInternetContext: () => ({ grants: [], active: [], blocked: { count: 3, since: '', last: [] }, loaded: true }),
}));

import BlockedRows, { BlockedRowsProvider, groupByCall, listReason } from './BlockedRows';

afterEach(cleanup);
beforeEach(() => webRequests.mockReset());

const conn = (over: Partial<Connection>): Connection =>
    ({
        id: 1,
        chat_id: 'c1',
        method: 'CONNECT',
        host: 'github.com',
        port: 443,
        status: 0,
        bytes_up: 0,
        bytes_down: 0,
        denied: 'not in the allowed sites',
        reason: 'not_listed',
        started_at: '2026-10-21T14:10:31.000Z',
        duration_ms: 0,
        origin: 'exec',
        tool_call_id: 't1',
        count: 1,
        ...over,
    }) as Connection;

describe('groupByCall', () => {
    it('keeps refused command connections with a tool call only', () => {
        const m = groupByCall([
            conn({ id: 1 }),
            conn({ id: 2, tool_call_id: 't2' }),
            conn({ id: 3, origin: 'pi' }),
            conn({ id: 4, tool_call_id: undefined }),
            conn({ id: 5, denied: '', reason: undefined }),
        ]);
        expect([...m.keys()]).toEqual(['t1', 't2']);
    });
});

describe('listReason', () => {
    it('words the common reasons', () => {
        expect(listReason({ reason: 'not_listed' })).toBe('not in the allowed sites');
        expect(listReason({ reason: 'package_not_listed' })).toBe('not in the allowed packages');
        expect(listReason({ reason: 'https_only' })).toBe('only https');
    });
});

describe('BlockedRows', () => {
    it('shows one line under a bash call', async () => {
        webRequests.mockResolvedValue([conn({})]);
        render(
            <BlockedRowsProvider chatId="c1">
                <BlockedRows toolCallId="t1" tool="bash" />
            </BlockedRowsProvider>,
        );
        await waitFor(() => expect(screen.getByText('Blocked: github.com is not in the allowed sites')).toBeTruthy());
    });

    it('groups several and opens the list', async () => {
        webRequests.mockResolvedValue([
            conn({ id: 1 }),
            conn({ id: 2, host: 'raw.githubusercontent.com' }),
            conn({ id: 3, host: 'objects.githubusercontent.com' }),
        ]);
        render(
            <BlockedRowsProvider chatId="c1">
                <BlockedRows toolCallId="t1" tool="bash" />
            </BlockedRowsProvider>,
        );
        const btn = await screen.findByRole('button', { name: /3 blocked · github.com and 2 more/ });
        expect(btn.getAttribute('aria-expanded')).toBe('false');
        fireEvent.click(btn);
        expect(screen.getByText('raw.githubusercontent.com')).toBeTruthy();
    });

    it('shows nothing under a web tool', async () => {
        webRequests.mockResolvedValue([conn({})]);
        render(
            <BlockedRowsProvider chatId="c1">
                <BlockedRows toolCallId="t1" tool="web_extract" />
            </BlockedRowsProvider>,
        );
        await waitFor(() => expect(webRequests).toHaveBeenCalled());
        expect(screen.queryByTestId('agent-blocked-row')).toBeNull();
    });
});
