// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { useCallback, useSyncExternalStore } from 'react';

import { useAgentOptional } from './AgentContext';

// "Always show thinking": a per-viewer convenience in localStorage, one value per gateway user. Storage may be
// missing or throw (private window, blocked site data); then the setting lasts only for this page.

const PREFIX = 'agentAlwaysShowThinking';
const memory = new Map<string, boolean>();
const listeners = new Set<() => void>();

/** Storage key of the setting for a user (gateway subject or user name; "anonymous" without session). */
export function thinkingPrefKey(user: string | undefined): string {
    return `${PREFIX}:${user || 'anonymous'}`;
}

export function readAlwaysShow(key: string): boolean {
    try {
        const v = localStorage.getItem(key);
        if (v !== null) return v === 'true';
    } catch {
        // fall back to the value of this page
    }
    return memory.get(key) ?? false;
}

export function writeAlwaysShow(key: string, value: boolean) {
    memory.set(key, value);
    try {
        if (value) localStorage.setItem(key, 'true');
        else localStorage.removeItem(key);
    } catch {
        // kept in memory only
    }
    listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    const onStorage = (e: StorageEvent) => {
        if (e.key?.startsWith(PREFIX)) listener();
    };
    window.addEventListener('storage', onStorage);
    return () => {
        listeners.delete(listener);
        window.removeEventListener('storage', onStorage);
    };
}

/** The setting of the signed-in user and its setter; all thinking blocks follow a change at once. */
export function useAlwaysShowThinking(): [boolean, (value: boolean) => void] {
    const me = useAgentOptional()?.me;
    const key = thinkingPrefKey(me?.sub ?? me?.username);
    const value = useSyncExternalStore(subscribe, () => readAlwaysShow(key));
    const set = useCallback((v: boolean) => writeAlwaysShow(key, v), [key]);
    return [value, set];
}
