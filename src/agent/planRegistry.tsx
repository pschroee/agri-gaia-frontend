// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Which plan cards a chat view shows (gateway issue #72): a plan is decided in one place only. The card in the
// transcript is that place; the list of pending approvals then shows a reference line. When the view shows no card
// for a plan (a subagent's plan in the main view, plans not loaded yet), the list shows the card itself instead.

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

type Registry = { shown: ReadonlySet<string>; register: (planId: string) => () => void };

const PlanCardRegistry = createContext<Registry | undefined>(undefined);

/** Counts mounted cards per plan, so that a card mounted twice for a moment stays counted until both are gone. */
export function countReducer(counts: Map<string, number>, planId: string, delta: 1 | -1): Map<string, number> {
    const next = new Map(counts);
    const n = (next.get(planId) ?? 0) + delta;
    if (n > 0) next.set(planId, n);
    else next.delete(planId);
    return next;
}

export function PlanCardRegistryProvider({ children }: { children: ReactNode }) {
    const [counts, setCounts] = useState<Map<string, number>>(() => new Map());
    const register = useCallback((planId: string) => {
        setCounts((c) => countReducer(c, planId, 1));
        return () => setCounts((c) => countReducer(c, planId, -1));
    }, []);
    const value = useMemo<Registry>(() => ({ shown: new Set(counts.keys()), register }), [counts, register]);
    return <PlanCardRegistry.Provider value={value}>{children}</PlanCardRegistry.Provider>;
}

/** Marks the plan's card as shown while it is mounted (no-op outside a provider or when `active` is false). */
export function useRegisterPlanCard(planId: string, active: boolean) {
    const reg = useContext(PlanCardRegistry);
    const register = reg?.register;
    useEffect(() => {
        if (!register || !active) return;
        return register(planId);
    }, [register, planId, active]);
}

/** The plans whose card the current view shows. */
export function useShownPlanCards(): ReadonlySet<string> {
    return useContext(PlanCardRegistry)?.shown ?? EMPTY;
}

const EMPTY: ReadonlySet<string> = new Set();

/** Scrolls to the plan's card in the transcript; false when the view shows none. */
export function scrollToPlanCard(planId: string, root: ParentNode = document): boolean {
    const el = root.querySelector<HTMLElement>(`[data-testid="agent-plan-card"][data-plan-id="${CSS.escape(planId)}"]`);
    if (!el) return false;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.focus({ preventScroll: true });
    return true;
}
