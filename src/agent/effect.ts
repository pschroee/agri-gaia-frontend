// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { effectOf, splitCall, type Effect } from './format';
import type { Approval, SocketCall } from './types';

const EFFECTS: readonly string[] = ['read', 'write', 'compute', 'irreversible'];

/** The class the gateway sent, if it is one of the four. */
export function serverEffect(v: unknown): Effect | undefined {
    return typeof v === 'string' && EFFECTS.includes(v) ? (v as Effect) : undefined;
}

/**
 * Class of a platform call: the gateway's value (gateway issue #63), otherwise derived from the method and
 * path, which is all that older entries carry.
 */
export function callEffect(c: Pick<SocketCall, 'detail' | 'effect'>): Effect | undefined {
    const server = serverEffect(c.effect);
    if (server) return server;
    const { method, path } = splitCall(c.detail);
    return method ? effectOf(method, path) : undefined;
}

/** Class of a platform approval (only platform_write); same fallback as callEffect. */
export function approvalEffect(a: Pick<Approval, 'kind' | 'name' | 'effect'>): Effect | undefined {
    if (a.kind !== 'platform_write') return undefined;
    const server = serverEffect(a.effect);
    if (server) return server;
    const { method, path } = splitCall(a.name);
    return method ? effectOf(method, path) : undefined;
}
