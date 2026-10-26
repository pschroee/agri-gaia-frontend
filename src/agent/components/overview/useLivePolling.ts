// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Polls a source while a page is visible: fast while something runs, slow otherwise (issues #222, #223).

import { useCallback, useEffect, useRef, useState } from 'react';

import { onPlatformChangedEvent } from '../../platformChanges';

export type LivePollingOptions<T> = {
    /** A new key (the query) loads at once; the previous answer is dropped when it arrives late. */
    key: string;
    /** True while something runs or waits: the page then polls every `activeMs`. */
    active: (data: T | undefined) => boolean;
    activeMs?: number;
    idleMs?: number;
};

export type LivePolling<T> = {
    data?: T;
    error?: string;
    /** First load, nothing to show yet. */
    loading: boolean;
    /** A load is under way (also while earlier data stays on screen). */
    refreshing: boolean;
    /** A load failed after data had arrived; the data stays. */
    failed: boolean;
    fetchedAt?: number;
    reload: () => void;
};

const DEBOUNCE_MS = 500;

export function useLivePolling<T>(
    load: (signal: AbortSignal) => Promise<T>,
    opts: LivePollingOptions<T>,
): LivePolling<T> {
    const { key, activeMs = 5000, idleMs = 30000 } = opts;
    const [data, setData] = useState<T>();
    const [error, setError] = useState<string>();
    const [refreshing, setRefreshing] = useState(true);
    const [fetchedAt, setFetchedAt] = useState<number>();

    const loadRef = useRef(load);
    loadRef.current = load;
    const activeRef = useRef(opts.active);
    activeRef.current = opts.active;
    const dataRef = useRef<T>();
    const runNo = useRef(0);
    const ctrl = useRef<AbortController>();
    const timer = useRef<ReturnType<typeof setTimeout>>();
    const fetchRef = useRef<() => void>(() => undefined);

    const clearTimer = () => {
        if (timer.current !== undefined) clearTimeout(timer.current);
        timer.current = undefined;
    };

    const fetchNow = useCallback(() => {
        clearTimer();
        ctrl.current?.abort();
        const mine = ++runNo.current;
        const c = new AbortController();
        ctrl.current = c;
        setRefreshing(true);
        const schedule = () => {
            if (mine !== runNo.current) return;
            clearTimer();
            const ms = activeRef.current(dataRef.current) ? activeMs : idleMs;
            timer.current = setTimeout(() => {
                timer.current = undefined;
                // A hidden page does not poll; becoming visible loads at once.
                if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
                fetchRef.current();
            }, ms);
        };
        loadRef
            .current(c.signal)
            .then((d) => {
                if (mine !== runNo.current) return;
                dataRef.current = d;
                setData(d);
                setError(undefined);
                setFetchedAt(Date.now());
                setRefreshing(false);
                schedule();
            })
            .catch((e: unknown) => {
                if (mine !== runNo.current || c.signal.aborted) return;
                setError(e instanceof Error ? e.message : String(e));
                setRefreshing(false);
                schedule();
            });
    }, [activeMs, idleMs]);
    fetchRef.current = fetchNow;

    useEffect(() => {
        setError(undefined);
        fetchNow();
        return () => {
            runNo.current++;
            ctrl.current?.abort();
            clearTimer();
        };
    }, [key, fetchNow]);

    useEffect(() => {
        const onVisible = () => {
            if (document.visibilityState === 'visible') fetchRef.current();
        };
        document.addEventListener('visibilitychange', onVisible);
        let debounce: ReturnType<typeof setTimeout> | undefined;
        const off = onPlatformChangedEvent(() => {
            if (debounce !== undefined) clearTimeout(debounce);
            debounce = setTimeout(() => {
                debounce = undefined;
                fetchRef.current();
            }, DEBOUNCE_MS);
        });
        return () => {
            document.removeEventListener('visibilitychange', onVisible);
            off();
            if (debounce !== undefined) clearTimeout(debounce);
        };
    }, []);

    const reload = useCallback(() => fetchRef.current(), []);
    return {
        data,
        error,
        loading: data === undefined && error === undefined,
        refreshing,
        failed: error !== undefined && data !== undefined,
        fetchedAt,
        reload,
    };
}
