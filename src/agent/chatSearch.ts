// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// "Search chats" in the panel's chat selector (issue #54): filters the chats by title and the subagents by theirs, those
// of the open chat and, since issue #60, those of other chats whose short list has been loaded. Pure logic, used by
// ChatSelector.

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
    /** With a query: matching subagents of other chats by chat id (only chats with a match). */
    others?: Record<string, S[]>;
    /** More chats exist than the list shows (no search, beyond the limit). */
    more: boolean;
};

/**
 * Filters the chat list for the search field. Without a query: the first CHAT_LIST_LIMIT chats, plus the selected one
 * if it is older, subagents as the group says. With a query: every chat whose title matches, and the open chat also
 * when one of its subagents matches; those subagents are then listed (the group opens for them), the others are not.
 * Other chats are found by their subagents the same way once their short list is loaded (`others`, issue #60); the
 * subagents of chats whose list was never loaded are not known and cannot be found.
 */
export function searchChats<C extends { id: string; title: string }, S extends { title: string }>(
    chats: C[],
    query: string,
    open: { chatId?: string; selectedChatId?: string; subagents: S[]; others?: Record<string, S[]> },
): ChatSearchResult<C, S> {
    const q = normalizeQuery(query);
    if (!q) {
        const shown = chats.slice(0, CHAT_LIST_LIMIT);
        const selected = chats.find((c) => c.id === open.selectedChatId);
        if (selected && !shown.includes(selected)) shown.push(selected);
        return { chats: shown, more: chats.length > shown.length };
    }
    const subs = open.subagents.filter((s) => titleMatches(s.title, q));
    const others: Record<string, S[]> = {};
    for (const [id, list] of Object.entries(open.others ?? {})) {
        if (id === open.chatId) continue;
        const hits = list.filter((s) => titleMatches(s.title, q));
        if (hits.length) others[id] = hits;
    }
    const shown = chats.filter(
        (c) => titleMatches(c.title, q) || (c.id === open.chatId && subs.length > 0) || !!others[c.id],
    );
    return { chats: shown, subagents: subs, others, more: false };
}
