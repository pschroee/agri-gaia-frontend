// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// "Search chats" in the panel's chat selector (issue #54): filters the chats by title and the subagents by theirs, those
// of the open chat and, since issue #60, those of other chats whose short list has been loaded. Since issue #122 the
// same function serves the history of /ai-agent, with a limit of its own and the number of chats it leaves out. Pure
// logic, used by ChatSelector and AgentPage.

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
    /**
     * How many chats the list leaves out (no search, beyond the limit). A selected older chat that is appended is
     * shown and therefore does not count; with a search everything matching is shown, so it is 0 (issue #122).
     */
    hidden: number;
};

/** "1 older chat" / "5 older chats": the number part of the panel's hint row (issue #122). */
export function olderChatsLabel(n: number): string {
    return `${n} older chat${n === 1 ? '' : 's'}`;
}

/** The sub-entry group the history of /ai-agent lists under one chat (issue #122). */
export type HistoryGroup<S> = {
    /** Sub-entries to list; empty: the group shows its note (loading, failed, none). */
    subagents: S[];
    /** The group is open (its sub-entries or its note are shown). */
    open: boolean;
};

/**
 * What the history of /ai-agent lists under each of the chats the search kept (issue #122). Pure, so the page's rule is
 * testable without React; today's rule (only the open chat shows its subagents, another chat on its own toggle) stays
 * for the list without a search, and the search replaces it: only the matching subagents, group open, a chat that
 * matches by its title alone without any.
 */
export function historyGroups<C extends { id: string }, S extends { title: string }>(
    result: ChatSearchResult<C, S>,
    open: {
        /** Chat whose subagents are the open one's; another chat is looked up in `other`. */
        openChatId?: string;
        /** The open chat's own sub-entries (all of them) and its group's stored state. */
        openChat: { items: S[]; open: boolean };
        /** The chats that are not open: their loaded sub-entries and their group's stored state (issue #60). */
        other: (chatId: string) => { items?: S[]; open: boolean };
    },
): Record<string, HistoryGroup<S>> {
    const out: Record<string, HistoryGroup<S>> = {};
    for (const c of result.chats) {
        if (result.subagents !== undefined) {
            // a search lists only the matches and opens their group; a title match alone gets no sub-entries
            const items = c.id === open.openChatId ? result.subagents : (result.others?.[c.id] ?? []);
            if (items.length) out[c.id] = { subagents: items, open: true };
            continue;
        }
        if (c.id === open.openChatId) {
            if (open.openChat.items.length) out[c.id] = { subagents: open.openChat.items, open: open.openChat.open };
            continue;
        }
        const g = open.other(c.id);
        if (g.open || g.items?.length) out[c.id] = { subagents: g.items ?? [], open: g.open };
    }
    return out;
}

/**
 * Filters the chat list for the search field. Without a query: the first `limit` chats (the panel's CHAT_LIST_LIMIT, the
 * agent page's whole list), plus the selected one if it is older, subagents as the group says. With a query: every chat
 * whose title matches, and the open chat also when one of its subagents matches; those subagents are then listed (the
 * group opens for them), the others are not. Other chats are found by their subagents the same way once their short
 * list is loaded (`others`, issue #60); the subagents of chats whose list was never loaded are not known and cannot be
 * found.
 */
export function searchChats<C extends { id: string; title: string }, S extends { title: string }>(
    chats: C[],
    query: string,
    open: { chatId?: string; selectedChatId?: string; subagents: S[]; others?: Record<string, S[]> },
    opts?: { limit?: number },
): ChatSearchResult<C, S> {
    const q = normalizeQuery(query);
    if (!q) {
        const shown = chats.slice(0, opts?.limit ?? CHAT_LIST_LIMIT);
        const selected = chats.find((c) => c.id === open.selectedChatId);
        if (selected && !shown.includes(selected)) shown.push(selected);
        const hidden = chats.length - shown.length;
        return { chats: shown, more: hidden > 0, hidden };
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
    return { chats: shown, subagents: subs, others, more: false, hidden: 0 };
}
