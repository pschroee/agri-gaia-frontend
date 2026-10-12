// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

/** Moving chats to the trash and back (issue #76): pure rules, texts and the confirmation rule. */

import { runStateOf } from './runState';
import type { Chat } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The list without the chats in the trash (`trashed_at` set). */
export function dropTrashed<T extends { trashed_at?: string }>(list: T[]): T[] {
    return list.some((c) => c.trashed_at) ? list.filter((c) => !c.trashed_at) : list;
}

/**
 * The chat that takes over when `id` leaves the list: the one below it, else the one above it, else none. An id the
 * list does not contain has no successor.
 */
export function nextChatAfterRemoval(list: { id: string }[], id: string): string | undefined {
    const i = list.findIndex((c) => c.id === id);
    if (i < 0) return undefined;
    return list[i + 1]?.id ?? list[i - 1]?.id;
}

/** "Deleted permanently in 3 days" (rounded up), "Deleted permanently today" below one day; undefined for a bad date. */
export function purgeLabel(purgeAt: string, now: Date = new Date()): string | undefined {
    const t = Date.parse(purgeAt);
    if (Number.isNaN(t)) return undefined;
    const days = Math.ceil((t - now.getTime()) / DAY_MS);
    if (days < 1) return 'Deleted permanently today';
    return `Deleted permanently in ${days} ${days === 1 ? 'day' : 'days'}`;
}

/** The note on the trash page; nothing without a retention (0 or unset: chats stay until deleted by hand). */
export function retentionHint(days: number | undefined): string | undefined {
    if (!days || days <= 0) return undefined;
    return `Chats in the trash are deleted permanently after ${days} ${days === 1 ? 'day' : 'days'}.`;
}

/**
 * Does moving the chat to the trash need a question first? Only while the agent works in it: a running turn, an open
 * approval, or a subagent that runs.
 */
export function needsTrashConfirm(
    chat: Pick<Chat, 'state' | 'running' | 'starting' | 'resuming' | 'pending_approvals' | 'subagents_running'>,
): boolean {
    return (
        runStateOf(chat) !== 'idle' ||
        (chat.pending_approvals ?? 0) > 0 ||
        (chat.subagents_running ?? 0) > 0
    );
}
