// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Robot icon and state of a subagent (issue #48), shared by the sub-entries, the step links and the read-only line.
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import StopCircleOutlinedIcon from '@mui/icons-material/StopCircleOutlined';

import { isLiveStatus, runStatusLabel } from '../subagents';
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

/**
 * State of a subagent: a dot (spinner while it runs) and the short text. A stopped run the user stopped shows the
 * stop sign and "stopped by you" instead of the dot and "ended" (issue #120, L4); `compact` keeps it short ("stopped")
 * where the title needs the room. While a stop is on its way it reads "stopping …".
 */
export function SubagentState({
    status,
    stoppedBy,
    stopping,
    compact = false,
}: {
    status: RunStatus;
    /** Who stopped the run (issue #120): "user" or "limit"; missing: not stopped. */
    stoppedBy?: string;
    /** A stop of this run is on its way (issue #120). */
    stopping?: boolean;
    compact?: boolean;
}) {
    const stopped = status === 'stopped' && !!stoppedBy && !stopping;
    const color = stopping || stopped ? 'text.secondary' : STATE_COLOR[status];
    return (
        <Box
            component="span"
            data-testid="agent-subagent-state"
            data-status={stopping ? 'stopping' : status}
            sx={{ flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: compact ? 11 : 11.5, color, whiteSpace: 'nowrap' }}
        >
            {stopping || isLiveStatus(status) ? (
                <CircularProgress size={10} thickness={5} sx={{ color }} />
            ) : stopped ? (
                <StopCircleOutlinedIcon aria-hidden sx={{ fontSize: compact ? 12 : 13, color, flex: 'none' }} />
            ) : (
                <Box component="span" sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: STATE_COLOR[status] }} />
            )}
            {stopping ? 'stopping …' : runStatusLabel(status, stoppedBy, compact)}
        </Box>
    );
}
