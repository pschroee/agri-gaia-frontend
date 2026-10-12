// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { useState } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import PublicIcon from '@mui/icons-material/Public';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';

import { artifactApprovalView } from '../files';
import { approvalEffect } from '../effect';
import { internetApprovalText } from '../settings';
import type { Approval } from '../types';
import EffectChip from './EffectChip';
import type { Plan } from '../plan';
import { summaryParts } from '../plan';
import { useShownPlanCards } from '../planRegistry';
import PlanCard, { PlanApprovalItem, PlanReference, SummaryDetails, Technical } from './PlanCard';
import { agentColors, blockSx, MONO } from './tokens';

function describe(a: Approval): { title: string; subject: string; body?: string } {
    switch (a.kind) {
        case 'platform_write': {
            const body = a.preview?.startsWith(a.name) ? a.preview.slice(a.name.length).trim() : a.preview;
            return { title: 'Platform call', subject: a.name, body: body || undefined };
        }
        default:
            return { title: 'Approval', subject: a.name };
    }
}

function useDecide(onDecide: (approve: boolean) => Promise<void>) {
    const [busy, setBusy] = useState(false);
    const decide = async (approve: boolean) => {
        setBusy(true);
        try {
            await onDecide(approve);
        } finally {
            setBusy(false);
        }
    };
    return { busy, decide };
}

/** The agent asks for internet access (agw-internet, MCP request_internet): reason and what allowing does. */
function InternetItem({ approval, onDecide }: { approval: Approval; onDecide: (approve: boolean) => Promise<void> }) {
    const { busy, decide } = useDecide(onDecide);
    const t = internetApprovalText(approval);
    return (
        <Box
            data-testid="agent-internet-approval"
            data-approval-id={approval.id}
            sx={{ px: 1.5, py: 1.25, borderTop: 1, borderColor: 'divider' }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
                <PublicIcon sx={{ fontSize: 17, color: agentColors.green }} aria-hidden />
                <Typography sx={{ fontSize: 13, fontWeight: 500 }}>{t.title}</Typography>
            </Box>
            {t.reason ? (
                <Box
                    component="blockquote"
                    sx={{
                        m: 0,
                        mt: 0.5,
                        pl: 1.25,
                        borderLeft: `2px solid ${agentColors.greenLine}`,
                        fontSize: 13,
                        fontStyle: 'italic',
                        whiteSpace: 'pre-wrap',
                        overflowWrap: 'anywhere',
                    }}
                >
                    {t.reason}
                </Box>
            ) : (
                <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>No reason given.</Typography>
            )}
            <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.75 }}>{t.explain}</Typography>
            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                <Button
                    size="small"
                    variant="contained"
                    startIcon={<PublicIcon />}
                    disabled={busy}
                    onClick={() => void decide(true)}
                >
                    Allow internet
                </Button>
                <Button
                    size="small"
                    variant="outlined"
                    color="secondary"
                    disabled={busy}
                    onClick={() => void decide(false)}
                >
                    Reject
                </Button>
            </Box>
        </Box>
    );
}

/**
 * The agent wants to hand over a result file (kind artifact_upload): name, size, type and a text preview. Only a gateway
 * before issue #62 asks for this; since then files arrive as the agent's file message without approval.
 */
function ArtifactItem({ approval, onDecide }: { approval: Approval; onDecide: (approve: boolean) => Promise<void> }) {
    const { busy, decide } = useDecide(onDecide);
    const v = artifactApprovalView(approval);
    const Icon = v.image ? ImageOutlinedIcon : InsertDriveFileOutlinedIcon;
    return (
        <Box
            data-testid="agent-artifact-approval"
            data-approval-id={approval.id}
            sx={{ px: 1.5, py: 1.25, borderTop: 1, borderColor: 'divider' }}
        >
            <Typography sx={{ fontSize: 12.5, color: 'text.secondary', mb: 0.5 }}>
                New result file from the agent
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, minWidth: 0 }}>
                <Icon sx={{ fontSize: 20, color: agentColors.green, mt: '1px', flex: 'none' }} aria-hidden />
                <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontFamily: MONO, fontSize: 12.5, overflowWrap: 'anywhere' }}>{v.name}</Typography>
                    <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                        {v.size} · {v.type}
                    </Typography>
                </Box>
            </Box>
            {v.preview && (
                <Box
                    component="pre"
                    sx={{
                        fontFamily: MONO,
                        fontSize: 11.5,
                        lineHeight: 1.55,
                        bgcolor: '#fafafa',
                        border: 1,
                        borderColor: 'divider',
                        borderRadius: 0.5,
                        p: 1,
                        mt: 0.75,
                        mb: 0,
                        maxHeight: 160,
                        overflow: 'auto',
                        whiteSpace: 'pre-wrap',
                        overflowWrap: 'anywhere',
                    }}
                >
                    {v.preview}
                </Box>
            )}
            <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.75 }}>
                Allowing stores the file with the chat's files, where you can download it.
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                <Button size="small" variant="contained" disabled={busy} onClick={() => void decide(true)}>
                    Allow
                </Button>
                <Button
                    size="small"
                    variant="outlined"
                    color="secondary"
                    disabled={busy}
                    onClick={() => void decide(false)}
                >
                    Reject
                </Button>
            </Box>
        </Box>
    );
}

function ApprovalItem({ approval, onDecide }: { approval: Approval; onDecide: (approve: boolean) => Promise<void> }) {
    const { busy, decide } = useDecide(onDecide);
    const { title, subject, body } = describe(approval);
    // Gateway issue #63: the class comes from the gateway; an irreversible call is shown in red, in full.
    const effect = approvalEffect(approval);
    const irreversible = effect === 'irreversible';
    // Gateway issue #72: what will happen, in the gateway's words; method, path and body below, collapsed.
    const summary = summaryParts(approval.summary);
    const technical = [subject, body].filter(Boolean).join('\n\n');

    return (
        <Box
            data-testid="agent-platform-approval"
            data-approval-id={approval.id}
            data-effect={effect}
            sx={{
                px: 1.5,
                py: 1.25,
                borderTop: 1,
                borderColor: 'divider',
                minWidth: 0,
                ...(irreversible ? { bgcolor: agentColors.redTint, boxShadow: `inset 3px 0 0 ${agentColors.red}` } : {}),
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>{title}</Typography>
                {effect && <EffectChip effect={effect} />}
            </Box>
            {summary ? (
                <>
                    <Typography
                        data-testid="agent-approval-summary"
                        sx={{ fontSize: 13, fontWeight: 500, overflowWrap: 'anywhere' }}
                    >
                        {summary.head}
                    </Typography>
                    <SummaryDetails details={summary.details} />
                </>
            ) : (
                <Typography sx={{ fontFamily: MONO, fontSize: 12.5, overflowWrap: 'anywhere' }}>{subject}</Typography>
            )}
            {irreversible && (
                <Typography sx={{ fontSize: 12, color: agentColors.red, mt: 0.5 }}>
                    This cannot be undone. Check every parameter below before you approve.
                </Typography>
            )}
            {summary ? (
                <Technical text={technical} open={irreversible} full={irreversible} testId="agent-approval-technical" />
            ) : (
                body && (
                    <Box
                        component="pre"
                        sx={{
                            fontFamily: MONO,
                            fontSize: 11.5,
                            lineHeight: 1.55,
                            bgcolor: '#fafafa',
                            border: 1,
                            borderColor: 'divider',
                            borderRadius: 0.5,
                            p: 1,
                            mt: 0.75,
                            mb: 0,
                            maxHeight: irreversible ? 'none' : 160,
                            overflow: irreversible ? 'visible' : 'auto',
                            whiteSpace: 'pre-wrap',
                            overflowWrap: 'anywhere',
                        }}
                    >
                        {body}
                    </Box>
                )
            )}
            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                <Button size="small" variant="contained" disabled={busy} onClick={() => void decide(true)}>
                    Approve
                </Button>
                <Button
                    size="small"
                    variant="outlined"
                    color="secondary"
                    disabled={busy}
                    onClick={() => void decide(false)}
                >
                    Reject
                </Button>
            </Box>
        </Box>
    );
}

/**
 * A plan in the approval list (gateway issue #72): a reference line when the view shows its card, else the card itself
 * (the only place to decide it), else, without plan data, the gateway's summary with the decision.
 */
function PlanItem({
    approval,
    plan,
    shown,
    onDecide,
}: {
    approval: Approval;
    plan?: Plan;
    shown: boolean;
    onDecide: (approval: Approval, approve: boolean) => Promise<void>;
}) {
    if (plan && shown) return <PlanReference approval={approval} plan={plan} />;
    if (plan)
        return (
            <Box sx={{ px: 1, py: 1, borderTop: 1, borderColor: 'divider', minWidth: 0 }}>
                <PlanCard plan={plan} approval={approval} onDecide={onDecide} dense register={false} />
            </Box>
        );
    return <PlanApprovalItem approval={approval} onDecide={(approve) => onDecide(approval, approve)} />;
}

/**
 * Pending approvals of a chat as one card, like the prototype's "Suggestions" block: each request with
 * APPROVE / REJECT, and APPROVE ALL when there is more than one.
 */
export default function ApprovalCard({
    approvals,
    onDecide,
    plans,
}: {
    approvals: Approval[];
    onDecide: (approval: Approval, approve: boolean) => Promise<void>;
    /** The chat's plans: a plan approval whose card the view shows becomes a reference line (gateway issue #72). */
    plans?: Plan[];
}) {
    const [busy, setBusy] = useState(false);
    const shown = useShownPlanCards();
    if (approvals.length === 0) return null;

    // a plan is approved with its own button only: approving all never takes it along (issue #70)
    const approveAll = async () => {
        setBusy(true);
        try {
            for (const a of approvals) {
                if (a.kind === 'plan') continue;
                await onDecide(a, true);
            }
        } finally {
            setBusy(false);
        }
    };

    return (
        <Box sx={{ ...blockSx, borderLeft: `3px solid ${agentColors.amber}` }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1 }}>
                <Typography sx={{ fontSize: 13, fontWeight: 500 }}>Waiting for your approval</Typography>
                <Typography sx={{ ml: 'auto', fontSize: 11.5, color: 'text.secondary' }}>{approvals.length}</Typography>
            </Box>
            {approvals.map((a) =>
                a.kind === 'plan' ? (
                    <PlanItem
                        key={a.id}
                        approval={a}
                        plan={plans?.find((p) => p.approval_id === a.id)}
                        shown={!!plans?.some((p) => p.approval_id === a.id && shown.has(p.id))}
                        onDecide={onDecide}
                    />
                ) : a.kind === 'internet_access' ? (
                    <InternetItem key={a.id} approval={a} onDecide={(approve) => onDecide(a, approve)} />
                ) : a.kind === 'artifact_upload' ? (
                    <ArtifactItem key={a.id} approval={a} onDecide={(approve) => onDecide(a, approve)} />
                ) : (
                    <ApprovalItem key={a.id} approval={a} onDecide={(approve) => onDecide(a, approve)} />
                ),
            )}
            {approvals.filter((a) => a.kind !== 'plan').length > 1 && (
                <Box sx={{ px: 1.5, py: 1, borderTop: 1, borderColor: 'divider' }}>
                    <Button size="small" variant="contained" disabled={busy} onClick={() => void approveAll()}>
                        Approve all
                    </Button>
                </Box>
            )}
        </Box>
    );
}
