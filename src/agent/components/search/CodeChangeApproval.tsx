// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// "Code changed in training search …" (gateway issue #168, design g6, G15): a trial of a notebook search would run
// other code than the one the user approved. The question comes as an ordinary approval of the notebook run; the
// gateway adds `approval.search` (versions, changed files, a diff per file). The card shows what changed and what
// approving means. Decided it is one line.

import { useState } from 'react';

import HourglassEmptyOutlinedIcon from '@mui/icons-material/HourglassEmptyOutlined';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import { alpha } from '@mui/material/styles';
import Typography from '@mui/material/Typography';

import { useAgentOptional } from '../../AgentContext';
import { formatClock } from '../../format';
import { approvalDeadline, approvalDecision, expiryMinutes } from '../../notebook';
import { codeChangeFoot, codeChangeSummary, diffCounts, diffRows, waitingText } from '../../searchApproval';
import type { SearchCodeChange, SearchFileChange } from '../../searchApproval';
import { shortSha } from '../../notebook';
import type { Approval } from '../../types';
import ApprovalFooter from '../ApprovalFooter';
import EffectChip from '../EffectChip';
import { DecisionIcon, TONE_COLOR } from '../NotebookRunApproval';
import { MONO } from '../tokens';
import { useNow } from '../../useNow';

/** The diff of one file: a column for the line number, one for the sign (never the colour alone), the text. */
function FileDiff({ file }: { file: SearchFileChange }) {
    const rows = diffRows(file.diff);
    if (file.diff_too_long) {
        return (
            <Box sx={{ mt: 0.75 }}>
                <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{`${file.name}: diff too long — the new file in full`}</Typography>
                <Box component="pre" tabIndex={0} aria-label={`New ${file.name}`} sx={{ m: 0, mt: 0.5, p: 1, bgcolor: 'grey.50', border: 1, borderColor: 'grey.300', borderRadius: 1, fontFamily: MONO, fontSize: 12, maxHeight: 320, overflow: 'auto' }}>
                    {file.new_text ?? ''}
                </Box>
            </Box>
        );
    }
    if (rows.length === 0) return <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.75 }}>{`${file.name}: no text to compare (hashes only).`}</Typography>;
    return (
        <Box sx={{ mt: 0.75 }}>
            <Typography sx={{ fontSize: 12.5 }}>
                <Box component="span" sx={{ fontFamily: MONO }}>{file.name}</Box>
                {` · ${diffCounts(rows)}`}
            </Typography>
            <Box role="region" tabIndex={0} aria-label={`Changes in ${file.name}`} sx={{ mt: 0.5, border: 1, borderColor: 'grey.300', borderRadius: 1, maxHeight: 320, overflow: 'auto', bgcolor: 'grey.50' }}>
                {rows.map((r, i) =>
                    r.kind === 'gap' ? (
                        <Box key={i} sx={{ fontFamily: MONO, fontSize: 11, color: 'text.disabled', px: 1 }}>⋯</Box>
                    ) : (
                        <Box
                            key={i}
                            sx={(t) => ({
                                display: 'flex',
                                fontFamily: MONO,
                                fontSize: 12,
                                lineHeight: '18px',
                                whiteSpace: 'pre',
                                bgcolor: r.sign === '+' ? alpha(t.palette.success.main, 0.12) : r.sign === '−' ? alpha(t.palette.error.main, 0.1) : undefined,
                            })}
                        >
                            <Box aria-hidden sx={{ width: 36, textAlign: 'right', pr: 1, color: 'text.disabled', flex: 'none' }}>{r.n}</Box>
                            <Box component="span" aria-label={r.sign === '+' ? 'added' : r.sign === '−' ? 'removed' : 'unchanged'} sx={{ width: 14, flex: 'none', fontWeight: 700 }}>{r.sign}</Box>
                            <Box component="span">{r.text}</Box>
                        </Box>
                    ),
                )}
            </Box>
        </Box>
    );
}

export default function CodeChangeApproval({
    approval,
    data,
    onApprove,
    onReject,
}: {
    approval: Approval;
    data: SearchCodeChange;
    onApprove?: () => Promise<void>;
    onReject?: () => Promise<void>;
}) {
    const expiryMin = expiryMinutes(useAgentOptional()?.config);
    const [busy, setBusy] = useState(false);
    const now = useNow(approval.state === 'pending', 30000);
    const title = `Code changed in training search '${data.title}'`;
    const decide = async (approve: boolean) => {
        setBusy(true);
        try {
            await (approve ? onApprove?.() : onReject?.());
        } finally {
            setBusy(false);
        }
    };
    if (approval.state !== 'pending') {
        const d = approvalDecision(approval, expiryMin);
        const tail = approval.state === 'approved' ? ` · version ${data.code_version_to} for trial ${data.trial} and later` : d.suffix;
        return (
            <Box role="group" data-testid="agent-search-code-change" data-approval-id={approval.id} data-state={approval.state} sx={{ mt: 0.5, mx: 1, px: 1.5, py: 0.75, display: 'flex', alignItems: 'baseline', gap: 1, border: 1, borderColor: 'divider', borderLeft: `3px solid ${TONE_COLOR[d.tone]}`, borderRadius: 1, minWidth: 0 }}>
                <DecisionIcon tone={d.tone} />
                <Typography sx={{ fontSize: 12.5, color: TONE_COLOR[d.tone], flex: 'none' }}>{d.label}</Typography>
                <Typography sx={{ fontSize: 12.5, minWidth: 0, overflowWrap: 'anywhere' }}>{`${title}${tail}`}</Typography>
                {approval.decided_at && <Typography sx={{ ml: 'auto', flex: 'none', fontSize: 12, color: 'text.secondary' }}>{formatClock(approval.decided_at)}</Typography>}
            </Box>
        );
    }
    return (
        <Box role="group" data-testid="agent-search-code-change" data-approval-id={approval.id} data-state="pending" aria-label={`Waiting for your approval: ${title}`} sx={{ px: 1.5, py: 1.25, borderTop: 1, borderColor: 'divider', minWidth: 0 }}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
                <Typography variant="subtitle2" component="h3" sx={{ fontSize: 14, overflowWrap: 'anywhere' }}>{title}</Typography>
                <EffectChip effect="compute" />
                <Typography sx={{ ml: 'auto', fontSize: 12, color: 'text.secondary', display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                    <HourglassEmptyOutlinedIcon sx={{ fontSize: 16 }} aria-hidden />
                    {waitingText(approvalDeadline(approval.created_at, expiryMin), now)}
                </Typography>
            </Box>
            <Typography data-testid="agent-approval-summary" sx={{ fontSize: 13, fontWeight: 500, mt: 0.5 }}>{codeChangeSummary(data)}</Typography>
            <Box component="ul" sx={{ listStyle: 'none', m: 0, mt: 1, p: 0 }}>
                {data.files.map((f) => {
                    const changed = data.changed_files.includes(f.name);
                    return (
                        <Box component="li" key={f.name} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.25, flexWrap: 'wrap' }}>
                            <Typography sx={{ fontFamily: MONO, fontSize: 12.5 }}>{f.name}</Typography>
                            <Chip size="small" variant="outlined" color={changed ? 'warning' : 'default'} label={f.added ? 'added' : f.removed ? 'removed' : changed ? 'changed' : 'unchanged'} />
                            <Typography sx={{ fontFamily: MONO, fontSize: 11.5, color: 'text.secondary' }}>
                                {changed && f.old_sha256 ? `${shortSha(f.old_sha256)} → ${shortSha(f.new_sha256 ?? '')}` : shortSha(f.new_sha256 ?? f.old_sha256 ?? '')}
                            </Typography>
                        </Box>
                    );
                })}
                <Box component="li" sx={{ display: 'flex', gap: 1, alignItems: 'center', py: 0.25 }}>
                    <Typography sx={{ fontFamily: MONO, fontSize: 12.5 }}>params.json</Typography>
                    <Chip size="small" variant="outlined" label="per trial" />
                </Box>
            </Box>
            {data.files.filter((f) => data.changed_files.includes(f.name)).map((f) => (
                <FileDiff key={f.name} file={f} />
            ))}
            <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 1 }}>{codeChangeFoot(data)}</Typography>
            <ApprovalFooter
                technical={{ text: approval.summary ?? approval.name, testId: 'agent-approval-technical' }}
                busy={busy}
                onApprove={() => void decide(true)}
                onReject={() => void decide(false)}
            />
        </Box>
    );
}
