// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { useCallback, useMemo, useState } from 'react';

import { useAgent } from './AgentContext';
import { cachedRuns, summaryNav } from './chatSubagents';
import type { SubagentNavItem } from './subagents';
import type { Chat } from './types';
import { useNow } from './useNow';

/** The group of subagents under a chat that is not open (issue #60). */
export type OtherChatGroup = {
    open: boolean;
    /** The short list is on its way (and nothing cached to show meanwhile). */
    loading: boolean;
    error?: string;
    /** Sub-entries once loaded (also while a reload runs). */
    items?: SubagentNavItem[];
};

export type ChatSubagentGroups = {
    group: (chat: Chat) => OtherChatGroup;
    /** Opens or closes a chat's group; opening loads its short list unless the cached one is current. */
    toggle: (chat: Chat) => void;
    /** Loaded sub-entries per chat, for "Search chats". */
    known: Record<string, SubagentNavItem[]>;
};

/**
 * Subagents of the chats that are not open, for the panel's chat selector and the history of /ai-agent: each keeps
 * its own open groups (closed by default), the short lists are shared through AgentContext. Expanding only reads the
 * list; it never opens or wakes the chat.
 */
export function useChatSubagentGroups(chats: Chat[]): ChatSubagentGroups {
    const { chatRuns, loadChatRuns } = useAgent();
    const [openIds, setOpenIds] = useState<Record<string, boolean>>({});
    const anyLive = Object.values(chatRuns).some((e) => e.status === 'loaded' && e.live);
    const now = useNow(anyLive, 2000);
    const known = useMemo(() => {
        const out: Record<string, SubagentNavItem[]> = {};
        for (const c of chats) {
            const runs = cachedRuns(chatRuns[c.id]);
            if (runs) out[c.id] = summaryNav(runs, c.id, { chatRunning: !!c.running, now });
        }
        return out;
    }, [chats, chatRuns, now]);
    const group = useCallback(
        (chat: Chat): OtherChatGroup => {
            const entry = chatRuns[chat.id];
            const items = known[chat.id];
            return {
                open: !!openIds[chat.id],
                loading: entry?.status === 'loading' && !items,
                error: entry?.status === 'error' ? entry.error : undefined,
                items,
            };
        },
        [chatRuns, known, openIds],
    );
    const toggle = useCallback(
        (chat: Chat) => {
            const opening = !openIds[chat.id];
            setOpenIds((o) => ({ ...o, [chat.id]: opening }));
            if (opening) loadChatRuns(chat.id);
        },
        [openIds, loadChatRuns],
    );
    return { group, toggle, known };
}
