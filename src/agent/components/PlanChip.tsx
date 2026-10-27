// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The plan of a chat in the status row of the header (issue #221): a ring of the steps done and "Plan 3/10"; a click
// opens the plan dialog (page and panel alike, issue #250); the ring moves while a step runs. It replaces the plan indicator and the plan button, which
// meant the same plan. Shown as long as the chat has plans.

import useMediaQuery from '@mui/material/useMediaQuery';
import Box from '@mui/material/Box';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import TaskAltIcon from '@mui/icons-material/TaskAlt';

import { doneSteps } from '../plan';
import type { Plan } from '../plan';
import { headerPlan, planTone } from '../planButton';
import { indicatorTooltip, planActive, runningStepTooltip } from '../planText';
import HeaderStatusButton, { TONE_COLOR } from './HeaderStatusButton';
import { agentColors } from './tokens';

/** The ring of the steps done: the context ring's geometry, the stroke in the colour of the tone. */
function PlanRing({ ratio, color, active }: { ratio: number; color: string; active?: boolean }) {
    const r = 7;
    const c = 2 * Math.PI * r;
    return (
        <Box component="svg" viewBox="0 0 18 18" aria-hidden sx={{
                width: 18,
                height: 18,
                display: 'block',
                '@keyframes agentPlanSpin': { to: { transform: 'rotate(360deg)' } },
                '& .agent-plan-ring-active': {
                    transformOrigin: '9px 9px',
                    animation: 'agentPlanSpin 1.4s linear infinite',
                },
                '@media (prefers-reduced-motion: reduce)': {
                    '& .agent-plan-ring-active': {
                        animation: 'none',
                        strokeDasharray: '2 3',
                        strokeOpacity: 0.7,
                    },
                },
            }}
        >
            <circle cx="9" cy="9" r={r} fill="none" strokeWidth="2.5" stroke="#e0e0e0" />
            {ratio > 0 && (
                <circle
                    cx="9"
                    cy="9"
                    r={r}
                    fill="none"
                    strokeWidth="2.5"
                    strokeLinecap={ratio < 1 ? 'round' : 'butt'}
                    stroke={color}
                    strokeDasharray={`${c * Math.max(ratio, 0.02)} ${c}`}
                    transform="rotate(-90 9 9)"
                />
            )}
            {active && (
                // a short arc circling over the ring while a step runs; reduced motion: no circling, a dashed ring
                <circle
                    className="agent-plan-ring-active"
                    data-testid="agent-plan-ring-active"
                    cx="9"
                    cy="9"
                    r={r}
                    fill="none"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    stroke={color}
                    strokeOpacity={0.5}
                    strokeDasharray={`${c * 0.2} ${c * 0.8}`}
                />
            )}
        </Box>
    );
}

export default function PlanChip({
    plans,
    pending,
    compact,
    open,
    onOpen,
}: {
    plans: Plan[] | undefined;
    pending: ReadonlySet<string>;
    /** The chat has a training search in the 400 px panel: the word "Plan" gives way. */
    compact?: boolean;
    open?: boolean;
    onOpen: (plan: Plan) => void;
}) {
    // on a phone the header has no room for the word either
    const narrow = useMediaQuery('(max-width: 599.95px)');
    const now = Date.now();
    const plan = headerPlan(plans ?? [], now, pending);
    if (!plan) return null;
    const tone = planTone(plan, now, pending);
    const total = plan.steps.length;
    const done = doneSteps(plan);
    const color = TONE_COLOR[tone];
    const icon =
        plan.state === 'completed' ? (
            <TaskAltIcon aria-hidden sx={{ fontSize: 18, color: agentColors.ok }} />
        ) : plan.state === 'failed' ? (
            <ErrorOutlineIcon aria-hidden sx={{ fontSize: 18, color: agentColors.red }} />
        ) : (
            <PlanRing ratio={total > 0 ? done / total : 0} color={color} active={planActive(plan)} />
        );
    const label = compact || narrow ? `${done}/${total}` : `Plan ${done}/${total}`;
    const tooltip = runningStepTooltip(plan, now) ?? indicatorTooltip(plan, pending);
    return (
        <HeaderStatusButton
            icon={icon}
            label={label}
            tone={tone}
            open={open}
            onClick={() => onOpen(plan)}
            ariaLabel={tooltip}
            tooltip={tooltip}
            testId="agent-plan-chip"
            dataAttrs={{ 'data-plan-id': plan.id, 'data-plan-state': plan.state }}
        />
    );
}
