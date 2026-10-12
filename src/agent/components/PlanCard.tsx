// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The plan card (issue #70): a plan of several platform calls with one decision by the user. Shown under the answer
// that proposed it, in the panel, on /ai-agent and in the subagent view, and as an item of the approval list.

import { ReactElement, useState } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import ListAltOutlinedIcon from '@mui/icons-material/ListAltOutlined';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';

import { planLabel, stepStatus, STEP_LABEL, Plan, PlanStep, StepStatus } from '../plan';
import type { Approval } from '../types';
import EffectChip from './EffectChip';
import { agentColors, blockSx, MONO } from './tokens';

const STATUS_ICON: Record<StepStatus, ReactElement> = {
    done: <CheckCircleIcon sx={{ fontSize: 17, color: agentColors.green }} aria-hidden />,
    approval: <HourglassEmptyIcon sx={{ fontSize: 17, color: agentColors.amber }} aria-hidden />,
    open: <RadioButtonUncheckedIcon sx={{ fontSize: 17, color: 'text.disabled' }} aria-hidden />,
    running: <CircularProgress size={12} aria-hidden />,
    failed: <ErrorOutlineIcon sx={{ fontSize: 17, color: agentColors.red }} aria-hidden />,
};

const PRE_SX = {
    fontFamily: MONO,
    fontSize: 11.5,
    lineHeight: 1.55,
    bgcolor: agentColors.panelBg,
    border: 1,
    borderColor: 'divider',
    borderRadius: 0.5,
    p: 1,
    mt: 0.5,
    mb: 0,
    maxHeight: 160,
    overflow: 'auto',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
} as const;

/** Parameters of a step, shown folded: query, body and form as they were approved. */
function parameters(step: PlanStep): string | undefined {
    const parts: string[] = [];
    if (step.query && Object.keys(step.query).length > 0) parts.push(`query: ${JSON.stringify(step.query, null, 2)}`);
    if (step.body !== undefined && step.body !== null) parts.push(JSON.stringify(step.body, null, 2));
    if (step.form && Object.keys(step.form).length > 0) parts.push(`form: ${JSON.stringify(step.form, null, 2)}`);
    if (step.files && step.files.length > 0)
        parts.push(step.files.map((f) => `file ${f.field}: ${f.path}  sha256 ${f.sha256}`).join('\n'));
    return parts.length > 0 ? parts.join('\n') : undefined;
}

/** Approve and change buttons; both answer the plan's approval (change rejects it). */
function Decision({ onDecide }: { onDecide: (approve: boolean) => Promise<void> }) {
    const [busy, setBusy] = useState(false);
    const decide = async (approve: boolean) => {
        setBusy(true);
        try {
            await onDecide(approve);
        } finally {
            setBusy(false);
        }
    };
    return (
        <Box sx={{ mt: 1 }}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                <Button size="small" variant="contained" disabled={busy} onClick={() => void decide(true)}>
                    Approve plan
                </Button>
                <Button size="small" variant="outlined" color="secondary" disabled={busy} onClick={() => void decide(false)}>
                    Change
                </Button>
            </Box>
            <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.75 }}>
                Change rejects this plan; tell the agent what to change.
            </Typography>
        </Box>
    );
}

export default function PlanCard({
    plan,
    approval,
    onDecide,
    dense,
}: {
    plan: Plan;
    approval?: Approval;
    onDecide?: (a: Approval, approve: boolean) => Promise<void>;
    dense?: boolean;
}) {
    const now = Date.now();
    const canDecide = plan.state === 'proposed' && approval?.state === 'pending' && !!onDecide;
    return (
        <Box
            data-testid="agent-plan-card"
            data-plan-id={plan.id}
            sx={{
                ...blockSx,
                borderLeft: `3px solid ${plan.state === 'proposed' ? agentColors.amber : agentColors.greenLine}`,
                px: dense ? 1.25 : 1.5,
                py: 1.25,
                minWidth: 0,
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75, minWidth: 0 }}>
                <ListAltOutlinedIcon sx={{ fontSize: 17, color: agentColors.green, mt: '2px', flex: 'none' }} aria-hidden />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap', minWidth: 0 }}>
                        <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>Plan</Typography>
                        <Typography sx={{ fontSize: 13, fontWeight: 600, overflowWrap: 'anywhere', minWidth: 0 }}>
                            {plan.title}
                        </Typography>
                    </Box>
                    <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.25 }}>{planLabel(plan, now)}</Typography>
                </Box>
            </Box>

            <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0, mt: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                {plan.steps.map((step) => {
                    const status = stepStatus(step);
                    return (
                        <Box
                            key={step.idx}
                            component="li"
                            data-testid="agent-plan-step"
                            data-status={status}
                            sx={{ minWidth: 0 }}
                        >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', minWidth: 0 }}>
                                <Typography sx={{ fontSize: 12, color: 'text.secondary', minWidth: 14 }}>{step.idx}</Typography>
                                <EffectChip effect={step.effect} />
                                <Typography
                                    sx={{ fontFamily: MONO, fontSize: 12, overflowWrap: 'anywhere', flex: '1 1 0', minWidth: 0 }}
                                >
                                    {step.method} {step.path}
                                </Typography>
                                <Box
                                    sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flex: 'none', fontSize: 12 }}
                                    title={step.result}
                                >
                                    {STATUS_ICON[status]}
                                    <Typography component="span" sx={{ fontSize: 12 }}>
                                        {STEP_LABEL[status]}
                                    </Typography>
                                </Box>
                            </Box>
                            {step.description && (
                                <Typography sx={{ fontSize: 12.5, color: 'text.secondary', mt: 0.25, overflowWrap: 'anywhere' }}>
                                    {step.description}
                                </Typography>
                            )}
                            {parameters(step) && (
                                <Box component="details" sx={{ mt: 0.5 }}>
                                    <Box component="summary" sx={{ fontSize: 12, cursor: 'pointer', color: agentColors.muted }}>
                                        Parameters
                                    </Box>
                                    <Box component="pre" sx={PRE_SX}>
                                        {parameters(step)}
                                    </Box>
                                </Box>
                            )}
                        </Box>
                    );
                })}
            </Box>

            {canDecide && approval && onDecide && (
                <Decision onDecide={(approve) => onDecide(approval, approve)} />
            )}
        </Box>
    );
}

/** The plan as an item of the approval list (kind plan): name, number of steps, the preview and the decision. */
export function PlanApprovalItem({
    approval,
    onDecide,
}: {
    approval: Approval;
    onDecide: (approve: boolean) => Promise<void>;
}) {
    return (
        <Box
            data-testid="agent-plan-approval"
            data-approval-id={approval.id}
            sx={{ px: 1.5, py: 1.25, borderTop: 1, borderColor: 'divider', minWidth: 0 }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
                <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>Plan</Typography>
                <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{approval.size} steps</Typography>
            </Box>
            <Typography sx={{ fontSize: 13, fontWeight: 500, overflowWrap: 'anywhere' }}>{approval.name}</Typography>
            {approval.preview && (
                <Box component="pre" sx={PRE_SX}>
                    {approval.preview}
                </Box>
            )}
            <Decision onDecide={onDecide} />
        </Box>
    );
}
