// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip';
import BedtimeOutlinedIcon from '@mui/icons-material/BedtimeOutlined';

import { RUN_STATE_HINT, RUN_STATE_LABEL, RUN_STATE_SHORT, formatElapsed, isRunning } from '../runState';
import type { RunState } from '../runState';
import { useNow } from '../useNow';
import { agentColors } from './tokens';

export const RUN_STATE_COLOR: Record<RunState, string> = {
    working: agentColors.green,
    waiting: agentColors.amberText,
    resuming: agentColors.green,
    idle: agentColors.ok,
    dormant: '#757575',
};

/** Dot, spinner or moon in front of the state. Working pulses. */
export function RunStateIcon({ state, size = 8 }: { state: RunState; size?: number }) {
    const color = RUN_STATE_COLOR[state];
    if (state === 'resuming') return <CircularProgress size={size + 3} sx={{ color, flex: 'none' }} />;
    if (state === 'dormant') return <BedtimeOutlinedIcon sx={{ fontSize: size + 5, color, flex: 'none' }} />;
    return (
        <Box
            component="span"
            aria-hidden
            sx={{
                flex: 'none',
                width: size,
                height: size,
                borderRadius: '50%',
                bgcolor: state === 'idle' ? 'transparent' : color,
                border: state === 'idle' ? `1.5px solid ${color}` : undefined,
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
    state: RunState;
    /** Start of the running turn (ms), for the timer. */
    since?: number;
    /** Lower-case short label for lists. */
    short?: boolean;
    /** Framed chip (panel header) instead of plain text (lists); its waiting label is shorter ("needs approval"). */
    framed?: boolean;
};

/** State of a chat with its timer, for the chat list, the chat selector and the panel header. */
export default function RunStateChip({ state, since, short = false, framed = false }: Props) {
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
                    fontSize: framed ? 12 : 11,
                    color: state === 'idle' || state === 'dormant' ? 'text.secondary' : color,
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
                {framed && state === 'waiting'
                    ? 'needs approval'
                    : short
                    ? RUN_STATE_SHORT[state]
                    : RUN_STATE_LABEL[state]}
                {running && since !== undefined && (
                    <>
                        <span>·</span>
                        <Elapsed since={since} />
                    </>
                )}
            </Box>
        </Tooltip>
    );
}
