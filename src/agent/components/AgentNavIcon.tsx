// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import Badge from '@mui/material/Badge';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';

import { useAgentOptional } from '../AgentContext';
import { navBadge } from '../approvalFeed';

/** Count and label of the side navigation's "Agent" entry; without the agent provider nothing waits. */
export function useAgentNavBadge(): { count: number; visible: boolean; label: string } {
    const count = useAgentOptional()?.pendingApprovalCount ?? 0;
    return { count, ...navBadge(count) };
}

/**
 * Icon of the "Agent" entry in the side navigation with the red count of open approvals across all the user's
 * chats, the same number as on the floating button (approvalFeed.ts). It sits on the icon, so it stays readable
 * when the navigation is collapsed to icons. The entry's aria-label carries the count; the badge itself is hidden
 * from assistive technology so the number is not read twice.
 */
export default function AgentNavIcon() {
    const { count, visible } = useAgentNavBadge();
    return (
        <Badge
            color="error"
            badgeContent={count}
            max={99}
            invisible={!visible}
            data-testid="agent-nav-badge"
            aria-hidden
            sx={{ '& .MuiBadge-badge': { bgcolor: 'error.main', color: '#fff', fontWeight: 600 } }}
        >
            <AutoAwesomeIcon />
        </Badge>
    );
}
