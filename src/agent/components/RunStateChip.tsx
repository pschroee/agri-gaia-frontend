// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip';

import { RUN_STATE_HINT, formatElapsed, isLoading, isRunning, runStateText } from '../runState';
import type { RunState } from '../runState';
import { useNow } from '../useNow';
import { agentColors } from './tokens';

export const RUN_STATE_COLOR: Record<RunState, string> = {
    working: agentColors.green,
    waiting: agentColors.amberText,
    // loading is subtle: grey, the steps show in the transcript
    starting: agentColors.muted,
    resuming: agentColors.muted,
    // never shown (issue #35)
    idle: agentColors.ok,
};

/** Dot or spinner in front of the state. Working pulses. */
export function RunStateIcon({ state, size = 8 }: { state: RunState; size?: number }) {
    const color = RUN_STATE_COLOR[state];
    if (isLoading(state)) return <CircularProgress size={size + 3} sx={{ color, flex: 'none' }} />;
    return (
        <Box
            component="span"
            aria-hidden
            sx={{
                flex: 'none',
                width: size,
                height: size,
                borderRadius: '50%',
                bgcolor: color,
                boxSizing: 'border-box',
                ...(isRunning(state) && {
                    animation: 'agentRunPulse 1.6s ease-in-out infinite',
                    '@keyframes agentRunPulse': {
                        '0%, 100%': { boxShadow: `0 0 0 0 ${color}55` },
                        '50%': { boxShadow: `0 0 0 4px ${color}00` },
                    },
                }),
            }}
        />
    );
}

/** Running timer "1:05"; re-renders every second while `since` is known. */
export function Elapsed({ since }: { since?: number }) {
    const now = useNow(since !== undefined, 1000);
    if (since === undefined) return null;
    return (
        <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums' }}>
            {formatElapsed(now - since)}
        </Box>
    );
}

type Props = {
    state: RunState | undefined;
    /** Start of the running turn (ms), for the timer. */
    since?: number;
    /** Framed chip (panel header, chat header) instead of plain text (lists); its waiting label is shorter. */
    framed?: boolean;
};

/**
 * State of a chat with its timer, for the chat list, the chat selector, the panel header and the chat header of
 * /ai-agent. Renders nothing for a ready chat (issue #35): only working, waiting for approval and loading show.
 */
export default function RunStateChip({ state, since, framed = false }: Props) {
    const label = runStateText(state, framed ? 'header' : 'list');
    if (!state || !label) return null;
    const color = RUN_STATE_COLOR[state];
    const running = isRunning(state);
    return (
        <Tooltip title={RUN_STATE_HINT[state]}>
            <Box
                component="span"
                data-run-state={state}
                sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.6,
                    whiteSpace: 'nowrap',
                    // in a tight header the label gives way (ellipsis), icon and timer stay
                    maxWidth: '100%',
                    minWidth: 0,
                    boxSizing: 'border-box',
                    fontSize: framed ? 12 : 11,
                    color,
                    ...(framed && {
                        border: 1,
                        borderColor: state === 'waiting' ? agentColors.amberLine : 'divider',
                        bgcolor: state === 'waiting' ? agentColors.amberTint : '#fff',
                        borderRadius: 3,
                        px: 1,
                        py: '2px',
                    }),
                }}
            >
                <RunStateIcon state={state} size={framed ? 8 : 7} />
                <Box component="span" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {label}
                </Box>
                {running && since !== undefined && (
                    <Box component="span" sx={{ flex: 'none', display: 'inline-flex', gap: 0.6 }}>
                        <span>·</span>
                        <Elapsed since={since} />
                    </Box>
                )}
            </Box>
        </Tooltip>
    );
}
