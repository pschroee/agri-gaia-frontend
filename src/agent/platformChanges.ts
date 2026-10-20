// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// "Platform changed" (issues #139, #167): the gateway reports every successful writing platform call of the agent
// and every observed job that hands over or ends as the event `platform_changed` on the stream across all chats
// (GET /api/events). The platform pages listen for the areas they show and load their data again. There is no
// polling and no query cache in this frontend, so without this event an open page keeps the state it loaded when it
// was mounted.
//
// The source is the stream across chats, kept open by the agent context whatever chat, page or tab is open: an
// agent working in another chat or a closed panel reports as well. A change by the user or by another user does not.

import { useEffect, useRef } from 'react';


/** Part of the platform a page shows. */
export type PlatformArea =
    | 'datasets'
    | 'models'
    | 'training'
    | 'images'
    | 'edge-devices'
    | 'edge-groups'
    | 'container-templates'
    | 'integrated-services'
    | 'tasks';

/** Path prefix → area, longest first is not needed: no prefix is a prefix of another. */
const AREA_PREFIXES: ReadonlyArray<readonly [string, PlatformArea]> = [
    ['/datasets', 'datasets'],
    ['/models', 'models'],
    ['/train', 'training'],
    ['/container-images', 'images'],
    ['/edge-devices', 'edge-devices'],
    ['/edge-groups', 'edge-groups'],
    ['/inference-container-templates', 'container-templates'],
    ['/integrated-services', 'integrated-services'],
    ['/tasks', 'tasks'],
];

/** One object the gateway reports as changed (names of the gateway's delegation). */
export type PlatformChange = { resource: string; action: string; id?: string };

/** Data of the stream event `platform_changed`. */
export type PlatformChangedEvent = {
    chat_id: string;
    source: string;
    path?: string;
    job_id?: string;
    changes: PlatformChange[];
};

/** Resource of a change → the areas whose pages show it. `api` is resolved by the path (see areasOf). */
const RESOURCE_AREAS: Record<string, PlatformArea[]> = {
    dataset: ['datasets'],
    model: ['models'],
    training: ['training'],
    task: ['training', 'tasks'],
    container_image: ['images'],
    container_template: ['container-templates'],
    container_deployment: ['edge-devices'],
    edge_device: ['edge-devices'],
    notebook: [],
    assessment: [],
    annotation_function: [],
};

/**
 * Area a path belongs to, or undefined. The match is on whole path segments, so "/datasets/16" hits datasets and
 * "/datasetsX" does not. A query string and a trailing slash are ignored.
 */
export function pathArea(path: string): PlatformArea | undefined {
    const p = (path ?? '').split('?')[0].replace(/\/+$/, '');
    for (const [prefix, area] of AREA_PREFIXES) if (p === prefix || p.startsWith(`${prefix}/`)) return area;
    return undefined;
}

/** Areas one change touches. */
export function areasOf(change: PlatformChange, path?: string): PlatformArea[] {
    if (change.resource === 'api') {
        const area = pathArea(change.id || path || '');
        return area ? [area] : [];
    }
    return RESOURCE_AREAS[change.resource] ?? [];
}

/** Reads the data of a stream message; anything that is not a well-formed `platform_changed` gives undefined. */
export function platformChangedOf(raw: string): PlatformChangedEvent | undefined {
    let msg: unknown;
    try {
        msg = JSON.parse(raw);
    } catch {
        return undefined;
    }
    const m = msg as { kind?: unknown; data?: unknown } | null;
    if (!m || m.kind !== 'platform_changed' || !m.data || typeof m.data !== 'object') return undefined;
    const d = m.data as Partial<PlatformChangedEvent>;
    if (typeof d.chat_id !== 'string' || typeof d.source !== 'string' || !Array.isArray(d.changes)) return undefined;
    const changes = d.changes.filter(
        (c): c is PlatformChange => !!c && typeof c.resource === 'string' && typeof c.action === 'string',
    );
    return { chat_id: d.chat_id, source: d.source, path: d.path, job_id: d.job_id, changes };
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

/** Entry for the feed: tells the open pages about every area the event touches. Returns the areas, for tests. */
export function reportPlatformChanged(ev: PlatformChangedEvent): PlatformArea[] {
    const areas = new Set<PlatformArea>();
    for (const c of ev.changes) for (const a of areasOf(c, ev.path)) areas.add(a);
    for (const a of areas) notifyPlatformChange(a);
    return [...areas];
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
