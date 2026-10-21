// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The approval "Start a training search" (gateway issue #168, design "ApprovalCard"): what the user hands over once —
// the goal, the search space, the budget, the way (platform template or own code), the held-back test set and how
// long the agent works on its own. Everything but the note comes from the gateway (`approval.search`). Pending it is
// the full card in the group "Waiting for your approval" (the look of the other approvals, A18); decided it is one line
// that opens to the details. The code of the notebook way uses the file view of the notebook approval (A8).

import { useState } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Collapse from '@mui/material/Collapse';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import ListItemButton from '@mui/material/ListItemButton';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import AutorenewOutlinedIcon from '@mui/icons-material/AutorenewOutlined';
import CloseIcon from '@mui/icons-material/Close';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import HourglassEmptyOutlinedIcon from '@mui/icons-material/HourglassEmptyOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import ReplayOutlinedIcon from '@mui/icons-material/ReplayOutlined';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';

import { useAgentOptional } from '../../AgentContext';
import { formatClock } from '../../format';
import { AGENT_NOTE_LABEL, approvalDeadline, approvalDecision, expiryMinutes } from '../../notebook';
import {
    codeFilesWithoutParams,
    computeNote,
    endsByText,
    fixedPairs,
    fixedSummary,
    holdoutText,
    proposalSummary,
    waitingText,
} from '../../searchApproval';
import type { SearchApprovalData } from '../../searchApproval';
import { compactNumber, goalSign, metricWords, directionText, minutesText, specText } from '../../searchView';
import type { Approval } from '../../types';
import { useNow } from '../../useNow';
import ApprovalFooter from '../ApprovalFooter';
import EffectChip from '../EffectChip';
import { DecisionIcon, DialogDecision, Facts, FileView, TONE_COLOR } from '../NotebookRunApproval';
import { AgentText } from '../PlanCard';
import { MONO } from '../tokens';

const overline = { fontSize: 11, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'text.secondary', mb: 0.5 } as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <Box component="section" aria-label={title} sx={{ mt: 1.25, minWidth: 0 }}>
            <Typography component="div" sx={overline}>
                {title}
            </Typography>
            {children}
        </Box>
    );
}

function BudgetRow({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: string; note?: string }) {
    return (
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, py: 0.25, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignSelf: 'center', color: 'text.secondary', '& svg': { fontSize: 18 } }} aria-hidden>
                {icon}
            </Box>
            <Typography sx={{ fontSize: 12.5, color: 'text.secondary', width: 96, flex: 'none' }}>{label}</Typography>
            <Typography component="span" sx={{ fontSize: 13, minWidth: 0, overflowWrap: 'anywhere', color: value === 'not set' ? 'text.disabled' : 'text.primary' }}>
                {value}
                {note && (
                    <Typography component="span" sx={{ fontSize: 12, color: 'text.secondary' }}>
                        {` · ${note}`}
                    </Typography>
                )}
            </Typography>
        </Box>
    );
}

/** The goal, the space and the budget: shared by the card and the decided line's details. */
function Terms({ d }: { d: SearchApprovalData }) {
    const [fixedOpen, setFixedOpen] = useState(false);
    const words = metricWords(d.objective);
    const b = d.budget ?? {};
    const fixed = fixedPairs(d.fixed);
    return (
        <>
            <Section title="Goal">
                <Typography sx={{ fontSize: 13 }}>{`${words.label} · ${directionText(d.objective)}`}</Typography>
            </Section>
            <Section title="Search space">
                <Box sx={{ overflowX: 'auto' }}>
                    <Table size="small" aria-label="Search space">
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ fontSize: 12, color: 'text.secondary', fontWeight: 400 }}>Parameter</TableCell>
                                <TableCell sx={{ fontSize: 12, color: 'text.secondary', fontWeight: 400 }}>Kind</TableCell>
                                <TableCell sx={{ fontSize: 12, color: 'text.secondary', fontWeight: 400 }}>Bounds or values</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {Object.keys(d.space ?? {}).map((name) => {
                                const t = specText(d.space[name]);
                                return (
                                    <TableRow key={name}>
                                        <TableCell sx={{ fontFamily: MONO, fontSize: 12 }}>{name}</TableCell>
                                        <TableCell sx={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{t.kind}</TableCell>
                                        <TableCell sx={{ fontFamily: MONO, fontSize: 12, overflowWrap: 'anywhere' }}>{t.vals}</TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </Box>
                {fixed.length > 0 && (
                    <>
                        <Button size="small" onClick={() => setFixedOpen((o) => !o)} aria-expanded={fixedOpen} sx={{ textTransform: 'none', mt: 0.5, justifyContent: 'flex-start', textAlign: 'left' }}>
                            {`${fixedOpen ? '▼' : '▶'} ${fixedSummary(d.fixed)}`}
                        </Button>
                        <Collapse in={fixedOpen} unmountOnExit>
                            <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 2, rowGap: 0.25, m: 0, pl: 1 }}>
                                {fixed.map((p) => (
                                    <Box key={p.name} sx={{ display: 'contents' }}>
                                        <Typography component="dt" sx={{ fontFamily: MONO, fontSize: 12, color: 'text.secondary' }}>{p.name}</Typography>
                                        <Typography component="dd" sx={{ m: 0, fontFamily: MONO, fontSize: 12, overflowWrap: 'anywhere' }}>{p.value}</Typography>
                                    </Box>
                                ))}
                            </Box>
                        </Collapse>
                    </>
                )}
            </Section>
            <Section title="Budget">
                <BudgetRow
                    icon={<ReplayOutlinedIcon />}
                    label="Runs"
                    value={typeof b.max_runs === 'number' ? String(b.max_runs) : 'not set'}
                    note={computeNote(d.compute)}
                />
                <BudgetRow
                    icon={<TimerOutlinedIcon />}
                    label="Compute time"
                    value={typeof b.max_compute_minutes === 'number' ? minutesText(b.max_compute_minutes) : 'not set'}
                    note={typeof b.max_compute_minutes === 'number' ? 'over all runs' : undefined}
                />
                <BudgetRow
                    icon={<FlagOutlinedIcon />}
                    label="Target"
                    value={typeof b.target === 'number' ? `${words.short} ${goalSign(d.objective)} ${compactNumber(b.target)}` : 'not set'}
                />
                <BudgetRow
                    icon={<HourglassEmptyOutlinedIcon />}
                    label="Patience"
                    value={typeof b.patience === 'number' ? `${b.patience} runs` : 'not set'}
                    note={typeof b.patience === 'number' ? 'without improvement' : undefined}
                />
                <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.5 }}>The first limit reached ends the search.</Typography>
            </Section>
        </>
    );
}

/** The way: the platform template's base training, or the own code with its files. */
function Way({ d, layout, tab, onTab, onExpand }: { d: SearchApprovalData; layout: 'panel' | 'page'; tab: number; onTab: (i: number) => void; onExpand: () => void }) {
    if (d.path === 'notebook' && d.code) {
        const code = codeFilesWithoutParams(d.code);
        return (
            <Section title="Way">
                <Typography sx={{ fontSize: 13, fontWeight: 500 }}>Own code in your notebook server</Typography>
                <Facts data={code} size={layout} />
                <FileView data={code} size={layout} tab={tab} onTab={onTab} />
                <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.75 }}>params.json · written per trial</Typography>
                <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                    Code is fixed for the whole search. Runs that only change params.json need no approval; any code change asks you again.
                </Typography>
                <Button size="small" startIcon={<OpenInFullIcon fontSize="small" />} onClick={onExpand} aria-haspopup="dialog" sx={{ mt: 0.5 }}>
                    Expand code
                </Button>
            </Section>
        );
    }
    const base = d.base;
    const ds = base?.dataset;
    const baseLine = [base ? `#${base.container_id}` : '', base?.provider, base?.architecture].filter(Boolean).join(' · ');
    const dsLine = ds ? [ds.name ? `${ds.name} (#${ds.id})` : `#${ds.id}`, ds.classes ? `${ds.classes} classes` : '', ds.images ? `${ds.images} images` : ''].filter(Boolean).join(' · ') : '';
    return (
        <Section title="Way">
            <Typography sx={{ fontSize: 13, fontWeight: 500 }}>Platform template</Typography>
            <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 2, rowGap: 0.25, m: 0, mt: 0.5 }}>
                {baseLine && (
                    <>
                        <Typography component="dt" sx={{ fontSize: 12, color: 'text.secondary' }}>Base training</Typography>
                        <Typography component="dd" sx={{ m: 0, fontSize: 12.5, overflowWrap: 'anywhere' }}>{baseLine}</Typography>
                    </>
                )}
                {dsLine && (
                    <>
                        <Typography component="dt" sx={{ fontSize: 12, color: 'text.secondary' }}>Dataset</Typography>
                        <Typography component="dd" sx={{ m: 0, fontSize: 12.5, overflowWrap: 'anywhere' }}>{dsLine}</Typography>
                    </>
                )}
            </Box>
            <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.5 }}>Each trial is a copy of this training with other hyperparameters.</Typography>
        </Section>
    );
}

function Line({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mt: 0.75 }}>
            <Box sx={{ display: 'flex', color: 'text.secondary', '& svg': { fontSize: 18 } }} aria-hidden>{icon}</Box>
            <Typography sx={{ fontSize: 12.5 }}>{children}</Typography>
        </Box>
    );
}

/**
 * The approval of a search proposal. `data` is `approval.search`; `layout` is the width the card is drawn in.
 * Pending: the full card with Reject and Approve; decided: one line that opens to the terms.
 */
export default function SearchApproval({
    approval,
    data,
    layout,
    onApprove,
    onReject,
}: {
    approval: Approval;
    data: SearchApprovalData;
    layout: 'panel' | 'page';
    onApprove?: () => Promise<void>;
    onReject?: () => Promise<void>;
}) {
    const config = useAgentOptional()?.config;
    const expiryMin = expiryMinutes(config);
    const [tab, setTab] = useState(0);
    const [open, setOpen] = useState(false);
    const [dialog, setDialog] = useState(false);
    const [busy, setBusy] = useState(false);
    const pending = approval.state === 'pending';
    const now = useNow(pending, 30000);
    const title = `Start a training search`;
    const decide = async (approve: boolean) => {
        setBusy(true);
        try {
            await (approve ? onApprove?.() : onReject?.());
        } finally {
            setBusy(false);
        }
    };

    if (!pending) {
        const decision = approvalDecision(approval, expiryMin);
        const at = approval.state === 'expired' ? approval.decided_at ?? approvalDeadline(approval.created_at, expiryMin) : approval.decided_at;
        const runs = typeof data.budget?.max_runs === 'number' ? ` · up to ${data.budget.max_runs} runs` : '';
        return (
            <Box
                role="group"
                data-testid="agent-search-approval"
                data-approval-id={approval.id}
                data-state={approval.state}
                aria-label={`${decision.label}: ${title} ${data.title}`}
                sx={{ border: 1, borderColor: 'divider', borderLeft: 3, borderLeftColor: TONE_COLOR[decision.tone], borderRadius: 1, minWidth: 0 }}
            >
                <ListItemButton dense onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={`${decision.label}: ${title} ${data.title}. ${open ? 'Hide details' : 'Show details'}`} sx={{ px: 1.5, gap: 1, alignItems: 'baseline', minWidth: 0 }}>
                    <DecisionIcon tone={decision.tone} />
                    <Typography sx={{ fontSize: 12.5, color: TONE_COLOR[decision.tone], flex: 'none' }}>{decision.label}</Typography>
                    <Typography sx={{ fontSize: 12.5, minWidth: 0, overflowWrap: 'anywhere' }}>{`${title} · ${data.title}${runs}${decision.suffix}`}</Typography>
                    {at && <Typography sx={{ ml: 'auto', flex: 'none', fontSize: 12, color: 'text.secondary' }}>{formatClock(at)}</Typography>}
                    <Box sx={{ display: 'flex', flex: 'none' }}>{open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}</Box>
                </ListItemButton>
                <Collapse in={open} unmountOnExit>
                    <Box sx={{ px: 1.5, pb: 1.5, minWidth: 0 }}>
                        {data.note && <AgentText label={AGENT_NOTE_LABEL} text={data.note} testId="agent-search-approval-note" />}
                        <Terms d={data} />
                    </Box>
                </Collapse>
            </Box>
        );
    }

    return (
        <>
            <Box role="group" data-testid="agent-search-approval" data-approval-id={approval.id} data-state="pending" aria-label={`Waiting for your approval: ${title}`} sx={{ px: 1.5, py: 1.25, borderTop: 1, borderColor: 'divider', minWidth: 0 }}>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, minWidth: 0 }}>
                    <Typography variant="subtitle2" component="h3" sx={{ fontSize: 14 }}>
                        {title}
                    </Typography>
                    <EffectChip effect="compute" />
                    <Typography sx={{ ml: 'auto', fontSize: 12, color: 'text.secondary', display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                        <HourglassEmptyOutlinedIcon sx={{ fontSize: 16 }} aria-hidden />
                        {waitingText(data.expires_at, now)}
                    </Typography>
                </Box>
                <Typography data-testid="agent-approval-summary" sx={{ fontSize: 13, fontWeight: 500, mt: 0.5, overflowWrap: 'anywhere' }}>
                    {proposalSummary(data)}
                </Typography>
                <Terms d={data} />
                <Way d={data} layout={layout} tab={tab} onTab={setTab} onExpand={() => setDialog(true)} />
                <Box sx={{ mt: 1 }}>
                    <Line icon={<LockOutlinedIcon />}>{holdoutText(data.holdout)}</Line>
                    <Line icon={<AutorenewOutlinedIcon />}>{`The agent continues on its own after each run (at most ${data.autonomy?.max_auto_turns ?? 0} turns without you).`}</Line>
                    <Line icon={<InfoOutlinedIcon />}>{endsByText(config?.search_max_hours)}</Line>
                </Box>
                {data.note && <AgentText label={AGENT_NOTE_LABEL} text={data.note} testId="agent-search-approval-note" />}
                <ApprovalFooter
                    technical={{ text: approval.summary ?? approval.name, testId: 'agent-approval-technical' }}
                    busy={busy}
                    onApprove={() => void decide(true)}
                    onReject={() => void decide(false)}
                />
            </Box>
            {data.code && (
                <Dialog open={dialog} onClose={() => setDialog(false)} fullWidth maxWidth="lg" PaperProps={{ sx: { height: 'calc(100% - 64px)' } }} aria-labelledby={`agent-search-approval-title-${approval.id}`}>
                    <DialogTitle id={`agent-search-approval-title-${approval.id}`} sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 18 }}>
                        {title}
                        <EffectChip effect="compute" />
                        <IconButton onClick={() => setDialog(false)} aria-label="Close" size="small" sx={{ ml: 'auto' }}>
                            <CloseIcon fontSize="small" />
                        </IconButton>
                    </DialogTitle>
                    <DialogContent dividers>
                        <Facts data={codeFilesWithoutParams(data.code)} size="dialog" />
                        <FileView data={codeFilesWithoutParams(data.code)} size="dialog" tab={tab} onTab={setTab} />
                    </DialogContent>
                    <DialogActions>
                        <DialogDecision onApprove={onApprove} onReject={onReject} />
                    </DialogActions>
                </Dialog>
            )}
        </>
    );
}
