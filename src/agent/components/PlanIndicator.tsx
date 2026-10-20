// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The compact plan display in the chat header (A-E4, design): "Plan 2/4" with a ring of the steps that are done,
// left of the task button. It only points at the plan — every control lives in the card (D4.2) — and it stays
// hidden while the plan is only proposed (the approval covers that) and ten minutes after an end state.

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import useMediaQuery from '@mui/material/useMediaQuery';
import CancelIcon from '@mui/icons-material/Cancel';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';

import { awaitingPlatform, doneSteps, needsInput, Plan } from '../plan';
import { indicatorLabel, indicatorTooltip } from '../planText';

/** Which of the three sizes the chip is drawn for: the 400 px panel, the agent page and a phone. */
export type IndicatorVariant = 'panel' | 'page' | 'mobile';

type Tone = { color: string; text: string };

/** The colour and the mark of the chip per state (design): running/waiting primary, paused/input amber, … */
function toneOf(plan: Plan, pending: ReadonlySet<string>): Tone {
    if (plan.state === 'proposed' && plan.approving) return { color: 'primary.main', text: 'primary' };
    if (plan.state === 'approved') {
        if (needsInput(plan, pending)) return { color: 'warning.main', text: 'warning' };
        return { color: 'primary.main', text: awaitingPlatform(plan) ? 'primary' : 'primary' };
    }
    if (plan.state === 'paused') return { color: 'warning.main', text: 'warning' };
    if (plan.state === 'failed') return { color: 'error.main', text: 'error' };
    if (plan.state === 'completed') return { color: 'success.main', text: 'success' };
    if (plan.state === 'cancelled') return { color: 'text.disabled', text: 'default' };
    return { color: 'text.secondary', text: 'default' };
}

/**
 * The plan of a chat as a compact chip in the chat header. A click jumps to the plan's card (the caller decides
 * where that is); the chip is not rendered for a proposed plan.
 */
export default function PlanIndicator({
    plan,
    variant,
    onShow,
    pending,
    iconOnly,
}: {
    plan: Plan | undefined;
    variant: IndicatorVariant;
    onShow: () => void;
    /** Approvals still pending, by id: a step with such a parked approval makes the chip amber (D2.8). */
    pending?: ReadonlySet<string>;
    /** The chat has a training search (issue #168): in the 400 px panel the plan shrinks to an icon button so both fit. */
    iconOnly?: boolean;
}) {
    // on a phone the panel fills the screen and the header has no room for the words (design)
    const narrow = useMediaQuery('(max-width: 599.95px)');
    if (!plan || (plan.state === 'proposed' && !plan.approving)) return null;
    const size: IndicatorVariant = narrow ? 'mobile' : variant;
    const pendingIds = pending ?? new Set<string>();
    const tooltip = indicatorTooltip(plan, pendingIds);
    const tone = toneOf(plan, pendingIds);
    const total = plan.steps.length;
    const done = doneSteps(plan);
    if (iconOnly && size === 'panel')
        return (
            <Tooltip title={tooltip}>
                <IconButton size="small" data-testid="agent-plan-indicator" data-plan-id={plan.id} data-plan-state={plan.state} aria-label={tooltip} aria-controls="agent-plan-card" onClick={onShow} sx={{ flex: 'none', color: tone.color }}>
                    <FactCheckOutlinedIcon fontSize="small" />
                </IconButton>
            </Tooltip>
        );
    const moving = plan.state === 'approved';
    const mark =
        plan.state === 'completed' ? (
            <CheckCircleIcon sx={{ fontSize: 16, color: 'success.main' }} aria-hidden />
        ) : plan.state === 'failed' ? (
            <ErrorIcon sx={{ fontSize: 16, color: 'error.main' }} aria-hidden />
        ) : plan.state === 'cancelled' ? (
            <CancelIcon sx={{ fontSize: 16, color: 'text.disabled' }} aria-hidden />
        ) : (
            <Box
                sx={{
                    position: 'relative',
                    display: 'inline-flex',
                    borderRadius: '50%',
                    ...(moving
                        ? {
                              animation: 'agPlanPulse 1.8s ease-out infinite',
                              '@keyframes agPlanPulse': {
                                  '0%': { boxShadow: `0 0 0 0 ${tone.color}` },
                                  '70%': { boxShadow: '0 0 0 5px rgba(0,0,0,0)' },
                                  '100%': { boxShadow: '0 0 0 0 rgba(0,0,0,0)' },
                              },
                              '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
                          }
                        : {}),
                }}
            >
                <CircularProgress
                    variant="determinate"
                    size={16}
                    thickness={6}
                    value={total > 0 ? (done / total) * 100 : 0}
                    sx={{ color: tone.color }}
                    aria-hidden
                />
            </Box>
        );
    return (
        <Tooltip title={tooltip}>
            <Chip
                size="small"
                variant="outlined"
                clickable
                color={tone.text === 'default' ? undefined : (tone.text as 'primary' | 'warning' | 'error' | 'success')}
                data-testid="agent-plan-indicator"
                data-plan-id={plan.id}
                data-plan-state={plan.state}
                icon={mark}
                label={indicatorLabel(plan, size)}
                aria-label={tooltip}
                aria-controls="agent-plan-card"
                onClick={onShow}
                sx={{
                    flex: 'none',
                    maxWidth: size === 'page' ? 300 : 'none',
                    '& .MuiChip-label': {
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    },
                }}
            />
        </Tooltip>
    );
}
