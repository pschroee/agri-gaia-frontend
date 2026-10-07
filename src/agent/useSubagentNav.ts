// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { useState } from 'react';

import { useAgent } from './AgentContext';
import { groupOpen, isLiveStatus, runStatus, subagentNav, toggleGroup } from './subagents';
import type { GroupToggle, SubagentNavItem } from './subagents';
import { useNow } from './useNow';

export type SubagentNav = {
    /** Chat whose subagents these are (the open one). */
    chatId?: string;
    items: SubagentNavItem[];
    /** The opened subagent, if any. */
    selected?: SubagentNavItem;
    /** The group under the chat is open (default: while one runs; issue #48, decision 4). */
    open: boolean;
    toggle: () => void;
    select: (runId: string | undefined) => void;
};

/**
 * Sub-entries of the open chat for the panel's chat selector and the history of /ai-agent: titles, states (ticking
 * while a run is live) and the open state of the group with the user's toggle.
 */
export function useSubagentNav(): SubagentNav {
    const { openChatSubagents, selectedSubagent, selectSubagent } = useAgent();
    const runs = openChatSubagents?.runs ?? [];
    const chatRunning = !!openChatSubagents?.chatRunning;
    const anyLive = chatRunning || runs.some((r) => isLiveStatus(runStatus(r, { chatRunning, now: Date.now() })));
    const now = useNow(anyLive, 2000);
    const items = subagentNav(runs, { chatRunning, now });
    const statuses = items.map((i) => i.status);
    const chatId = openChatSubagents?.chatId;
    const [toggles, setToggles] = useState<Record<string, GroupToggle>>({});
    const selected = selectedSubagent ? items.find((i) => i.runId === selectedSubagent) : undefined;
    const open = groupOpen(statuses, chatId ? toggles[chatId] : undefined, !!selected);
    const toggle = () => {
        if (!chatId) return;
        setToggles((t) => ({ ...t, [chatId]: toggleGroup(statuses, t[chatId], !!selected) }));
        // closing the group with the opened subagent in it goes back to the chat
        if (selected) selectSubagent(undefined);
    };
    return { chatId, items, selected, open, toggle, select: selectSubagent };
}
