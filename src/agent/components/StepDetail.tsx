// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import CheckIcon from '@mui/icons-material/Check';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';

import { copyText } from '../clipboard';
import { formatClock, formatMs } from '../format';
import { clipText, stepDetail } from '../stepDetail';
import type { DetailBlock, DetailField, DetailTone, PlatformRequest } from '../stepDetail';
import type { Step } from '../transcript';
import type { Approval } from '../types';
import EffectChip from './EffectChip';
import { agentColors, MONO } from './tokens';

const TONE: Record<DetailTone, string> = { ok: agentColors.ok, error: agentColors.red, muted: 'text.secondary' };

const labelSx = { fontSize: 11.5, fontWeight: 500, color: 'text.secondary', lineHeight: 1.5 } as const;

/** Copy button of a code block; the icon shows a tick for a moment. */
function CopyIconButton({ text, label }: { text: string; label: string }) {
    const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
    useEffect(() => {
        if (state === 'idle') return;
        const t = setTimeout(() => setState('idle'), 1200);
        return () => clearTimeout(t);
    }, [state]);
    return (
        <Tooltip title={state === 'copied' ? 'Copied' : state === 'failed' ? 'Could not copy' : `Copy ${label}`}>
            <IconButton
                size="small"
                aria-label={`Copy ${label}`}
                data-testid="agent-step-copy"
                onClick={() => void copyText(text).then((ok) => setState(ok ? 'copied' : 'failed'))}
                sx={{ p: 0.25, flex: 'none' }}
            >
                {state === 'copied' ? (
                    <CheckIcon sx={{ fontSize: 14, color: agentColors.ok }} />
                ) : (
                    <ContentCopyIcon sx={{ fontSize: 14 }} />
                )}
            </IconButton>
        </Tooltip>
    );
}

/** A wrapping monospace block; long text starts clipped with "Show all". */
function CodeBlock({ block }: { block: Extract<DetailBlock, { type: 'code' }> }) {
    const [all, setAll] = useState(false);
    const clip = useMemo(() => clipText(block.text), [block.text]);
    const clipped = !!block.clip && clip.clipped && !all;
    return (
        <Box data-testid="agent-step-code" data-label={block.label} sx={{ minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minHeight: 22 }}>
                <Typography sx={{ ...labelSx, color: block.error ? agentColors.red : labelSx.color }}>
                    {block.label}
                </Typography>
                {block.copy && (
                    <Box sx={{ ml: 'auto', display: 'flex' }}>
                        <CopyIconButton text={block.text} label={block.label.toLowerCase()} />
                    </Box>
                )}
            </Box>
            <Box
                component="pre"
                data-error={block.error ? 'true' : undefined}
                sx={{
                    fontFamily: MONO,
                    fontSize: 11.5,
                    lineHeight: 1.55,
                    bgcolor: block.error ? agentColors.redTint : '#fafafa',
                    color: block.error ? agentColors.red : 'text.primary',
                    border: 1,
                    borderColor: block.error ? agentColors.redLine : 'divider',
                    borderRadius: 0.5,
                    px: 1,
                    py: 0.75,
                    m: 0,
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'anywhere',
                    maxHeight: all ? 480 : undefined,
                    overflowY: all ? 'auto' : undefined,
                    minWidth: 0,
                }}
            >
                {clipped ? `${clip.text}\n…` : block.text}
            </Box>
            {block.clip && clip.clipped && (
                <ButtonBase
                    data-testid="agent-step-show-all"
                    onClick={() => setAll((v) => !v)}
                    sx={{ fontSize: 11.5, color: agentColors.green, mt: 0.25, borderRadius: 0.5, px: 0.25 }}
                >
                    {all
                        ? 'Show less'
                        : clip.totalLines > 20
                        ? `Show all (${clip.totalLines} lines)`
                        : `Show all (${block.text.length.toLocaleString('en-GB')} characters)`}
                </ButtonBase>
            )}
            {block.note && (
                <Typography data-testid="agent-step-note" sx={{ fontSize: 11.5, color: 'text.secondary', mt: 0.25 }}>
                    {block.note}
                </Typography>
            )}
        </Box>
    );
}

function Fields({ fields }: { fields: DetailField[] }) {
    return (
        <Box
            data-testid="agent-step-fields"
            sx={{
                display: 'grid',
                gridTemplateColumns: 'auto minmax(0, 1fr)',
                columnGap: 1.5,
                rowGap: 0.25,
                alignItems: 'baseline',
                minWidth: 0,
            }}
        >
            {fields.map((f) => (
                <Box key={f.label} sx={{ display: 'contents' }}>
                    <Typography sx={{ ...labelSx, fontWeight: 400 }}>{f.label}</Typography>
                    <Typography
                        sx={{
                            fontSize: 12,
                            fontFamily: f.mono ? MONO : undefined,
                            color: f.tone ? TONE[f.tone] : 'text.primary',
                            overflowWrap: 'anywhere',
                            minWidth: 0,
                        }}
                    >
                        {f.value}
                    </Typography>
                </Box>
            ))}
        </Box>
    );
}

const APPROVAL_KIND: Record<Approval['kind'], string> = {
    platform_write: 'Platform call',
    artifact_upload: 'Upload',
    internet_access: 'Internet access',
};

/** Scrolls to the open approval card of the chat (ApprovalCard marks its items with the approval's ID). */
function goToApproval(id: string) {
    const el = document.querySelector(`[data-approval-id="${CSS.escape(id)}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/** The approval a call asked for: pending with a jump to its card, decided with who and when, and the activity log. */
function ApprovalLine({ approval, standalone }: { approval: Approval; standalone?: boolean }) {
    const when = approval.decided_at ? formatClock(approval.decided_at, true) : '';
    let text: string;
    let color = 'text.secondary';
    switch (approval.state) {
        case 'pending':
            text = 'Waiting for your approval';
            color = agentColors.amberText;
            break;
        case 'approved':
            text = `Approved by you${when ? ` at ${when}` : ''}`;
            color = agentColors.ok;
            break;
        case 'rejected':
            text = `Rejected by you${when ? ` at ${when}` : ''}`;
            color = agentColors.red;
            break;
        default:
            text = 'Approval expired';
    }
    return (
        <Box
            data-testid="agent-step-approval"
            data-approval={approval.id}
            sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 1, minWidth: 0 }}
        >
            <Typography sx={{ fontSize: 12, color, overflowWrap: 'anywhere', minWidth: 0 }}>
                {standalone ? `${APPROVAL_KIND[approval.kind]} ${approval.name ? `"${approval.name}" ` : ''}· ` : ''}
                {text}
            </Typography>
            {approval.state === 'pending' ? (
                <Link
                    component="button"
                    type="button"
                    underline="hover"
                    onClick={() => goToApproval(approval.id)}
                    sx={{ fontSize: 12, color: agentColors.green }}
                >
                    Go to approval
                </Link>
            ) : approval.kind === 'platform_write' ? (
                <Link
                    component={RouterLink}
                    to="/ai-agent?tab=activity"
                    underline="hover"
                    sx={{ fontSize: 12, color: agentColors.green }}
                >
                    Activity
                </Link>
            ) : null}
        </Box>
    );
}

function PlatformBlock({ request: r, title }: { request: PlatformRequest; title?: string }) {
    const fields: DetailField[] = [];
    if (r.query?.length) fields.push({ label: 'Query', value: r.query.join('&'), mono: true });
    if (r.status) fields.push({ label: 'Status', value: r.status, tone: r.tone });
    const dur = formatMs(r.durationMs);
    if (dur) fields.push({ label: 'Duration', value: dur });
    return (
        <Box
            data-testid="agent-step-platform"
            sx={{ display: 'grid', gap: 0.5, minWidth: 0, p: 1, border: 1, borderColor: 'divider', borderRadius: 0.5 }}
        >
            {title && <Typography sx={labelSx}>{title}</Typography>}
            <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.75, minWidth: 0 }}>
                <Typography
                    data-testid="agent-step-request"
                    sx={{ fontFamily: MONO, fontSize: 12, overflowWrap: 'anywhere', minWidth: 0 }}
                >
                    {r.method ? (
                        <>
                            <b>{r.method}</b> {r.path}
                        </>
                    ) : (
                        r.path ?? 'request'
                    )}
                </Typography>
                {r.effect && <EffectChip effect={r.effect} />}
            </Box>
            {fields.length > 0 && <Fields fields={fields} />}
            {r.body && <CodeBlock block={{ type: 'code', label: 'Body', text: r.body, copy: true, clip: true }} />}
            {r.approval && <ApprovalLine approval={r.approval} />}
        </Box>
    );
}

/**
 * Details of a tool step below its row (issue #58): the full command or arguments, platform requests with status and
 * approval, and the result, red when it failed. Everything wraps; nothing scrolls sideways in the 400 px panel.
 */
export default function StepDetail({ step }: { step: Step }) {
    const detail = useMemo(() => stepDetail(step), [step]);
    return (
        <Box
            data-testid="agent-step-detail"
            data-kind={detail.kind}
            sx={{
                mt: 0.5,
                mb: 0.75,
                ml: '7px',
                pl: 1.5,
                borderLeft: 2,
                borderColor: 'divider',
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr)',
                gap: 1,
                minWidth: 0,
            }}
        >
            {detail.blocks.length === 0 && (
                <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                    {step.status === 'running' ? 'Nothing recorded yet.' : 'No details recorded for this call.'}
                </Typography>
            )}
            {detail.blocks.map((b, i) => {
                switch (b.type) {
                    case 'fields':
                        return <Fields key={i} fields={b.fields} />;
                    case 'code':
                        return <CodeBlock key={`${i}-${b.label}`} block={b} />;
                    case 'platform':
                        return <PlatformBlock key={i} request={b.request} title={b.title} />;
                    case 'approval':
                        return <ApprovalLine key={i} approval={b.approval} standalone />;
                    default:
                        return null;
                }
            })}
        </Box>
    );
}
