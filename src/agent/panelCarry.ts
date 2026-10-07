// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// One "current chat" for the agent page and the context panel (issue #50). The selected chat lives once in
// AgentContext; this module decides when the panel shows and where the chat's stream is needed. Leaving the Chat tab
// of /ai-agent with a chat open carries it into the panel: the panel is already open on the next platform page. A
// close with × (or the floating button) ends that until the user comes from the Chat tab again. Pure, unit-tested.

import { AGENT_ROUTE } from './expand';

/** The agent page itself (it has the full chat; the panel and the floating button are not shown there). */
export const onAgentPage = (pathname: string) => pathname === AGENT_ROUTE || pathname.startsWith(`${AGENT_ROUTE}/`);

export type AgentTab = 'chat' | 'activity' | 'status';

/** Tab of the agent page from `?tab=`; anything else is the Chat tab. */
export const agentTabOf = (v: string | null): AgentTab => (v === 'activity' || v === 'status' ? v : 'chat');

const tabOfSearch = (search: string) => agentTabOf(new URLSearchParams(search).get('tab'));

/** Shows the agent page its Chat tab at this location? */
export const onAgentChatTab = (pathname: string, search: string) =>
    onAgentPage(pathname) && tabOfSearch(search) === 'chat';

export type PanelState = {
    /** The user's own choice: opened with the floating button, closed with × or the button. */
    open: boolean;
    /** The user is on, or came from, the Chat tab of /ai-agent with a chat open: the panel continues it. */
    carry: boolean;
};

export type PanelAction =
    /** Floating button, ×, "Open in agent page": an explicit choice, which also ends a carried chat. */
    | { type: 'set'; open: boolean }
    /** The location (or the selected chat) changed. */
    | { type: 'route'; pathname: string; search: string; hasChat: boolean };

/**
 * On the agent page the carry follows the page: set on the Chat tab with a chat, cleared on Activity and Status or
 * without a chat (then the panel behaves as before, i.e. as the user left it). On platform pages it stays as it was,
 * so navigating between them neither opens a closed panel nor closes a carried one.
 */
export function panelReducer(s: PanelState, a: PanelAction): PanelState {
    if (a.type === 'set') return s.open === a.open && !s.carry ? s : { open: a.open, carry: false };
    if (!onAgentPage(a.pathname)) return s;
    const carry = a.hasChat && tabOfSearch(a.search) === 'chat';
    return carry === s.carry ? s : { ...s, carry };
}

/** Is the panel open (on platform pages; on the agent page it is never shown)? */
export const panelShown = (s: PanelState) => s.open || s.carry;

/**
 * Is the selected chat on screen at this location, so its stream is needed? Everywhere but the agent page the panel
 * holds it (mounted also while closed, as the persistent drawer always was); on the agent page only the Chat tab.
 * The stream lives above both views, so it survives the move from page to panel and back: no new load, no second
 * resume, and an answer that streams keeps streaming.
 */
export const chatShownAt = (pathname: string, search: string) =>
    !onAgentPage(pathname) || tabOfSearch(search) === 'chat';
