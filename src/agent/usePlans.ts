// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { useEffect, useState } from 'react';

import { fetchPlans, Plan } from './plan';

const MAX_TIMER_MS = 2147483647;

/**
 * The plans of a chat, loaded again on every change of `trigger` (the caller passes the approvals, the socket calls and
 * whether the chat runs: a plan moves with them). A failed load keeps the plans known so far. While an approved plan is
 * valid, the hook re-renders when its validity ends, so its label turns to "Expired" on time.
 */
export function usePlans(chatId: string | undefined, trigger: unknown[]): Plan[] {
    const [plans, setPlans] = useState<Plan[]>([]);
    const [tick, setTick] = useState(0);

    useEffect(() => {
        if (!chatId) {
            setPlans([]);
            return undefined;
        }
        let cancelled = false;
        fetchPlans(chatId)
            .then((list) => {
                if (!cancelled) setPlans(list);
            })
            .catch(() => {
                // keep the plans known so far
            });
        return () => {
            cancelled = true;
        };
        // trigger has a fixed length (the caller's list of changing values)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chatId, ...trigger]);

    useEffect(() => {
        const now = Date.now();
        const ends = plans
            .filter((p) => p.state === 'approved' && p.expires_at)
            .map((p) => Date.parse(p.expires_at as string))
            .filter((t) => !Number.isNaN(t) && t > now);
        if (ends.length === 0) return undefined;
        const delay = Math.min(Math.min(...ends) - now + 50, MAX_TIMER_MS);
        const t = setTimeout(() => setTick((n) => n + 1), delay);
        return () => clearTimeout(t);
    }, [plans, tick]);

    return plans;
}
