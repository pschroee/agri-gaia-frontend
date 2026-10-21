// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { useState } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';

import { artifactApprovalView } from '../files';
import { approvalEffect } from '../effect';
import type { Approval } from '../types';
import EffectChip from './EffectChip';
import NotebookRunApproval from './NotebookRunApproval';
import CodeChangeApproval from './search/CodeChangeApproval';
import SearchApproval from './search/SearchApproval';
import { isCodeChange, isProposal } from '../searchApproval';
import type { Plan } from '../plan';
import { summaryChanged, summaryParts } from '../plan';
import { useShownPlanCards } from '../planRegistry';
import PlanCard, {
    ChangedAlert,
    PlanApprovalItem,
    PlanReference,
    ProposedSummary,
    SummaryDetails,
    Technical,
} from './PlanCard';
import InternetApproval from './internet/InternetApproval';
import UploadFiles from './UploadFiles';
import { agentColors, blockSx, MONO } from './tokens';
import { LISTED_FILES } from '../uploads';

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

function ApprovalItem({
    approval,
    onDecide,
    layout = 'panel',
}: {
    approval: Approval;
    onDecide: (approve: boolean) => Promise<void>;
    layout?: 'panel' | 'page';
}) {
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
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, minWidth: 0 }}>
                <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>{title}</Typography>
                {effect && <EffectChip effect={effect} />}
            </Box>
            {summary ? (
                <>
                    <Typography
                        data-testid="agent-approval-summary"
                        sx={{ fontSize: 13, fontWeight: 500, overflowWrap: 'anywhere', whiteSpace: 'normal' }}
                    >
                        {summary.head}
                    </Typography>
                    <SummaryDetails details={summary.details} />
                </>
            ) : (
                <Typography sx={{ fontFamily: MONO, fontSize: 12.5, overflowWrap: 'anywhere' }}>{subject}</Typography>
            )}
            {/* Up to LISTED_FILES the summary lists the files itself; above it the card shows the folders and the
                collapsed list of every file (gateway issue #164). */}
            {approval.uploads && approval.uploads.files > LISTED_FILES && (
                <UploadFiles data={approval.uploads} chatId={approval.chat_id} approvalId={approval.id} layout={layout} />
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
            {summaryChanged(approval) && (
                <>
                    <ChangedAlert />
                    {approval.summary_proposed && (
                        <ProposedSummary summary={approval.summary_proposed} testId="agent-approval-proposed" />
                    )}
                </>
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
    layout = 'panel',
}: {
    approvals: Approval[];
    onDecide: (approval: Approval, approve: boolean) => Promise<void>;
    /** The chat's plans: a plan approval whose card the view shows becomes a reference line (gateway issue #72). */
    plans?: Plan[];
    /** The width the cards are drawn in (own code C-E4): the 400 px panel or the chat column of /ai-agent. */
    layout?: 'panel' | 'page';
}) {
    const [busy, setBusy] = useState(false);
    const shown = useShownPlanCards();
    if (approvals.length === 0) return null;

    // a plan is approved with its own button only: approving all never takes it along (issue #70); the same goes for a
    // training search (issue #168), which hands over a budget and hours of autonomy
    const approveAll = async () => {
        setBusy(true);
        try {
            for (const a of approvals) {
                if (a.kind === 'plan' || a.kind === 'search') continue;
                await onDecide(a, true);
            }
        } finally {
            setBusy(false);
        }
    };

    return (
        <Box sx={{ ...blockSx, minWidth: 0, borderLeft: `3px solid ${agentColors.amber}` }}>
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
                    <InternetApproval key={a.id} approval={a} layout={layout} onDecide={(approve) => onDecide(a, approve)} />
                ) : a.kind === 'artifact_upload' ? (
                    <ArtifactItem key={a.id} approval={a} onDecide={(approve) => onDecide(a, approve)} />
                ) : a.search && isCodeChange(a.search) ? (
                    // a trial of a notebook search runs other code than the approved one (issue #168, G15)
                    <CodeChangeApproval
                        key={a.id}
                        approval={a}
                        data={a.search}
                        onApprove={() => onDecide(a, true)}
                        onReject={() => onDecide(a, false)}
                    />
                ) : a.kind === 'search' && isProposal(a.search) ? (
                    <SearchApproval
                        key={a.id}
                        approval={a}
                        data={a.search}
                        layout={layout}
                        onApprove={() => onDecide(a, true)}
                        onReject={() => onDecide(a, false)}
                    />
                ) : a.notebook ? (
                    // a run in the chat's notebook server (own code C-E4): the gateway's structured data replaces the
                    // text preview — the code of the run, file by file
                    <NotebookRunApproval
                        key={a.id}
                        approval={a}
                        data={a.notebook}
                        layout={layout}
                        onApprove={() => onDecide(a, true)}
                        onReject={() => onDecide(a, false)}
                    />
                ) : (
                    <ApprovalItem key={a.id} approval={a} layout={layout} onDecide={(approve) => onDecide(a, approve)} />
                ),
            )}
            {approvals.filter((a) => a.kind !== 'plan' && a.kind !== 'search').length > 1 && (
                <Box sx={{ px: 1.5, py: 1, borderTop: 1, borderColor: 'divider' }}>
                    <Button size="small" variant="contained" disabled={busy} onClick={() => void approveAll()}>
                        Approve all
                    </Button>
                </Box>
            )}
        </Box>
    );
}
