// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The list of the tab "Plans" (gateway issue #223): one page of GET /api/plans, kept current from the stream
// GET /api/plans/events. An event of a plan on the page replaces its row; any other change reloads the page after one
// second (debounced), and so does a reconnect of the stream.

import { useCallback, useEffect, useRef, useState } from 'react';

import { AGENT_BASE } from './login';
import { applyPlanEvent, fetchPlanPage, plansQuery } from './plansOverview';
import type { PlanFilters, PlanListItem, PlanPage } from './plansOverview';

/** The part of EventSource the hook uses (replaceable in tests). */
export type PlanStreamSource = {
    onmessage: ((ev: MessageEvent<string>) => void) | null;
    onerror: ((ev: Event) => void) | null;
    onopen: ((ev: Event) => void) | null;
    close: () => void;
};

export type PlanOverviewHooks = {
    openStream: () => PlanStreamSource;
    load: (q: URLSearchParams, signal?: AbortSignal) => Promise<PlanPage>;
};

const defaultHooks: PlanOverviewHooks = {
    openStream: () =>
        new EventSource(`${AGENT_BASE}/api/plans/events`, { withCredentials: true }) as unknown as PlanStreamSource,
    load: fetchPlanPage,
};

export const RELOAD_DELAY_MS = 1000;

export type PlanOverview = {
    page?: PlanPage;
    /** The first load, nothing to show yet. */
    loading: boolean;
    error?: string;
    reload: () => void;
    /** 'connecting' until the stream first opens: no error yet, so nothing says it failed. */
    live: 'connecting' | 'live' | 'reconnecting';
    /** When the list was last loaded or changed by an event. */
    updatedAt?: number;
};

export function usePlanOverview(
    filters: PlanFilters & { page: number; rowsPerPage: number },
    hooks: PlanOverviewHooks = defaultHooks,
): PlanOverview {
    const [page, setPage] = useState<PlanPage>();
    const [error, setError] = useState<string>();
    const [live, setLive] = useState<'connecting' | 'live' | 'reconnecting'>('connecting');
    const [updatedAt, setUpdatedAt] = useState<number>();
    const key = plansQuery(filters).toString();

    const keyRef = useRef(key);
    keyRef.current = key;
    const pageRef = useRef<PlanPage>();
    pageRef.current = page;
    const runNo = useRef(0);
    const ctrl = useRef<AbortController>();
    const timer = useRef<ReturnType<typeof setTimeout>>();

    const fetchNow = useCallback(() => {
        ctrl.current?.abort();
        const c = new AbortController();
        ctrl.current = c;
        const mine = ++runNo.current;
        hooks
            .load(new URLSearchParams(keyRef.current), c.signal)
            .then((p) => {
                if (mine !== runNo.current) return;
                setPage(p);
                setError(undefined);
                setUpdatedAt(Date.now());
            })
            .catch((e: unknown) => {
                if (mine !== runNo.current || c.signal.aborted) return;
                setError(e instanceof Error ? e.message : String(e));
            });
    }, [hooks]);

    const reloadSoon = useCallback(() => {
        if (timer.current !== undefined) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
            timer.current = undefined;
            fetchNow();
        }, RELOAD_DELAY_MS);
    }, [fetchNow]);

    // a new query loads at once; what was shown stays until the answer arrives
    useEffect(() => {
        fetchNow();
        return () => {
            runNo.current++;
            ctrl.current?.abort();
        };
    }, [key, fetchNow]);

    useEffect(() => {
        const src = hooks.openStream();
        let opened = false;
        src.onopen = () => {
            setLive('live');
            // the second open is a reconnect: whatever happened meanwhile is missing
            if (opened) reloadSoon();
            opened = true;
        };
        src.onerror = () => setLive('reconnecting');
        src.onmessage = (ev) => {
            let msg: { kind?: string; data?: PlanListItem };
            try {
                msg = JSON.parse(ev.data) as { kind?: string; data?: PlanListItem };
            } catch {
                return;
            }
            if (msg.kind !== 'plan' || !msg.data?.id) return;
            const cur = pageRef.current;
            if (!cur) {
                reloadSoon();
                return;
            }
            const r = applyPlanEvent(cur, msg.data);
            if (r.reload) reloadSoon();
            else {
                setPage(r.page);
                setUpdatedAt(Date.now());
            }
        };
        return () => {
            src.close();
            if (timer.current !== undefined) clearTimeout(timer.current);
            timer.current = undefined;
        };
    }, [hooks, reloadSoon]);

    return { page, loading: page === undefined && error === undefined, error, reload: fetchNow, live, updatedAt };
}
