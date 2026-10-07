// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// "Search chats" in the panel's chat selector (issue #54): filters the chats by title and the open chat's subagents
// by theirs. Pure logic, used by ChatSelector.

/** Without a search the list shows this many chats (the newest), as before (issue #51). */
export const CHAT_LIST_LIMIT = 20;

/** Lower case with whitespace collapsed, so "  mnist   data" finds "MNIST data". */
export function normalizeQuery(q: string): string {
    return q.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Whether a title matches: every word of the query occurs in it, in any order. An empty query matches everything. */
export function titleMatches(title: string, query: string): boolean {
    const q = normalizeQuery(query);
    if (!q) return true;
    const t = normalizeQuery(title);
    return q.split(' ').every((w) => t.includes(w));
}

export type ChatSearchResult<C, S> = {
    /** Chats to list, in the given order. */
    chats: C[];
    /** Subagents of the open chat to list under it; undefined: as the group's own open state says. */
    subagents?: S[];
    /** More chats exist than the list shows (no search, beyond the limit). */
    more: boolean;
};

/**
 * Filters the chat list for the search field. Without a query: the first CHAT_LIST_LIMIT chats, plus the selected one
 * if it is older, subagents as the group says. With a query: every chat whose title matches, and the open chat also
 * when one of its subagents matches; those subagents are then listed (the group opens for them), the others are not.
 * Only the open chat's subagents are known to the frontend, so only they can be found.
 */
export function searchChats<C extends { id: string; title: string }, S extends { title: string }>(
    chats: C[],
    query: string,
    open: { chatId?: string; selectedChatId?: string; subagents: S[] },
): ChatSearchResult<C, S> {
    const q = normalizeQuery(query);
    if (!q) {
        const shown = chats.slice(0, CHAT_LIST_LIMIT);
        const selected = chats.find((c) => c.id === open.selectedChatId);
        if (selected && !shown.includes(selected)) shown.push(selected);
        return { chats: shown, more: chats.length > shown.length };
    }
    const subs = open.subagents.filter((s) => titleMatches(s.title, q));
    const shown = chats.filter((c) => titleMatches(c.title, q) || (c.id === open.chatId && subs.length > 0));
    return { chats: shown, subagents: subs, more: false };
}
