// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Robot icon and state of a subagent (issue #48), shared by the sub-entries, the step links and the read-only line.
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';

import { isLiveStatus, subagentStateText } from '../subagents';
import type { RunStatus } from '../subagents';
import { agentColors } from './tokens';

export const STATE_COLOR: Record<RunStatus, string> = {
    running: agentColors.green,
    idle: agentColors.amberText,
    done: agentColors.ok,
    failed: agentColors.red,
    stopped: 'rgba(0, 0, 0, 0.45)',
};

export function SubagentIcon({ size = 16, muted = false }: { size?: number; muted?: boolean }) {
    return (
        <SmartToyOutlinedIcon
            aria-hidden
            sx={{ fontSize: size, flex: 'none', color: muted ? 'text.secondary' : agentColors.subagent }}
        />
    );
}

/** State of a subagent: a dot (spinner while it runs) and the short text. */
export function SubagentState({ status, compact = false }: { status: RunStatus; compact?: boolean }) {
    return (
        <Box
            component="span"
            data-testid="agent-subagent-state"
            data-status={status}
            sx={{
                flex: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.5,
                fontSize: compact ? 11 : 11.5,
                color: STATE_COLOR[status],
                whiteSpace: 'nowrap',
            }}
        >
            {isLiveStatus(status) ? (
                <CircularProgress size={10} thickness={5} sx={{ color: STATE_COLOR[status] }} />
            ) : (
                <Box component="span" sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: STATE_COLOR[status] }} />
            )}
            {subagentStateText(status)}
        </Box>
    );
}
