// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The approval of a run in the chat's notebook server (own code C-E4): instead of the text preview of a platform
// call, the code of the run file by file — one tab per file, the entry file first and marked, line numbers, the size
// and the SHA-256 below the tabs, the datasets and the limits as facts. What the card shows comes from the gateway
// (the approval's field `notebook`), never from the agent's text.
//
// The code is set as plain text: every line is a text child node, there is no `dangerouslySetInnerHTML`, no Markdown
// and no link inside the code. Once decided the card collapses to one line (the history stays short) and can be
// opened again without its buttons.
//
// Both sizes of the platform use it: the 400 px panel and the chat column of /ai-agent (`layout`). The dialog that
// "Expand" opens shows the same file view without a height limit.

import { useEffect, useRef, useState } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import ListItemButton from '@mui/material/ListItemButton';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import BlockIcon from '@mui/icons-material/Block';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import TimerOffIcon from '@mui/icons-material/TimerOff';

import { useAgentOptional } from '../AgentContext';
import { formatBytes } from '../files';
import { formatClock } from '../format';
import {
    AGENT_NOTE_LABEL,
    approvalDeadline,
    approvalDecision,
    codeLines,
    datasetLabel,
    entryTitle,
    expiryMinutes,
    isPreviewable,
    limitsLine,
    midTrunc,
    notebookCells,
    orderFiles,
    shortSha,
} from '../notebook';
import type { NotebookApprovalData, NotebookCell, NotebookFile } from '../notebook';
import type { Approval } from '../types';
import EffectChip from './EffectChip';
import { AgentText, Technical } from './PlanCard';
import { agentColors, MONO } from './tokens';

/** The size the card is drawn in: the panel, the chat column of /ai-agent, or the full-height dialog. */
export type NotebookSize = 'panel' | 'page' | 'dialog';

/** How long a name may be in each place of the card (design, gap L1). */
const LEN: Record<NotebookSize, { title: number; tab: number; dataset: number; line: number }> = {
    panel: { title: 28, tab: 22, dataset: 24, line: 18 },
    page: { title: 48, tab: 30, dataset: 40, line: 40 },
    dialog: { title: 60, tab: 40, dataset: 40, line: 40 },
};

/** Height of the code field (design: 320 px in the panel, 400 px on the page, no limit in the dialog). */
const codeMax = (size: NotebookSize): number | undefined => (size === 'dialog' ? undefined : size === 'panel' ? 320 : 400);

const MONO_LINE = { fontFamily: MONO, fontSize: 12, lineHeight: '18px', whiteSpace: 'pre' } as const;

/** One line of the code view: its number in a sticky column, the text as a text child node. */
function CodeLineRow({ n, text }: { n: number; text: string }) {
    return (
        <Box sx={{ display: 'flex', minWidth: 0 }}>
            <Box
                aria-hidden
                sx={{
                    ...MONO_LINE,
                    flex: 'none',
                    width: 40,
                    textAlign: 'right',
                    pr: 1.5,
                    color: 'text.disabled',
                    userSelect: 'none',
                    position: 'sticky',
                    left: 0,
                    bgcolor: 'grey.50',
                }}
            >
                {n}
            </Box>
            <Box component="span" sx={{ ...MONO_LINE, minWidth: 0 }}>
                {text === '' ? ' ' : text}
            </Box>
        </Box>
    );
}

/** The code of one file: the lines of a script, or the code cells of a notebook with a separator per cell. */
function CodeField({ file, size }: { file: NotebookFile; size: NotebookSize }) {
    const cells = file.name.toLowerCase().endsWith('.ipynb') ? notebookCells(file.text ?? '') : undefined;
    const lineCount = cells ? cells.reduce((a, c) => a + c.lines.length, 0) : codeLines(file.text ?? '').length;
    return (
        <Box
            role="tabpanel"
            tabIndex={0}
            aria-label={`${file.name}, ${lineCount} lines, read-only`}
            sx={{
                bgcolor: 'grey.50',
                border: 1,
                borderColor: 'grey.300',
                borderRadius: 1,
                maxHeight: codeMax(size),
                overflow: 'auto',
                py: 0.75,
            }}
        >
            {cells
                ? cells.map((cell: NotebookCell) => (
                      <Box key={cell.n}>
                          <Divider textAlign="left" sx={{ my: 0.5, '&::before': { width: 8 } }}>
                              <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>
                                  {`cell ${cell.n}`}
                              </Typography>
                          </Divider>
                          {cell.lines.map((l) => (
                              <CodeLineRow key={l.n} n={l.n} text={l.text} />
                          ))}
                      </Box>
                  ))
                : codeLines(file.text ?? '').map((l) => <CodeLineRow key={l.n} n={l.n} text={l.text} />)}
        </Box>
    );
}

/** Name, entry marker, size, SHA-256 and the copy button of the chosen file. */
function FileMeta({ file, entry }: { file: NotebookFile; entry: string }) {
    const [copied, setCopied] = useState(false);
    const previewable = isPreviewable(file.name, file.text);
    const copy = () => {
        // a convenience only: nothing on the platform changes, and a browser without the clipboard API stays silent
        try {
            navigator.clipboard?.writeText(file.text ?? '').then(
                () => setCopied(true),
                () => undefined,
            );
        } catch {
            /* nothing to report */
        }
        window.setTimeout(() => setCopied(false), 1500);
    };
    return (
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, minWidth: 0, pt: 0.75 }}>
            <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontFamily: MONO, fontSize: 13, overflowWrap: 'anywhere', mb: 0.25 }}>
                    {file.name}
                </Typography>
                <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                    {file.name === entry && <Box component="span" sx={{ color: 'primary.main' }}>Entry file · </Box>}
                    {formatBytes(file.size)}
                    {file.sha256 && (
                        <>
                            {' · '}
                            <Tooltip title={file.sha256}>
                                <Box component="span" sx={{ fontFamily: MONO }}>
                                    {`SHA-256 ${shortSha(file.sha256)}`}
                                </Box>
                            </Tooltip>
                        </>
                    )}
                </Typography>
            </Box>
            {previewable && (
                <Tooltip title={copied ? 'Copied' : `Copy ${file.name}`}>
                    <IconButton size="small" onClick={copy} aria-label={`Copy ${file.name}`} sx={{ ml: 'auto', flex: 'none' }}>
                        {copied ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
                    </IconButton>
                </Tooltip>
            )}
        </Box>
    );
}

/** The datasets and the limits of the run as a grid: two rows in the panel, wider values on the page. */
function Facts({ data, size }: { data: NotebookApprovalData; size: NotebookSize }) {
    const datasetMax = LEN[size].dataset;
    return (
        <Box
            component="dl"
            sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 2, rowGap: 0.5, m: 0, mt: 1, minWidth: 0 }}
        >
            <Typography component="dt" sx={{ fontSize: 12, color: 'text.secondary' }}>
                Datasets
            </Typography>
            <Box component="dd" sx={{ m: 0, display: 'flex', flexWrap: 'wrap', gap: 0.5, minWidth: 0 }}>
                {data.datasets.length === 0 ? (
                    <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>none</Typography>
                ) : (
                    data.datasets.map((d) => (
                        <Tooltip key={d.id} title={datasetLabel(d)}>
                            <Chip size="small" variant="outlined" label={midTrunc(datasetLabel(d), datasetMax)} />
                        </Tooltip>
                    ))
                )}
            </Box>
            <Typography component="dt" sx={{ fontSize: 12, color: 'text.secondary' }}>
                Limits
            </Typography>
            <Typography component="dd" sx={{ m: 0, fontSize: 12.5 }}>
                {limitsLine(data.limits)}
            </Typography>
        </Box>
    );
}

/** The file view of one run: the tabs over its files, the meta line and the code of the chosen one. */
function FileView({
    data,
    size,
    tab,
    onTab,
}: {
    data: NotebookApprovalData;
    size: NotebookSize;
    tab: number;
    onTab: (i: number) => void;
}) {
    const files = orderFiles(data.files, data.entry);
    if (files.length === 0) return null;
    const idx = Math.min(Math.max(0, tab), files.length - 1);
    const file = files[idx];
    const max = LEN[size].tab;
    return (
        <Box sx={{ minWidth: 0 }}>
            <Tabs
                value={idx}
                onChange={(_e, v: number) => onTab(v)}
                variant="scrollable"
                scrollButtons="auto"
                aria-label="Files in this run"
                sx={{ minHeight: 40, mt: 1 }}
            >
                {files.map((f, i) => (
                    <Tab
                        key={f.name}
                        value={i}
                        label={midTrunc(f.name, max)}
                        title={f.name}
                        iconPosition="start"
                        icon={f.name === data.entry ? <PlayArrowIcon fontSize="small" /> : undefined}
                        aria-label={f.name === data.entry ? `${f.name}, entry file` : f.name}
                        sx={{ minHeight: 40, textTransform: 'none', fontFamily: MONO, fontSize: 12.5 }}
                    />
                ))}
            </Tabs>
            <FileMeta file={file} entry={data.entry} />
            <Box sx={{ mt: 0.75 }}>
                {isPreviewable(file.name, file.text) ? (
                    <CodeField file={file} size={size} />
                ) : (
                    <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>
                        No preview for this file type.
                    </Typography>
                )}
            </Box>
        </Box>
    );
}

/** The agent's own note about the run: its text, apart and marked, never mixed into the gateway's facts (#92). */
function Note({ data }: { data: NotebookApprovalData }) {
    return data.note ? <AgentText label={AGENT_NOTE_LABEL} text={data.note} testId="agent-notebook-approval-note" /> : null;
}

/** Approve and Reject; both are locked while one of them runs. */
function Actions({
    onApprove,
    onReject,
    onExpand,
}: {
    onApprove?: () => Promise<void>;
    onReject?: () => Promise<void>;
    onExpand?: () => void;
}) {
    const [busy, setBusy] = useState(false);
    const decide = async (approve: boolean) => {
        setBusy(true);
        try {
            await (approve ? onApprove?.() : onReject?.());
        } finally {
            setBusy(false);
        }
    };
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1.25 }}>
            <Button size="small" variant="contained" disabled={busy} onClick={() => void decide(true)}>
                Approve
            </Button>
            <Button size="small" variant="outlined" color="error" disabled={busy} onClick={() => void decide(false)}>
                Reject
            </Button>
            {onExpand && (
                <Button
                    size="small"
                    variant="text"
                    startIcon={<OpenInFullIcon fontSize="small" />}
                    onClick={onExpand}
                    aria-haspopup="dialog"
                    sx={{ ml: 'auto', flex: 'none' }}
                >
                    Expand
                </Button>
            )}
        </Box>
    );
}

/** The symbol of a decided line; the state is never told by the colour alone (it stands next to the word). */
function DecisionIcon({ tone }: { tone: 'ok' | 'error' | 'muted' }) {
    if (tone === 'ok') return <CheckIcon sx={{ fontSize: 16, color: agentColors.ok, flex: 'none' }} aria-hidden />;
    if (tone === 'error') return <BlockIcon sx={{ fontSize: 16, color: 'error.main', flex: 'none' }} aria-hidden />;
    return <TimerOffIcon sx={{ fontSize: 16, color: 'text.disabled', flex: 'none' }} aria-hidden />;
}

const TONE_COLOR = { ok: agentColors.ok, error: 'error.main', muted: 'text.disabled' } as const;

/**
 * The approval of one run of the chat's notebook server. Pending it is the full card (title, chip, facts, the code
 * file by file and the decision); decided it is one line that can be opened again to read the code (gap L8).
 */
export default function NotebookRunApproval({
    approval,
    data,
    layout,
    onApprove,
    onReject,
}: {
    approval: Approval;
    /** The structured data of the run (the approval's field `notebook`), as the gateway built it. */
    data: NotebookApprovalData;
    /** The width the card is drawn in: the 400 px panel or the chat column of /ai-agent. */
    layout: 'panel' | 'page';
    onApprove?: () => Promise<void>;
    onReject?: () => Promise<void>;
}) {
    const expiryMin = expiryMinutes(useAgentOptional()?.config);
    const [tab, setTab] = useState(0);
    const [open, setOpen] = useState(false);
    const [dialog, setDialog] = useState(false);
    const dialogBody = useRef<HTMLDivElement>(null);
    // the dialog opens on the tab the card shows (design, gap L6): the focus starts there, not on the close button
    useEffect(() => {
        if (!dialog) return;
        dialogBody.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
    }, [dialog]);
    const fullTitle = entryTitle(data.entry);
    const decision = approvalDecision(approval, expiryMin);

    if (approval.state !== 'pending') {
        const at =
            approval.state === 'expired'
                ? approval.decided_at ?? approvalDeadline(approval.created_at, expiryMin)
                : approval.decided_at;
        const atText = at ? formatClock(at) : '';
        return (
            <Box
                role="group"
                data-testid="agent-notebook-approval"
                data-approval-id={approval.id}
                data-state={approval.state}
                aria-label={`${decision.label}: ${fullTitle}`}
                sx={{
                    mt: 0.5,
                    mx: 1,
                    border: 1,
                    borderColor: 'divider',
                    borderLeft: `3px solid ${TONE_COLOR[decision.tone]}`,
                    borderRadius: 1,
                    minWidth: 0,
                }}
            >
                <ListItemButton
                    dense
                    onClick={() => setOpen((o) => !o)}
                    aria-expanded={open}
                    aria-label={`${decision.label}: ${fullTitle}. ${open ? 'Hide code' : 'Show code'}`}
                    sx={{ gap: 1, alignItems: 'baseline', minWidth: 0 }}
                >
                    <DecisionIcon tone={decision.tone} />
                    <Typography sx={{ fontSize: 12.5, color: TONE_COLOR[decision.tone], flex: 'none' }}>
                        {decision.label}
                    </Typography>
                    <Typography sx={{ fontSize: 12.5, minWidth: 0, overflowWrap: 'anywhere' }}>
                        {`${entryTitle(data.entry, LEN[layout].line)}${decision.suffix}`}
                    </Typography>
                    {atText && (
                        <Typography sx={{ ml: 'auto', flex: 'none', fontSize: 12, color: 'text.secondary' }}>
                            {atText}
                        </Typography>
                    )}
                    <Box sx={{ display: 'flex', flex: 'none', color: agentColors.muted }}>
                        {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                    </Box>
                </ListItemButton>
                <Collapse in={open} unmountOnExit>
                    <Box sx={{ px: 1.5, pb: 1.5, minWidth: 0 }}>
                        {/* the note belongs here too (gap L2): it is what the run was for, also after the decision */}
                        <Note data={data} />
                        <Facts data={data} size={layout} />
                        <FileView data={data} size={layout} tab={tab} onTab={setTab} />
                    </Box>
                </Collapse>
            </Box>
        );
    }

    return (
        <>
            <Box
                role="group"
                data-testid="agent-notebook-approval"
                data-approval-id={approval.id}
                data-state={approval.state}
                aria-label={`Waiting for your approval: ${fullTitle}`}
                sx={{ px: 1.5, py: 1.25, borderTop: 1, borderColor: 'divider', minWidth: 0 }}
            >
                <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, minWidth: 0 }}>
                    <Typography
                        variant="subtitle2"
                        component="h3"
                        sx={{ fontSize: 14, overflowWrap: 'anywhere', minWidth: 0 }}
                    >
                        {entryTitle(data.entry, LEN[layout].title)}
                    </Typography>
                    <EffectChip effect="compute" />
                </Box>
                <Typography sx={{ fontSize: 12, color: 'text.secondary', display: 'block' }}>
                    Approval for every run
                </Typography>
                <Note data={data} />
                <Facts data={data} size={layout} />
                <FileView data={data} size={layout} tab={tab} onTab={setTab} />
                <Technical
                    text={[approval.name, approval.preview ?? ''].filter(Boolean).join('\n\n')}
                    testId="agent-approval-technical"
                />
                <Actions onApprove={onApprove} onReject={onReject} onExpand={() => setDialog(true)} />
            </Box>
            <Dialog
                open={dialog}
                onClose={() => setDialog(false)}
                fullWidth
                maxWidth="lg"
                PaperProps={{ sx: { height: 'calc(100% - 64px)' } }}
                aria-labelledby={`agent-notebook-approval-title-${approval.id}`}
            >
                <DialogTitle
                    id={`agent-notebook-approval-title-${approval.id}`}
                    sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, fontSize: 18 }}
                >
                    {entryTitle(data.entry, LEN.dialog.title)}
                    <EffectChip effect="compute" />
                    <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Approval for every run</Typography>
                    <IconButton
                        onClick={() => setDialog(false)}
                        aria-label="Close"
                        size="small"
                        sx={{ ml: 'auto', flex: 'none' }}
                    >
                        <CloseIcon fontSize="small" />
                    </IconButton>
                </DialogTitle>
                <DialogContent dividers ref={dialogBody} sx={{ minWidth: 0 }}>
                    <Note data={data} />
                    <Facts data={data} size="dialog" />
                    <FileView data={data} size="dialog" tab={tab} onTab={setTab} />
                </DialogContent>
                <DialogActions>
                    <DialogDecision onApprove={onApprove} onReject={onReject} />
                </DialogActions>
            </Dialog>
        </>
    );
}

/** Reject and Approve in the dialog's footer; the same busy rule as the actions of the card. */
function DialogDecision({ onApprove, onReject }: { onApprove?: () => Promise<void>; onReject?: () => Promise<void> }) {
    const [busy, setBusy] = useState(false);
    const decide = async (approve: boolean) => {
        setBusy(true);
        try {
            await (approve ? onApprove?.() : onReject?.());
        } finally {
            setBusy(false);
        }
    };
    return (
        <>
            <Button size="small" variant="outlined" color="error" disabled={busy} onClick={() => void decide(false)}>
                Reject
            </Button>
            <Button size="small" variant="contained" disabled={busy} onClick={() => void decide(true)}>
                Approve
            </Button>
        </>
    );
}
