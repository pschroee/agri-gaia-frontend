// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { reportPlatformChanged } from '../../platformChanges';
import { useLivePolling } from './useLivePolling';

type Page = { running: number };

function setVisibility(v: 'visible' | 'hidden') {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v });
}

beforeEach(() => {
    vi.useFakeTimers();
    setVisibility('visible');
});
afterEach(() => {
    cleanup();
    vi.useRealTimers();
    setVisibility('visible');
});

const flush = () => act(async () => { await Promise.resolve(); });

describe('useLivePolling', () => {
    it('polls every 5 s while something is active and every 30 s otherwise', async () => {
        let running = 1;
        const load = vi.fn(async () => ({ running }));
        renderHook(() => useLivePolling<Page>(load, { key: 'a', active: (d) => (d?.running ?? 0) > 0 }));
        await flush();
        expect(load).toHaveBeenCalledTimes(1);
        await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
        expect(load).toHaveBeenCalledTimes(2);
        running = 0;
        await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
        expect(load).toHaveBeenCalledTimes(3);
        await act(async () => { await vi.advanceTimersByTimeAsync(25000); });
        expect(load).toHaveBeenCalledTimes(3);
        await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
        expect(load).toHaveBeenCalledTimes(4);
    });

    it('pauses while the page is hidden and loads when it is visible again', async () => {
        const load = vi.fn(async () => ({ running: 1 }));
        renderHook(() => useLivePolling<Page>(load, { key: 'a', active: () => true }));
        await flush();
        setVisibility('hidden');
        await act(async () => { await vi.advanceTimersByTimeAsync(20000); });
        expect(load).toHaveBeenCalledTimes(1);
        setVisibility('visible');
        await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
        expect(load).toHaveBeenCalledTimes(2);
    });

    it('reloads after a platform change, debounced', async () => {
        const load = vi.fn(async () => ({ running: 0 }));
        renderHook(() => useLivePolling<Page>(load, { key: 'a', active: () => false }));
        await flush();
        const ev = { changes: [], at: '', chat_id: '' } as never;
        act(() => {
            reportPlatformChanged(ev);
            reportPlatformChanged(ev);
        });
        expect(load).toHaveBeenCalledTimes(1);
        await act(async () => { await vi.advanceTimersByTimeAsync(600); });
        expect(load).toHaveBeenCalledTimes(2);
    });

    it('drops an older answer that arrives after a newer key loaded', async () => {
        const waiting = new Map<string, (p: Page) => void>();
        const load = vi.fn((_s: AbortSignal) => new Promise<Page>((r) => waiting.set(`n${waiting.size}`, r)));
        const { result, rerender } = renderHook(({ key }) => useLivePolling<Page>(load, { key, active: () => false }), {
            initialProps: { key: 'a' },
        });
        rerender({ key: 'b' });
        await act(async () => { waiting.get('n1')?.({ running: 2 }); });
        await act(async () => { waiting.get('n0')?.({ running: 1 }); });
        expect(result.current.data).toEqual({ running: 2 });
        expect(load.mock.calls[0][0].aborted).toBe(true);
    });

    it('keeps the data when a later load fails', async () => {
        let fail = false;
        const load = vi.fn(async () => {
            if (fail) throw new Error('boom');
            return { running: 1 };
        });
        const { result } = renderHook(() => useLivePolling<Page>(load, { key: 'a', active: () => true }));
        await flush();
        await waitFor(() => expect(result.current.data).toEqual({ running: 1 }));
        expect(result.current.failed).toBe(false);
        fail = true;
        await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
        expect(result.current.data).toEqual({ running: 1 });
        expect(result.current.error).toBe('boom');
        expect(result.current.failed).toBe(true);
        fail = false;
        await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
        expect(result.current.failed).toBe(false);
    });

    it('reports an error before the first answer as loading finished without data', async () => {
        const load = vi.fn(async () => {
            throw new Error('nope');
        });
        const { result } = renderHook(() => useLivePolling<Page>(load, { key: 'a', active: () => false }));
        await flush();
        expect(result.current.loading).toBe(false);
        expect(result.current.failed).toBe(false);
        expect(result.current.error).toBe('nope');
    });
});
