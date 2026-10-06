// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

import { AgentProvider, useAgentOptional } from '../AgentContext';
import { agentEnabled } from '../api';
import AgentContextPanel, { AGENT_PANEL_WIDTH } from './AgentContextPanel';
import AgentFab from './AgentFab';
import AgentMenuTheme from './AgentMenuTheme';

export const AGENT_ROUTE = '/ai-agent';

/** Wraps the platform layout with the agent state when the build flag VITE_AGENT_ENABLED is set. */
export function AgentProviderIfEnabled({ children }: { children: ReactNode }) {
    return agentEnabled ? <AgentProvider>{children}</AgentProvider> : <>{children}</>;
}

const onAgentPage = (pathname: string) => pathname === AGENT_ROUTE || pathname.startsWith(`${AGENT_ROUTE}/`);

/** Right margin the main content keeps free for the open context panel. */
export function useAgentPanelMargin(): number {
    const agent = useAgentOptional();
    const { pathname } = useLocation();
    return agent?.panelOpen && !onAgentPage(pathname) ? AGENT_PANEL_WIDTH : 0;
}

/** Floating button and context panel; not shown on the agent page itself, which has the full chat. */
export default function AgentLayer() {
    const { pathname } = useLocation();
    if (onAgentPage(pathname)) return null;
    return (
        <AgentMenuTheme>
            <AgentContextPanel />
            <AgentFab />
        </AgentMenuTheme>
    );
}
