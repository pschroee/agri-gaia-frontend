// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// useInternet and the refusal counter (issue #229): an internet_blocked event with count 0 clears the counter that
// came with the chat view, instead of falling back to it.

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useInternet } from './internet';
import type { InternetBlocked, InternetHooks, InternetSource } from './internet';

function setup() {
    const sources: InternetSource[] = [];
    const hooks: InternetHooks = {
        openStream: () => {
            const src = { onmessage: null, onerror: null, onopen: null, close: vi.fn() } as unknown as InternetSource;
            sources.push(src);
            return src;
        },
        load: () => Promise.resolve([]),
        end: () => Promise.reject(new Error('unused')),
        endAll: () => Promise.resolve(),
    };
    return { hooks, sources };
}

const send = (src: InternetSource, data: unknown) =>
    act(() => {
        src.onmessage?.({ data: JSON.stringify({ kind: 'internet_blocked', data }) } as MessageEvent);
    });

describe('useInternet refusal counter', () => {
    const initial: InternetBlocked = { count: 8, since: '2026-10-26T19:00:00Z', last: [] };

    it('shows the initial value, then the stream value, then nothing after count 0', async () => {
        const { hooks, sources } = setup();
        const { result } = renderHook(() => useInternet('c1', initial, true, hooks));
        await waitFor(() => expect(result.current.loaded).toBe(true));
        expect(result.current.blocked?.count).toBe(8);

        send(sources[0], { count: 9, since: 'x', last: [] });
        expect(result.current.blocked?.count).toBe(9);

        send(sources[0], { count: 0, since: 'y', last: [] });
        expect(result.current.blocked).toBeUndefined();
    });

    it('does not fall back to the initial value after count 0', async () => {
        const { hooks, sources } = setup();
        const { result } = renderHook(() => useInternet('c1', initial, true, hooks));
        await waitFor(() => expect(result.current.loaded).toBe(true));
        send(sources[0], { count: 0 });
        expect(result.current.blocked).toBeUndefined();
    });
});
