// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Failed tasks the user has seen no longer count as news in the footer (issue #228).

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { IBackgroundTask } from '../../types/IBackgroundTask';
import {
    FAILED_SEEN_KEY,
    FAILED_SEEN_MAX,
    footerTooltip,
    readFailedSeen,
    unseenFailed,
    useFailedSeen,
    writeFailedSeen,
} from './failedSeen';

const task = (id: number, status = 'failed', title = `T${id}`) =>
    ({ id, status, title, initiator: 'u', creation_date: '2026-10-20T10:00:00', completion_percentage: 0 }) as IBackgroundTask;
const stored = () => JSON.parse(localStorage.getItem(FAILED_SEEN_KEY) ?? 'null');

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('useFailedSeen', () => {
    it('counts all old failures as seen on the first visit, once the list is loaded', () => {
        const tasks = [task(1), task(2), task(3, 'completed')];
        const { result, rerender } = renderHook(({ loaded }) => useFailedSeen(tasks, loaded), {
            initialProps: { loaded: false },
        });
        expect(result.current.unseen).toEqual([]);
        expect(stored()).toBeNull(); // nothing taken over before the server list is there
        rerender({ loaded: true });
        expect(result.current.unseen).toEqual([]);
        expect(stored()).toEqual({ ids: [1, 2] });
    });

    it('reports a new failure as unseen and markSeen clears it', () => {
        writeFailedSeen([1, 2]);
        const tasks = [task(1), task(2), task(3)];
        const { result } = renderHook(() => useFailedSeen(tasks, true));
        expect(result.current.unseen.map((t) => t.id)).toEqual([3]);
        act(() => result.current.markSeen());
        expect(result.current.unseen).toEqual([]);
        expect(stored()).toEqual({ ids: [1, 2, 3] });
    });

    it('treats broken JSON like a missing key', () => {
        localStorage.setItem(FAILED_SEEN_KEY, '{nope');
        expect(readFailedSeen()).toBeUndefined();
        const { result } = renderHook(() => useFailedSeen([task(1)], true));
        expect(result.current.unseen).toEqual([]);
        expect(stored()).toEqual({ ids: [1] });
    });

    it('survives a storage that throws', () => {
        const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('blocked');
        });
        try {
            const { result } = renderHook(() => useFailedSeen([task(1)], true));
            expect(result.current.unseen).toEqual([]);
        } finally {
            set.mockRestore();
        }
    });
});

describe('failedSeen helpers', () => {
    it('keeps the newest 200 ids', () => {
        writeFailedSeen(Array.from({ length: 250 }, (_, i) => i + 1));
        const ids = stored().ids as number[];
        expect(ids).toHaveLength(FAILED_SEEN_MAX);
        expect(ids[0]).toBe(51);
        expect(ids[ids.length - 1]).toBe(250);
    });

    it('ignores tasks that did not fail', () => {
        expect(unseenFailed([task(1, 'completed'), task(2, 'inprogress'), task(3)], [])).toHaveLength(1);
    });

    it('words the tooltip for none, one and several', () => {
        expect(footerTooltip([])).toMatch(/^Background tasks of the platform/);
        expect(footerTooltip([task(3, 'failed', 'Run Train Container')])).toBe(
            '1 task failed since you last looked: Run Train Container · click to show it',
        );
        expect(footerTooltip([task(1), task(2), task(3)])).toBe('3 tasks failed since you last looked · click to show them');
    });
});
