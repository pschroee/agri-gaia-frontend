// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { useEffect, useState } from 'react';

import type { Plan } from './plan';

const MAX_TIMER_MS = 2147483647;

/**
 * The plans of a chat as the stream holds them (issue #166). While an approved plan is valid, the hook re-renders when
 * its validity ends, so its label turns to "Expired" on time.
 */
export function usePlans(plans: Plan[]): Plan[] {
    const [tick, setTick] = useState(0);

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
