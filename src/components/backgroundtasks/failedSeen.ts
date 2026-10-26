// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Which failed platform tasks the user has already seen (issue #228). The footer shows red only for failures that were
// not in the list when the drawer was last opened; old failures stay in the list but no longer shout. The ids are kept
// in this browser (`localStorage`), like the agent mark of #173. Display only.

import { useCallback, useEffect, useState } from 'react';

import { IBackgroundTask } from '../../types/IBackgroundTask';
import { TaskStatus } from '../../types/TaskStatus';

export const FAILED_SEEN_KEY = 'tasksFailedSeen';
export const FAILED_SEEN_MAX = 200;

/** The remembered ids; undefined when the key is missing or unreadable (both count as "never opened"). */
export function readFailedSeen(): number[] | undefined {
    try {
        const raw = localStorage.getItem(FAILED_SEEN_KEY);
        if (raw === null) return undefined;
        const ids = (JSON.parse(raw) as { ids?: unknown } | null)?.ids;
        if (!Array.isArray(ids)) return undefined;
        return ids.filter((n): n is number => Number.isSafeInteger(n));
    } catch {
        return undefined;
    }
}

/** Remembers the newest FAILED_SEEN_MAX ids (the higher the id, the newer). */
export function writeFailedSeen(ids: number[]): void {
    try {
        const kept = [...new Set(ids)].sort((a, b) => a - b).slice(-FAILED_SEEN_MAX);
        localStorage.setItem(FAILED_SEEN_KEY, JSON.stringify({ ids: kept }));
    } catch {
        // storage unavailable: the failures count as new after a reload, nothing else
    }
}

const failedOf = (tasks: IBackgroundTask[]) => tasks.filter((t) => t.status === TaskStatus.failed);

/** The failed tasks whose ids are not in `seen`. */
export function unseenFailed(tasks: IBackgroundTask[], seen: number[]): IBackgroundTask[] {
    const known = new Set(seen);
    return failedOf(tasks).filter((t) => !known.has(t.id));
}

/** Tooltip of the footer button. */
export function footerTooltip(unseen: IBackgroundTask[]): string {
    if (unseen.length === 0) {
        return 'Background tasks of the platform: uploads, conversions, builds, training starts, deployments · click to show them';
    }
    if (unseen.length === 1) {
        const title = unseen[0].title?.trim();
        return `1 task failed since you last looked${title ? `: ${title}` : ''} · click to show it`;
    }
    return `${unseen.length} tasks failed since you last looked · click to show them`;
}

/**
 * The unseen failures of the list. Without a remembered set (first visit in this browser) all failures present once
 * the server list has arrived (`loaded`) count as seen, so old failures do not appear as news.
 */
export function useFailedSeen(
    tasks: IBackgroundTask[],
    loaded: boolean,
): { unseen: IBackgroundTask[]; markSeen: () => void } {
    const [seen, setSeen] = useState<number[] | undefined>(() => readFailedSeen());

    useEffect(() => {
        if (!loaded || seen !== undefined) return;
        const ids = failedOf(tasks).map((t) => t.id);
        writeFailedSeen(ids);
        setSeen(ids);
    }, [loaded, seen, tasks]);

    const markSeen = useCallback(() => {
        const ids = [...(seen ?? []), ...failedOf(tasks).map((t) => t.id)];
        writeFailedSeen(ids);
        setSeen(ids);
    }, [seen, tasks]);

    return { unseen: seen === undefined ? [] : unseenFailed(tasks, seen), markSeen };
}
