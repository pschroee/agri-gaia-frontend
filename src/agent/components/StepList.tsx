// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import CheckIcon from '@mui/icons-material/Check';
import BlockIcon from '@mui/icons-material/Block';
import CloseIcon from '@mui/icons-material/Close';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import RemoveIcon from '@mui/icons-material/Remove';

import { formatMs } from '../format';
import type { Step, StepStatus } from '../transcript';
import { agentColors, blockSx, MONO } from './tokens';

const STATUS_LABEL: Record<StepStatus, string> = {
    running: 'running',
    done: 'done',
    error: 'failed',
    waiting: 'needs approval',
    blocked: 'blocked',
    stopped: 'not finished',
};

function StatusIcon({ status }: { status: StepStatus }) {
    const sx = { fontSize: 16 };
    switch (status) {
        case 'running':
            return <CircularProgress size={12} thickness={5} sx={{ m: '2px' }} />;
        case 'done':
            return <CheckIcon sx={{ ...sx, color: agentColors.ok }} />;
        case 'waiting':
            return <HourglassEmptyIcon sx={{ ...sx, color: agentColors.amber }} />;
        case 'blocked':
            return <BlockIcon sx={{ ...sx, color: agentColors.red }} />;
        case 'error':
            return <CloseIcon sx={{ ...sx, color: agentColors.red }} />;
        default:
            return <RemoveIcon sx={{ ...sx, color: 'text.disabled' }} />;
    }
}

function headline(steps: Step[]): string {
    const running = steps.some((s) => s.status === 'running');
    const n = steps.length;
    const word = n === 1 ? 'tool call' : 'tool calls';
    return running ? `Working · ${n} ${word}` : `${n} ${word}`;
}

/**
 * Compact list of the tool calls of one agent step, like the "Datensatz analysiert" block of the
 * prototype: status, tool name in monospace, a hint at the arguments and the measured duration.
 */
export default function StepList({ steps }: { steps: Step[] }) {
    const total = steps.reduce((sum, s) => sum + (s.durationMs ?? 0), 0);
    const anyDuration = steps.some((s) => s.durationMs !== undefined);
    return (
        <Box sx={{ ...blockSx, borderLeft: `3px solid ${agentColors.green}`, my: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, pt: 1, pb: 0.75 }}>
                <Typography sx={{ fontSize: 13, fontWeight: 500 }}>{headline(steps)}</Typography>
                {anyDuration && (
                    <Typography
                        sx={{ ml: 'auto', fontSize: 11.5, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}
                    >
                        {formatMs(total)}
                    </Typography>
                )}
            </Box>
            <Box component="ul" sx={{ listStyle: 'none', m: 0, px: 1.5, pb: 1, display: 'grid', rowGap: 0.75 }}>
                {steps.map((s) => (
                    <Box component="li" key={s.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                        <Tooltip title={STATUS_LABEL[s.status]}>
                            <Box sx={{ display: 'flex', flex: 'none' }}>
                                <StatusIcon status={s.status} />
                            </Box>
                        </Tooltip>
                        <Typography component="span" sx={{ fontFamily: MONO, fontSize: 12, flex: 'none' }}>
                            {s.tool}
                        </Typography>
                        {s.summary && (
                            <Typography
                                component="span"
                                noWrap
                                title={s.summary}
                                sx={{ fontSize: 12, color: 'text.secondary', minWidth: 0 }}
                            >
                                {s.summary}
                            </Typography>
                        )}
                        <Typography
                            component="span"
                            sx={{
                                ml: 'auto',
                                pl: 1,
                                flex: 'none',
                                fontSize: 11.5,
                                fontVariantNumeric: 'tabular-nums',
                                color:
                                    s.status === 'blocked' || s.status === 'error'
                                        ? agentColors.red
                                        : s.status === 'waiting'
                                        ? agentColors.amberText
                                        : 'text.disabled',
                            }}
                        >
                            {s.status === 'done' || s.status === 'running'
                                ? formatMs(s.durationMs) ?? ''
                                : STATUS_LABEL[s.status]}
                        </Typography>
                    </Box>
                ))}
            </Box>
        </Box>
    );
}
