// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { useState } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

import { effectOf, splitCall } from '../format';
import type { Approval } from '../types';
import EffectChip from './EffectChip';
import { agentColors, blockSx, MONO } from './tokens';

function describe(a: Approval): { title: string; subject: string; body?: string } {
    switch (a.kind) {
        case 'platform_write': {
            const body = a.preview?.startsWith(a.name) ? a.preview.slice(a.name.length).trim() : a.preview;
            return { title: 'Platform call', subject: a.name, body: body || undefined };
        }
        case 'internet_access':
            return { title: 'Internet access for the sandbox', subject: a.name };
        case 'artifact_upload':
            return {
                title: 'Hand over a result file',
                subject: `${a.name} (${a.size.toLocaleString('en')} bytes)`,
                body: a.preview,
            };
        default:
            return { title: 'Approval', subject: a.name };
    }
}

function ApprovalItem({ approval, onDecide }: { approval: Approval; onDecide: (approve: boolean) => Promise<void> }) {
    const [busy, setBusy] = useState(false);
    const { title, subject, body } = describe(approval);
    const { method, path } = splitCall(approval.name);
    const effect = approval.kind === 'platform_write' ? effectOf(method, path) : undefined;

    const decide = async (approve: boolean) => {
        setBusy(true);
        try {
            await onDecide(approve);
        } finally {
            setBusy(false);
        }
    };

    return (
        <Box sx={{ px: 1.5, py: 1.25, borderTop: 1, borderColor: 'divider' }}>
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
            {approvals.map((a) => (
                <ApprovalItem key={a.id} approval={a} onDecide={(approve) => onDecide(a, approve)} />
            ))}
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
