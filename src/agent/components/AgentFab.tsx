// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import Badge from '@mui/material/Badge';
import Fab from '@mui/material/Fab';
import Tooltip from '@mui/material/Tooltip';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CloseIcon from '@mui/icons-material/Close';

import { useAgent } from '../AgentContext';
import { AGENT_PANEL_WIDTH, FOOTER_HEIGHT } from './AgentContextPanel';

/** Floating button bottom right that opens and closes the agent context panel. */
export default function AgentFab() {
    const { panelOpen, setPanelOpen, chats } = useAgent();
    const waiting = chats.reduce((n, c) => n + (c.pending_approvals ?? 0), 0);

    // While the panel is open the button sits left of it, so it never covers the input field.
    const right = panelOpen ? AGENT_PANEL_WIDTH + 24 : 24;

    return (
        <Tooltip title={panelOpen ? 'Close AI agent' : 'AI agent'} placement="left">
            <Fab
                color="primary"
                aria-label="AI agent"
                onClick={() => setPanelOpen(!panelOpen)}
                sx={{
                    position: 'fixed',
                    right,
                    bottom: FOOTER_HEIGHT + 20,
                    zIndex: (theme) => theme.zIndex.drawer + 2,
                    transition: 'right 225ms cubic-bezier(0, 0, 0.2, 1)',
                }}
            >
                <Badge color="warning" badgeContent={waiting} invisible={panelOpen || waiting === 0}>
                    {panelOpen ? <CloseIcon /> : <AutoAwesomeIcon />}
                </Badge>
            </Fab>
        </Tooltip>
    );
}
