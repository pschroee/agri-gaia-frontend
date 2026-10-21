// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// A decided platform call or upload as one line in the history, right below the call that asked for it (issue #192):
// the state's word, the gateway's summary of what was approved, the time and the link to the call's activity. It does
// not open; the details stay in the step's own details.

import { Link as RouterLink } from 'react-router-dom';

import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';

import { activityLinkOf } from '../activity';
import { useAgentOptional } from '../AgentContext';
import { formatClock } from '../format';
import { approvalDeadline, approvalDecision, expiryMinutes } from '../notebook';
import type { Approval } from '../types';
import { DecisionIcon, TONE_COLOR } from './NotebookRunApproval';
import { agentColors } from './tokens';

/** What the line says about the approval: the first line of the gateway's summary, else the call's name. */
export const platformRowText = (a: Pick<Approval, 'summary' | 'name'>): string =>
    (a.summary?.split('\n')[0] || a.name || '').trim();

export default function PlatformDecidedRow({ approval }: { approval: Approval }) {
    const expiryMin = expiryMinutes(useAgentOptional()?.config);
    const decision = approvalDecision(approval, expiryMin);
    const at =
        approval.state === 'expired'
            ? approval.decided_at ?? approvalDeadline(approval.created_at, expiryMin)
            : approval.decided_at;
    const text = platformRowText(approval);
    return (
        <Box
            role="group"
            data-testid="agent-platform-decided"
            data-approval-id={approval.id}
            data-state={approval.state}
            aria-label={`${decision.label}: ${text}`}
            sx={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 1,
                px: 1.5,
                py: 0.75,
                border: 1,
                borderColor: 'divider',
                borderLeft: `3px solid ${TONE_COLOR[decision.tone]}`,
                borderRadius: 1,
                minWidth: 0,
            }}
        >
            <DecisionIcon tone={decision.tone} />
            <Typography sx={{ fontSize: 12.5, color: TONE_COLOR[decision.tone], flex: 'none' }}>
                {decision.label}
            </Typography>
            <Typography noWrap title={text} sx={{ fontSize: 12.5, minWidth: 0, flex: '1 1 auto' }}>
                {text}
            </Typography>
            {at && (
                <Typography sx={{ flex: 'none', fontSize: 12, color: 'text.secondary' }}>{formatClock(at)}</Typography>
            )}
            {approval.kind === 'platform_write' && approval.tool_call_id && (
                <Link
                    component={RouterLink}
                    to={activityLinkOf(approval.chat_id, approval.tool_call_id)}
                    underline="hover"
                    sx={{ flex: 'none', fontSize: 12, color: agentColors.green }}
                >
                    Activity
                </Link>
            )}
        </Box>
    );
}

/** The decided platform calls and uploads of a piece of the group (not the notebook runs and searches: they have rows). */
export function PlatformDecidedRows({
    steps,
    approvals,
}: {
    steps: { id: string; callId?: string }[];
    approvals: Approval[] | undefined;
}) {
    const list = platformDecidedOf(steps, approvals);
    if (list.length === 0) return null;
    return (
        <>
            {list.map((a) => (
                <PlatformDecidedRow key={a.id} approval={a} />
            ))}
        </>
    );
}

/** The approvals that get a `PlatformDecidedRow`: decided, bound to one of the steps, with no row of their own kind. */
export function platformDecidedOf(
    steps: { id: string; callId?: string }[],
    approvals: Approval[] | undefined,
): Approval[] {
    return (approvals ?? []).filter(
        (a) =>
            (a.kind === 'platform_write' || a.kind === 'artifact_upload') &&
            a.state !== 'pending' &&
            !a.notebook &&
            !a.search &&
            !!a.tool_call_id &&
            steps.some((s) => a.tool_call_id === s.id || a.tool_call_id === s.callId),
    );
}
