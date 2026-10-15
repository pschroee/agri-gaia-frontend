// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The plan card (issue #70): a plan of several platform calls with one decision by the user. Shown under the answer
// that proposed it, in the panel, on /ai-agent and in the subagent view. Since gateway issue #72 it is the only place
// where a plan is decided: the list of pending approvals shows a reference line to it (PlanReference). What a step
// does is the gateway's summary; the agent's title and notes are shown apart and marked as not verified.

import { ReactElement, useState } from 'react';

import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import ListAltOutlinedIcon from '@mui/icons-material/ListAltOutlined';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';

import {
    agentNote,
    agentTitle,
    planLabel,
    stepCount,
    stepMain,
    stepStatus,
    stepTechnical,
    summaryChanged,
    STEP_LABEL,
    summaryParts,
    Plan,
    PlanStep,
    StepStatus,
} from '../plan';
import { scrollToPlanCard, useRegisterPlanCard } from '../planRegistry';
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

export const PRE_SX = {
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
    maxHeight: 200,
    overflow: 'auto',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
} as const;

/** Text by the agent that the gateway did not check: muted, apart, with its label. */
export function AgentText({ label, text, testId }: { label: string; text: string; testId: string }) {
    return (
        <Box data-testid={testId} sx={{ mt: 0.5, pl: 1, borderLeft: `2px dashed ${agentColors.outline}`, minWidth: 0 }}>
            <Typography component="div" sx={{ fontSize: 11, color: agentColors.amberText, fontWeight: 500 }}>
                {label}
            </Typography>
            <Typography
                component="div"
                sx={{
                    fontSize: 12,
                    color: 'text.secondary',
                    fontStyle: 'italic',
                    overflowWrap: 'anywhere',
                    whiteSpace: 'pre-wrap',
                }}
            >
                {text}
            </Typography>
        </Box>
    );
}

/** Collapsed technical details (method, path, parameters). */
export function Technical({
    text,
    open,
    testId,
    full,
}: {
    text: string;
    open?: boolean;
    testId?: string;
    /** No height limit (irreversible calls show their body in full). */
    full?: boolean;
}) {
    return (
        <Box component="details" open={open} sx={{ mt: 0.5 }} data-testid={testId}>
            <Box component="summary" sx={{ fontSize: 12, cursor: 'pointer', color: agentColors.muted }}>
                Technical details
            </Box>
            <Box component="pre" sx={{ ...PRE_SX, ...(full ? { maxHeight: 'none', overflow: 'visible' } : {}) }}>
                {text}
            </Box>
        </Box>
    );
}

/** The gateway's details of a step or call, one per line. */
export function SummaryDetails({ details }: { details: string[] }) {
    if (details.length === 0) return null;
    return (
        <Box component="ul" sx={{ m: 0, mt: 0.25, pl: 2, minWidth: 0 }}>
            {details.map((d, i) => (
                <Typography
                    key={i}
                    component="li"
                    sx={{ fontSize: 12, color: 'text.secondary', overflowWrap: 'anywhere', lineHeight: 1.5 }}
                >
                    {d}
                </Typography>
            ))}
        </Box>
    );
}

/**
 * Hint that the platform changed between the proposal and the click (gateway issue L2/#119). The approval stays open
 * and shows the new summary; the next click decides.
 */
export const CHANGED_TEXT =
    'Changed since it was proposed: the platform now shows other values. Check the summary and approve again.';

export function ChangedAlert() {
    return (
        <Alert severity="info" data-testid="agent-approval-changed" sx={{ mt: 1, fontSize: 12.5 }}>
            {CHANGED_TEXT}
        </Alert>
    );
}

/** The summary as it was proposed (gateway issue L2/#119), collapsed like the technical details. */
export function ProposedSummary({ summary, testId }: { summary: string; testId?: string }) {
    const parts = summaryParts(summary);
    if (!parts) return null;
    return (
        <Box component="details" data-testid={testId} sx={{ mt: 0.5 }}>
            <Box component="summary" sx={{ fontSize: 12, cursor: 'pointer', color: agentColors.muted }}>
                As proposed
            </Box>
            <Box sx={{ mt: 0.5, pl: 1, borderLeft: `2px solid ${agentColors.outline}`, minWidth: 0 }}>
                <Typography sx={{ fontSize: 12.5, fontWeight: 500, overflowWrap: 'anywhere' }}>{parts.head}</Typography>
                <SummaryDetails details={parts.details} />
            </Box>
        </Box>
    );
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
        <Box sx={{ mt: 1.25 }}>
            <Typography sx={{ fontSize: 12, color: 'text.secondary', mb: 0.75 }}>
                Approving runs these steps in this order with exactly these parameters, for 30 minutes. Steps marked
                irreversible still ask you on their own.
            </Typography>
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

function StepItem({ step }: { step: PlanStep }) {
    const status = stepStatus(step);
    const main = stepMain(step);
    const note = agentNote(step);
    return (
        <Box component="li" data-testid="agent-plan-step" data-status={status} sx={{ minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: 12, color: 'text.secondary', minWidth: 14, lineHeight: '22px' }}>
                    {step.idx}
                </Typography>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', minWidth: 0 }}>
                        <EffectChip effect={step.effect} />
                        <Box
                            sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flex: 'none', fontSize: 12, ml: 'auto' }}
                            title={step.result}
                        >
                            {STATUS_ICON[status]}
                            <Typography component="span" sx={{ fontSize: 12 }}>
                                {STEP_LABEL[status]}
                            </Typography>
                        </Box>
                    </Box>
                    <Typography
                        data-testid="agent-plan-step-summary"
                        data-from-gateway={main.fromGateway ? 'true' : 'false'}
                        sx={{
                            fontSize: 13,
                            fontWeight: 500,
                            mt: 0.5,
                            overflowWrap: 'anywhere',
                            ...(main.fromGateway ? {} : { fontFamily: MONO, fontSize: 12 }),
                        }}
                    >
                        {main.head}
                    </Typography>
                    <SummaryDetails details={main.details} />
                    {step.summary_proposed && (
                        <ProposedSummary summary={step.summary_proposed} testId="agent-plan-step-proposed" />
                    )}
                    {note && <AgentText label="Agent's note – not verified" text={note} testId="agent-plan-step-note" />}
                    <Technical text={stepTechnical(step)} testId="agent-plan-step-technical" />
                </Box>
            </Box>
        </Box>
    );
}

export default function PlanCard({
    plan,
    approval,
    onDecide,
    dense,
    register = true,
}: {
    plan: Plan;
    approval?: Approval;
    onDecide?: (a: Approval, approve: boolean) => Promise<void>;
    dense?: boolean;
    /** Counts as the view's card of this plan (false only where the approval list shows the card itself). */
    register?: boolean;
}) {
    useRegisterPlanCard(plan.id, register);
    const now = Date.now();
    const canDecide = plan.state === 'proposed' && approval?.state === 'pending' && !!onDecide;
    const title = agentTitle(plan);
    return (
        <Box
            data-testid="agent-plan-card"
            data-plan-id={plan.id}
            tabIndex={-1}
            sx={{
                ...blockSx,
                borderLeft: `3px solid ${plan.state === 'proposed' ? agentColors.amber : agentColors.greenLine}`,
                px: dense ? 1.25 : 1.5,
                py: 1.25,
                minWidth: 0,
                outline: 'none',
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75, minWidth: 0 }}>
                <ListAltOutlinedIcon sx={{ fontSize: 17, color: agentColors.green, mt: '2px', flex: 'none' }} aria-hidden />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography sx={{ fontSize: 13, fontWeight: 600 }}>Plan · {stepCount(plan.steps.length)}</Typography>
                    <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.25 }}>{planLabel(plan, now)}</Typography>
                    {title && <AgentText label="Agent's title – not verified" text={title} testId="agent-plan-title" />}
                </Box>
            </Box>

            <Box
                component="ol"
                sx={{ listStyle: 'none', m: 0, p: 0, mt: 1.25, display: 'flex', flexDirection: 'column', gap: 1.25 }}
            >
                {plan.steps.map((step) => (
                    <StepItem key={step.idx} step={step} />
                ))}
            </Box>

            {canDecide && approval && summaryChanged(approval) && (
                <>
                    <ChangedAlert />
                    {approval.summary_proposed && (
                        <ProposedSummary summary={approval.summary_proposed} testId="agent-approval-proposed" />
                    )}
                </>
            )}
            {canDecide && approval && onDecide && <Decision onDecide={(approve) => onDecide(approval, approve)} />}
        </Box>
    );
}

/**
 * A plan in the list of pending approvals while its card shows in the transcript (gateway issue #72): one line with
 * the number of steps and a jump to the card, no second decision.
 */
export function PlanReference({ approval, plan }: { approval: Approval; plan?: Plan }) {
    const steps = plan ? plan.steps.length : approval.size;
    const title = plan ? agentTitle(plan) : '';
    return (
        <Box
            data-testid="agent-plan-reference"
            data-approval-id={approval.id}
            sx={{
                px: 1.5,
                py: 1,
                borderTop: 1,
                borderColor: 'divider',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                minWidth: 0,
            }}
        >
            <ListAltOutlinedIcon sx={{ fontSize: 17, color: agentColors.green, flex: 'none' }} aria-hidden />
            <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography sx={{ fontSize: 13, fontWeight: 500 }}>Plan · {stepCount(steps)}</Typography>
                {title && (
                    <Typography
                        title={`${title} (agent's title – not verified)`}
                        sx={{
                            fontSize: 12,
                            color: 'text.secondary',
                            fontStyle: 'italic',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {title}
                    </Typography>
                )}
            </Box>
            <Button
                size="small"
                variant="text"
                sx={{ flex: 'none' }}
                onClick={(e) => {
                    if (!plan) return;
                    const root = e.currentTarget.closest('[data-testid="agent-transcript"]') ?? document;
                    scrollToPlanCard(plan.id, root);
                }}
            >
                Show plan
            </Button>
        </Box>
    );
}

/**
 * A plan approval without plan data (plans not loaded yet, or a gateway without them): the gateway's summary of the
 * steps and the decision. Shown only when no card of the plan is in the view.
 */
export function PlanApprovalItem({
    approval,
    onDecide,
}: {
    approval: Approval;
    onDecide: (approve: boolean) => Promise<void>;
}) {
    const parts = summaryParts(approval.summary);
    return (
        <Box
            data-testid="agent-plan-approval"
            data-approval-id={approval.id}
            sx={{ px: 1.5, py: 1.25, borderTop: 1, borderColor: 'divider', minWidth: 0 }}
        >
            <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
                {parts?.head ?? `Plan · ${stepCount(approval.size)}`}
            </Typography>
            {parts && <SummaryDetails details={parts.details} />}
            {approval.preview && <Technical text={approval.preview} open={!parts} />}
            <Decision onDecide={onDecide} />
        </Box>
    );
}
