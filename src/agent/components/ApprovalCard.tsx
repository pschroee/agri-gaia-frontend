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
import { effectOf, splitCall } from '../format';
import { internetApprovalText } from '../settings';
import type { Approval } from '../types';
import EffectChip from './EffectChip';
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
    const { method, path } = splitCall(approval.name);
    const effect = approval.kind === 'platform_write' ? effectOf(method, path) : undefined;

    return (
        <Box
            data-testid="agent-platform-approval"
            data-approval-id={approval.id}
            sx={{ px: 1.5, py: 1.25, borderTop: 1, borderColor: 'divider' }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>{title}</Typography>
                {effect && <EffectChip effect={effect} />}
            </Box>
            <Typography sx={{ fontFamily: MONO, fontSize: 12.5, overflowWrap: 'anywhere' }}>{subject}</Typography>
            {body && (
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
                    {body}
                </Box>
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
 * Pending approvals of a chat as one card, like the prototype's "Suggestions" block: each request with
 * APPROVE / REJECT, and APPROVE ALL when there is more than one.
 */
export default function ApprovalCard({
    approvals,
    onDecide,
}: {
    approvals: Approval[];
    onDecide: (approval: Approval, approve: boolean) => Promise<void>;
}) {
    const [busy, setBusy] = useState(false);
    if (approvals.length === 0) return null;

    const approveAll = async () => {
        setBusy(true);
        try {
            for (const a of approvals) await onDecide(a, true);
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
                a.kind === 'internet_access' ? (
                    <InternetItem key={a.id} approval={a} onDecide={(approve) => onDecide(a, approve)} />
                ) : a.kind === 'artifact_upload' ? (
                    <ArtifactItem key={a.id} approval={a} onDecide={(approve) => onDecide(a, approve)} />
                ) : (
                    <ApprovalItem key={a.id} approval={a} onDecide={(approve) => onDecide(a, approve)} />
                ),
            )}
            {approvals.length > 1 && (
                <Box sx={{ px: 1.5, py: 1, borderTop: 1, borderColor: 'divider' }}>
                    <Button size="small" variant="contained" disabled={busy} onClick={() => void approveAll()}>
                        Approve all
                    </Button>
                </Box>
            )}
        </Box>
    );
}
