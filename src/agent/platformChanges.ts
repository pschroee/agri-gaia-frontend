// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// "Platform changed" (issue #139): the agent reports every successful writing platform call of the open chat, the
// platform pages listen for the areas they show and load their data again. There is no polling and no query cache
// in this frontend, so without this event an open page keeps the state it loaded when it was mounted.
//
// Only the stream of the selected chat reaches this module: the shared stream provider keeps that one open across
// page changes. An agent working in another chat (or a change by another user) reports nothing here.

import { useEffect, useRef } from 'react';

import { outcomeOf, splitCall } from './format';
import type { SocketCall } from './types';

/** Part of the platform a page shows; the value is the path prefix the platform call started with. */
export type PlatformArea = 'datasets' | 'models' | 'training' | 'images' | 'edge-devices' | 'edge-groups';

/** Path prefix → area, longest first is not needed: no prefix is a prefix of another. */
const AREA_PREFIXES: ReadonlyArray<readonly [string, PlatformArea]> = [
    ['/datasets', 'datasets'],
    ['/models', 'models'],
    ['/train', 'training'],
    ['/container-images', 'images'],
    ['/edge-devices', 'edge-devices'],
    ['/edge-groups', 'edge-groups'],
];

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Area a platform call touched, or undefined. Only writing methods count: a read changes nothing. The match is on
 * whole path segments, so "/datasets/16" hits datasets and "/datasetsX" does not. A query string is ignored.
 */
export function changedArea(method: string, path: string): PlatformArea | undefined {
    if (!WRITE_METHODS.has((method ?? '').toUpperCase())) return undefined;
    const p = (path ?? '').split('?')[0];
    for (const [prefix, area] of AREA_PREFIXES) if (p === prefix || p.startsWith(`${prefix}/`)) return area;
    return undefined;
}

/** Window in which several changes of one area cause a single reload. */
export const CHANGE_WINDOW_MS = 500;

type Listener = (area: PlatformArea) => void;

const listeners = new Set<Listener>();

// One pending flush per area: a plan with ten steps reports ten changes, the open page loads once per area and
// window. The window starts with the first change and is not extended by later ones, so a long plan still shows
// its effect while it runs.
const pending = new Map<PlatformArea, ReturnType<typeof setTimeout>>();

/** Tells the open pages that `area` changed. */
export function notifyPlatformChange(area: PlatformArea): void {
    if (pending.has(area)) return;
    pending.set(
        area,
        setTimeout(() => {
            pending.delete(area);
            for (const cb of [...listeners]) cb(area);
        }, CHANGE_WINDOW_MS),
    );
}

/** Listens for changes; the returned function stops listening. */
export function onPlatformChange(cb: Listener): () => void {
    listeners.add(cb);
    return () => {
        listeners.delete(cb);
    };
}

/**
 * Entry for the chat stream: reports a socket log entry of the open chat. Only a successful platform write of a
 * known area is a change; reads, failures and a channel other than the platform are not. Returns the area it
 * reported, for tests.
 */
export function reportPlatformCall(c: Pick<SocketCall, 'op' | 'detail' | 'result'>): PlatformArea | undefined {
    if (c?.op !== 'platform') return undefined;
    if (outcomeOf(c.result ?? '') !== 'ok') return undefined;
    const { method, path } = splitCall(c.detail ?? '');
    const area = changedArea(method, path);
    if (area) notifyPlatformChange(area);
    return area;
}

/**
 * Loads the page's data again when the agent changes one of `area`'s objects. `area` may be a list (the training
 * page shows datasets too). `reload` is kept in a ref, so the subscription is set up once and the page's load
 * functions need no useCallback.
 */
export function useReloadOnPlatformChange(area: PlatformArea | PlatformArea[], reload: () => void): void {
    const reloadRef = useRef(reload);
    reloadRef.current = reload;
    // the caller passes the areas inline, so the effect depends on their names, not on the array's identity
    const key = Array.isArray(area) ? [...area].sort().join(',') : area;
    useEffect(() => {
        const wanted = key.split(',');
        return onPlatformChange((changed) => {
            if (wanted.includes(changed)) reloadRef.current();
        });
    }, [key]);
}
