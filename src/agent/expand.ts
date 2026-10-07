// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// "Open in agent page" in the context panel header (issue #33): the chat open in the panel moves to the full agent
// page. Pure, so the order of the steps is unit-tested; the panel passes the shared state and react-router's navigate.

/** Route of the agent page; without `?tab=` it opens on the Chat tab. */
export const AGENT_ROUTE = '/ai-agent';

export type ExpandDeps = {
    selectChat: (id: string) => void;
    setPanelOpen: (open: boolean) => void;
    navigate: (path: string) => void;
};

/**
 * Opens `chatId` on the agent page: selects it in the shared state first (the page shows the selected chat), closes
 * the panel and navigates without a reload. Leaving the page's Chat tab again carries the chat back into the panel,
 * open (panelCarry.ts, issue #50). Without a chat it does nothing; the panel shows no expand button then.
 */
export function expandToAgentPage(chatId: string | undefined, deps: ExpandDeps): boolean {
    if (!chatId) return false;
    deps.selectChat(chatId);
    deps.setPanelOpen(false);
    deps.navigate(AGENT_ROUTE);
    return true;
}
