// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The status of a plan in the Plans table (issue #250): the pattern of the experiments table (symbol and one whole
// word, never shortened); the note under it (paused why, waits for approval) stays a second line.

import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import HourglassEmptyOutlinedIcon from '@mui/icons-material/HourglassEmptyOutlined';
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline';
import StopCircleOutlinedIcon from '@mui/icons-material/StopCircleOutlined';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';

import type { Plan } from '../../plan';
import { planStatusView } from '../../plansOverview';
import { agentColors } from '../tokens';

export default function PlanStatusCell({ plan, pending }: { plan: Plan; pending: ReadonlySet<string> }) {
    const v = planStatusView(plan, pending);
    const icon =
        v.icon === 'spinner' ? (
            <CircularProgress size={14} thickness={5} aria-hidden />
        ) : v.icon === 'attention' ? (
            <HourglassEmptyOutlinedIcon fontSize="small" sx={{ color: agentColors.amberText }} />
        ) : v.icon === 'paused' ? (
            <PauseCircleOutlineIcon fontSize="small" color="warning" />
        ) : v.icon === 'done' ? (
            <CheckCircleIcon fontSize="small" color="success" />
        ) : v.icon === 'failed' ? (
            <ErrorIcon fontSize="small" color="error" />
        ) : (
            <StopCircleOutlinedIcon fontSize="small" color="disabled" />
        );
    return (
        <Box
            data-testid="agent-plan-state"
            data-plan-state={plan.state}
            sx={{
                display: 'inline-flex',
                alignItems: 'center',
                columnGap: 0.75,
                fontSize: 14,
                whiteSpace: 'nowrap',
                color: v.icon === 'attention' ? agentColors.amberText : undefined,
            }}
        >
            {icon}
            <span>{v.label}</span>
        </Box>
    );
}
