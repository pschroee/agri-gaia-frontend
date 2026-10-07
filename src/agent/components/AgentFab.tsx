// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import Badge from '@mui/material/Badge';
import Fab from '@mui/material/Fab';
import Tooltip from '@mui/material/Tooltip';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CloseIcon from '@mui/icons-material/Close';

import { useAgent } from '../AgentContext';
import { fabBadge } from '../approvalFeed';
import { AGENT_PANEL_WIDTH, FOOTER_HEIGHT } from './AgentContextPanel';

/**
 * Floating button bottom right that opens and closes the agent context panel. While the panel is closed a red
 * badge counts the open approvals of all the user's chats, live from the gateway's stream (approvalFeed.ts).
 */
export default function AgentFab() {
    const { panelOpen, setPanelOpen, pendingApprovalCount } = useAgent();
    const badge = fabBadge(pendingApprovalCount, panelOpen);

    // While the panel is open the button sits left of it, so it never covers the input field.
    const right = panelOpen ? AGENT_PANEL_WIDTH + 24 : 24;

    return (
        <Tooltip title={panelOpen ? 'Close AI agent' : badge.label} placement="left">
            <Fab
                color="primary"
                aria-label={badge.label}
                onClick={() => setPanelOpen(!panelOpen)}
                sx={{
                    position: 'fixed',
                    right,
                    bottom: FOOTER_HEIGHT + 20,
                    zIndex: (theme) => theme.zIndex.drawer + 2,
                    transition: 'right 225ms cubic-bezier(0, 0, 0.2, 1)',
                }}
            >
                <Badge
                    color="error"
                    badgeContent={pendingApprovalCount}
                    max={99}
                    invisible={!badge.visible}
                    data-testid="agent-fab-badge"
                    sx={{ '& .MuiBadge-badge': { bgcolor: 'error.main', color: '#fff', fontWeight: 600 } }}
                >
                    {panelOpen ? <CloseIcon /> : <AutoAwesomeIcon />}
                </Badge>
            </Fab>
        </Tooltip>
    );
}
