// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import HourglassEmptyOutlinedIcon from '@mui/icons-material/HourglassEmptyOutlined';
import StopCircleOutlinedIcon from '@mui/icons-material/StopCircleOutlined';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';

import type { RunState } from '../../experimentRuns';
import { runStateView } from '../../experimentRuns';
import { agentColors } from '../tokens';

/** Symbol and word of a run's state, for the table and the head of a detail. */
export default function RunStateCell({ state }: { state: RunState }) {
    const v = runStateView(state);
    const icon =
        v.icon === 'spinner' ? (
            <CircularProgress size={14} thickness={5} aria-hidden />
        ) : v.icon === 'waiting' ? (
            <HourglassEmptyOutlinedIcon fontSize="small" sx={{ color: agentColors.amberText }} />
        ) : v.icon === 'done' ? (
            <CheckCircleIcon fontSize="small" color="success" />
        ) : v.icon === 'failed' ? (
            <ErrorIcon fontSize="small" color="error" />
        ) : (
            <StopCircleOutlinedIcon fontSize="small" color="disabled" />
        );
    return (
        <Box sx={{ display: 'inline-flex', alignItems: 'center', columnGap: 0.75, fontSize: 14, color: v.tone === 'attention' ? agentColors.amberText : undefined }} data-testid="run-state">
            {icon}
            <span>{v.label}</span>
        </Box>
    );
}
