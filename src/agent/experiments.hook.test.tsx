// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// useExperiments when the chat changes (issue #195): the previous chat's content stays until the next one is loaded.

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useExperiments } from './experiments';
import type { ExperimentsHooks, ExperimentsSource, Trial } from './experiments';
import { makeTrial } from './experimentsFixtures';

function setup() {
    const pending = new Map<string, (r: { searches: never[]; trials: Trial[] }) => void>();
    const sources: ExperimentsSource[] = [];
    const hooks: ExperimentsHooks = {
        openStream: () => {
            const src: ExperimentsSource = { onmessage: null, onerror: null, onopen: null, close: vi.fn() };
            sources.push(src);
            return src;
        },
        load: (id) => new Promise((resolve) => pending.set(id, resolve)),
    };
    return { hooks, pending, sources };
}

describe('useExperiments across chats', () => {
    it('keeps the previous chat until the next one loaded', async () => {
        const { hooks, pending } = setup();
        const { result, rerender } = renderHook(({ id }) => useExperiments(id, true, hooks), { initialProps: { id: 'a' } });
        expect(result.current.state.loaded).toBe(false);
        await act(async () => pending.get('a')?.({ searches: [], trials: [makeTrial(0, { id: 'ta', chat_id: 'a' })] }));
        await waitFor(() => expect(result.current.state.trials).toHaveLength(1));
        expect(result.current.switching).toBe(false);

        rerender({ id: 'b' });
        // still the content of chat a, loaded, not the empty state and not the skeleton
        expect(result.current.switching).toBe(true);
        expect(result.current.state.loaded).toBe(true);
        expect(result.current.state.trials[0].id).toBe('ta');

        await act(async () => pending.get('b')?.({ searches: [], trials: [] }));
        await waitFor(() => expect(result.current.switching).toBe(false));
        expect(result.current.state.loaded).toBe(true);
        expect(result.current.state.trials).toHaveLength(0);
        expect(result.current.state.chatId).toBe('b');
    });

    it('shows the empty state only after the load', async () => {
        const { hooks, pending } = setup();
        const { result } = renderHook(() => useExperiments('a', true, hooks));
        // nothing before: the state is not loaded, so the tab shows the skeleton, never the empty state
        expect(result.current.state.loaded).toBe(false);
        await act(async () => pending.get('a')?.({ searches: [], trials: [] }));
        await waitFor(() => expect(result.current.state.loaded).toBe(true));
    });

    it('does not mix events of two chats', async () => {
        const { hooks, pending, sources } = setup();
        const { result, rerender } = renderHook(({ id }) => useExperiments(id, true, hooks), { initialProps: { id: 'a' } });
        await act(async () => pending.get('a')?.({ searches: [], trials: [makeTrial(0, { id: 'ta', chat_id: 'a' })] }));
        await waitFor(() => expect(result.current.state.loaded).toBe(true));
        rerender({ id: 'b' });
        // an event of chat b arrives while b loads: it must not land in the content of a
        const evB = makeTrial(0, { id: 'tb', chat_id: 'b' });
        act(() => {
            sources[sources.length - 1].onmessage?.({ data: JSON.stringify({ kind: 'trial', data: evB }) } as MessageEvent<string>);
        });
        expect(result.current.state.trials.map((t) => t.id)).toEqual(['ta']);
    });
});
