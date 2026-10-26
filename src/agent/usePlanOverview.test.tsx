// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The list of the plans tab (issue #223): it loads for the filters, an event of a plan on the page replaces the row
// without a request, a new plan or a change of group reloads once after a second, a reconnect reloads, and an
// error of the stream says "reconnecting".

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Plan } from './plan';
import type { PlanListItem, PlanPage } from './plansOverview';
import { RELOAD_DELAY_MS, usePlanOverview } from './usePlanOverview';
import type { PlanOverviewHooks, PlanStreamSource } from './usePlanOverview';

const item = (id: string, state: Plan['state'] = 'approved'): PlanListItem => ({
    id,
    chat_id: 'c1',
    chat_title: 'Chat one',
    agent_title: id,
    via: 'cli',
    state,
    mode: 'autonomous',
    created_at: '2026-10-26T10:00:00Z',
    steps: [],
});

const pageOf = (...plans: PlanListItem[]): PlanPage => ({ plans, total: plans.length, running: plans.length });
const FILTERS = { status: '', mode: '', chat: '', page: 0, rowsPerPage: 25 };

function setup(first: PlanPage = pageOf(item('a'))) {
    const sources: PlanStreamSource[] = [];
    const load = vi.fn(async (_q: URLSearchParams) => first);
    const hooks: PlanOverviewHooks = {
        openStream: () => {
            const src: PlanStreamSource = { onmessage: null, onerror: null, onopen: null, close: vi.fn() };
            sources.push(src);
            return src;
        },
        load,
    };
    const emit = (plan: PlanListItem) =>
        act(() => {
            sources[0].onmessage?.({
                data: JSON.stringify({ kind: 'plan', chat_id: plan.chat_id, data: plan }),
            } as MessageEvent<string>);
        });
    return { hooks, sources, load, emit };
}

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

describe('usePlanOverview', () => {
    it('loads at once and again when a filter changes', async () => {
        const { hooks, load } = setup();
        const { result, rerender } = renderHook(({ f }) => usePlanOverview(f, hooks), { initialProps: { f: FILTERS } });
        expect(result.current.loading).toBe(true);
        await waitFor(() => expect(result.current.page?.plans).toHaveLength(1));
        expect(load).toHaveBeenCalledTimes(1);
        expect(load.mock.calls[0][0].toString()).toBe('limit=25');

        rerender({ f: { ...FILTERS, status: 'failed' } });
        await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
        expect(load.mock.calls[1][0].get('state')).toBe('failed');
    });

    it('replaces the row of an event without a request', async () => {
        const { hooks, load, emit } = setup();
        const { result } = renderHook(() => usePlanOverview(FILTERS, hooks));
        await waitFor(() => expect(result.current.page).toBeDefined());
        emit({ ...item('a'), state: 'paused', pause_reason: 'user' });
        expect(result.current.page?.plans[0].state).toBe('paused');
        act(() => {
            vi.advanceTimersByTime(RELOAD_DELAY_MS * 3);
        });
        expect(load).toHaveBeenCalledTimes(1);
    });

    it('reloads once after a second for a new plan', async () => {
        const { hooks, load, emit } = setup();
        const { result } = renderHook(() => usePlanOverview(FILTERS, hooks));
        await waitFor(() => expect(result.current.page).toBeDefined());
        emit(item('new'));
        emit(item('new2'));
        expect(load).toHaveBeenCalledTimes(1);
        await act(async () => {
            vi.advanceTimersByTime(RELOAD_DELAY_MS + 50);
        });
        expect(load).toHaveBeenCalledTimes(2);
    });

    it('reloads when a plan changes from going on to over', async () => {
        const { hooks, load, emit } = setup();
        const { result } = renderHook(() => usePlanOverview(FILTERS, hooks));
        await waitFor(() => expect(result.current.page).toBeDefined());
        emit({ ...item('a'), state: 'completed' });
        await act(async () => {
            vi.advanceTimersByTime(RELOAD_DELAY_MS + 50);
        });
        expect(load).toHaveBeenCalledTimes(2);
    });

    it('reloads after a reconnect and says reconnecting on an error', async () => {
        const { hooks, sources, load } = setup();
        const { result } = renderHook(() => usePlanOverview(FILTERS, hooks));
        await waitFor(() => expect(result.current.page).toBeDefined());
        act(() => sources[0].onopen?.(new Event('open')));
        expect(result.current.live).toBe('live');
        expect(load).toHaveBeenCalledTimes(1);
        act(() => sources[0].onerror?.(new Event('error')));
        expect(result.current.live).toBe('reconnecting');
        act(() => sources[0].onopen?.(new Event('open')));
        await act(async () => {
            vi.advanceTimersByTime(RELOAD_DELAY_MS + 50);
        });
        expect(load).toHaveBeenCalledTimes(2);
        expect(result.current.live).toBe('live');
    });

    it('reports a failed load and closes the stream when it unmounts', async () => {
        const { hooks, sources, load } = setup();
        load.mockRejectedValueOnce(new Error('500 Internal Server Error'));
        const { result, unmount } = renderHook(() => usePlanOverview(FILTERS, hooks));
        await waitFor(() => expect(result.current.error).toBe('500 Internal Server Error'));
        expect(result.current.loading).toBe(false);
        unmount();
        expect(sources[0].close).toHaveBeenCalled();
    });
});
