// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The plan environment of a conversation (A-E4, D4.4): the cards get the notify choice of this user. Without it
// the checkbox of a proposed plan renders and its click has nowhere to go (live finding of 17.10.2026).

import { describe, expect, it, vi } from 'vitest';
import { planEnvOf } from './Conversation';

describe('planEnvOf', () => {
    const base = {
        approvals: [],
        jobs: [],
        pending: new Set<string>(),
        layout: 'page' as const,
    };

    it('carries the notify choice into the plan environment', () => {
        const onNotify = vi.fn();
        const notifyOptIn = () => true;
        const env = planEnvOf(base, onNotify, notifyOptIn);
        expect(env.onNotify).toBe(onNotify);
        expect(env.notifyOptIn).toBe(notifyOptIn);
        expect(env.layout).toBe('page');
    });

    it('keeps a view without the choice free of it', () => {
        const env = planEnvOf(base);
        expect(env.onNotify).toBeUndefined();
        expect(env.notifyOptIn).toBeUndefined();
    });
});
