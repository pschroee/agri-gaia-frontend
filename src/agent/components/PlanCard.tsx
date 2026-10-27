// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The plan card (issue #70, autonomy E4): a plan of several platform calls with one decision by the user. Shown
// under the answer that proposed it, in the panel, on /ai-agent and in the subagent view. Since gateway issue #72
// it is the only place where a plan is decided: the list of pending approvals shows a reference line to it
// (PlanReference). What a step does is the gateway's summary; the agent's title and notes are shown apart and
// marked as not verified.
//
// An autonomous plan (E1) shows more: its budget and what it has used of it, the progress of the step it is on
// (percent, the platform's line, the runtime and, where the gateway can estimate it, the time left and the tail of
// the job's log), the objects it produced, and the controls the user has — pause, resume, cancel and stop the
// platform job of a step. The words are in planText.ts, the rules about states and progress in plan.ts, so both
// can be tested without rendering this file.

import { ReactElement, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Collapse from '@mui/material/Collapse';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormHelperText from '@mui/material/FormHelperText';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Link from '@mui/material/Link';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import Paper from '@mui/material/Paper';
import { alpha } from '@mui/material/styles';
import type { SxProps, Theme } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CheckIcon from '@mui/icons-material/Check';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import ListAltOutlinedIcon from '@mui/icons-material/ListAltOutlined';
import BackHandIcon from '@mui/icons-material/BackHand';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import PauseIcon from '@mui/icons-material/Pause';
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import StopIcon from '@mui/icons-material/Stop';
import StopCircleIcon from '@mui/icons-material/StopCircle';
import TimelapseIcon from '@mui/icons-material/Timelapse';
import ViewInArOutlinedIcon from '@mui/icons-material/ViewInArOutlined';

import { agentApi } from '../api';
import { jobOfStep } from '../jobs';
import { LISTED_FILES } from '../uploads';
import UploadFiles from './UploadFiles';
import type { WatchJob } from '../jobs';
import { defaultOptIn, notifyCheckbox, permissionOf, browserNotify, requestPermission } from '../notify';
import type { NotifyPermission } from '../notify';
import {
    agentNote,
    agentTitle,
    awaitingPlatform,
    bannerJobKind,
    budgetLine,
    createdStay,
    grantRows,
    isAutonomous,
    needsInput,
    outputKind,
    outputLink,
    planLabel,
    planOutputs,
    stepCount,
    stepMain,
    stepPhase,
    stepRefLink,
    stepRefs,
    stepRuntime,
    stepTechnical,
    stepTimeLine,
    stepMessage,
    summaryChanged,
    summaryParts,
    PHASE_LABEL,
    Plan,
    PlanStep,
    StepPhase,
} from '../plan';
import {
    approvalExplain,
    budgetRowsOf,
    CHANGE_HINT,
    cancelConfirmText,
    cancelledText,
    completedText,
    computeStepLine,
    failedText,
    failedTitle,
    FAILED_HINT,
    IRREVERSIBLE_HINT,
    LOG_SWITCH,
    logTail,
    NOTIFY_LABEL,
    pauseAllowed,
    pauseText,
    pauseTitle,
    planChip,
    rejectText,
    RESTART_INTERRUPTED,
    resumeAllowed,
    rightText,
    RIGHTS_END_TEXT,
    RIGHTS_OVERLINE,
    BUDGET_OVERLINE,
    CREATED_OVERLINE,
    AGENT_NOTE_LABEL,
    AGENT_TITLE_LABEL,
    cancelAllowed,
    imageOriginText,
    uncoveredSummary,
    uncoveredText,
    stepRefText,
    waitingForApproval,
    SEARCH_WAITING_INFO,
    waitingInfo,
} from '../planText';
import { scrollToPlanCard, useRegisterPlanCard } from '../planRegistry';
import type { Approval } from '../types';
import EffectChip from './EffectChip';
import PlanStepList from './plan/PlanStepList';
import { agentColors, MONO } from './tokens';

/** The step's state mark, one per phase (design, MUI mapping). */
export const PHASE_ICON: Record<StepPhase, ReactElement> = {
    done: <CheckCircleIcon sx={{ fontSize: 17, color: agentColors.ok }} aria-hidden />,
    approval: <HourglassEmptyIcon sx={{ fontSize: 17, color: agentColors.amber }} aria-hidden />,
    open: <RadioButtonUncheckedIcon sx={{ fontSize: 17, color: 'text.disabled' }} aria-hidden />,
    starting: <CircularProgress size={14} sx={{ color: 'text.secondary' }} aria-hidden />,
    queued: <RadioButtonUncheckedIcon sx={{ fontSize: 17, color: 'text.disabled' }} aria-hidden />,
    running: <CircularProgress size={14} aria-hidden />,
    paused: <PauseCircleOutlineIcon sx={{ fontSize: 17, color: agentColors.amber }} aria-hidden />,
    failed: <ErrorOutlineIcon sx={{ fontSize: 17, color: agentColors.red }} aria-hidden />,
    notrun: <RemoveCircleOutlineIcon sx={{ fontSize: 17, color: 'text.disabled' }} aria-hidden />,
    stopped: <StopCircleIcon sx={{ fontSize: 17, color: 'text.disabled' }} aria-hidden />,
};

/** The left border of the card, one colour per state (design, MUI mapping). */
function edgeColor(plan: Plan): string {
    switch (plan.state) {
        case 'approved':
            return 'primary.main';
        case 'paused':
            return 'warning.main';
        case 'completed':
            return 'success.light';
        case 'failed':
            return 'error.main';
        case 'cancelled':
            return 'grey.400';
        default:
            return 'warning.main';
    }
}

/** The body of a step the card still expects work from (L7): anything else shows no note. */
const NOTE_PHASES: StepPhase[] = ['open', 'starting', 'running', 'paused', 'approval'];

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
    sx,
}: {
    text: string;
    open?: boolean;
    testId?: string;
    /** No height limit (irreversible calls show their body in full). */
    full?: boolean;
    sx?: SxProps<Theme>;
}) {
    return (
        <Box component="details" open={open} sx={[{ mt: 0.5 }, ...(Array.isArray(sx) ? sx : sx ? [sx] : [])]} data-testid={testId}>
            <Box
                component="summary"
                sx={{ fontSize: 12, cursor: 'pointer', color: agentColors.muted, whiteSpace: 'nowrap' }}
            >
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

/** The height of the error block: exactly three lines of the monospace 12 px text (design, issue #112). */
const ERROR_LINES = 3;
const ERROR_LINE_HEIGHT = 18;

/**
 * The red block of a failed run or check (issue #112, design *Error*): the gateway's error text in monospace,
 * exactly three lines high, with "Show more" only while it is cut. The block stands open; the link only takes
 * the three-line limit away, and "Show less" puts it back.
 */
export function ErrorBlock({ text, testId = 'agent-error-block' }: { text: string; testId?: string }) {
    const [open, setOpen] = useState(false);
    const [cut, setCut] = useState(false);
    const body = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const el = body.current;
        if (el) setCut(el.scrollHeight > el.clientHeight + 1);
    }, [text, open]);
    return (
        <Box data-testid={testId} sx={{ minWidth: 0 }}>
            <Typography variant="body2" sx={{ color: 'error.main', fontWeight: 500 }}>
                Error
            </Typography>
            <Box
                ref={body}
                component="pre"
                data-testid={`${testId}-text`}
                sx={{
                    m: 0,
                    mt: 0.5,
                    px: '10px',
                    py: 0.75,
                    borderRadius: 0.5,
                    bgcolor: (t) => alpha(t.palette.error.main, 0.08),
                    border: 1,
                    borderColor: 'error.light',
                    color: 'error.main',
                    fontFamily: MONO,
                    fontSize: 12,
                    lineHeight: `${ERROR_LINE_HEIGHT}px`,
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'anywhere',
                    ...(open
                        ? {}
                        : {
                              maxHeight: ERROR_LINES * ERROR_LINE_HEIGHT,
                              overflow: 'hidden',
                              display: '-webkit-box',
                              WebkitLineClamp: ERROR_LINES,
                              WebkitBoxOrient: 'vertical',
                          }),
                }}
            >
                {text}
            </Box>
            {cut && (
                <Link
                    component="button"
                    type="button"
                    variant="caption"
                    data-testid={`${testId}-toggle`}
                    aria-expanded={open}
                    onClick={() => setOpen((v) => !v)}
                    sx={{ mt: 0.25, textDecorationColor: 'rgba(15,84,50,0.4)' }}
                >
                    {open ? 'Show less' : 'Show more'}
                </Link>
            )}
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
export function ProposedSummary({
    summary,
    testId,
    label = 'As proposed',
}: {
    summary: string;
    testId?: string;
    label?: string;
}) {
    const parts = summaryParts(summary);
    if (!parts) return null;
    return (
        <Box component="details" data-testid={testId} sx={{ mt: 0.5 }}>
            <Box component="summary" sx={{ fontSize: 12, cursor: 'pointer', color: agentColors.muted }}>
                {label}
            </Box>
            <Box sx={{ mt: 0.5, pl: 1, borderLeft: `2px solid ${agentColors.outline}`, minWidth: 0 }}>
                <Typography sx={{ fontSize: 12.5, fontWeight: 500, overflowWrap: 'anywhere' }}>{parts.head}</Typography>
                <SummaryDetails details={parts.details} />
            </Box>
        </Box>
    );
}

/** Approve and change buttons; both answer the plan's approval (change rejects it). */
const DECISION_TEXT =
    'Approving runs these steps in this order with exactly these parameters, for 30 minutes. Steps marked irreversible still ask you on their own.';

function Decision({
    explain,
    approving = false,
    onDecide,
}: {
    explain?: string;
    /** The approval is on its way (the plan is marked by the client, issue #166). */
    approving?: boolean;
    onDecide: (approve: boolean) => Promise<void>;
}) {
    const [pressed, setBusy] = useState<'approve' | 'reject'>();
    const busy = pressed !== undefined || approving;
    const decide = async (approve: boolean) => {
        setBusy(approve ? 'approve' : 'reject');
        try {
            await onDecide(approve);
        } finally {
            setBusy(undefined);
        }
    };
    return (
        <Box sx={{ mt: 1.25 }}>
            <Typography sx={{ fontSize: 12, color: 'text.secondary', mb: 0.75, overflowWrap: 'anywhere' }}>
                {explain ?? DECISION_TEXT}
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                <Button size="small" variant="contained" disabled={busy} onClick={() => void decide(true)}>
                    {pressed === 'approve' || approving ? 'Approving…' : 'Approve plan'}
                </Button>
                <Button
                    size="small"
                    variant="outlined"
                    color="secondary"
                    disabled={busy}
                    onClick={() => void decide(false)}
                >
                    Change
                </Button>
            </Box>
            <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.75 }}>{CHANGE_HINT}</Typography>
        </Box>
    );
}

/** The state chip of the card's header (design, MUI mapping). */
export function StateChip({ plan, layout, pending }: { plan: Plan; layout: 'panel' | 'page'; pending: ReadonlySet<string> }) {
    const color =
        plan.state === 'failed'
            ? 'error'
            : plan.state === 'completed'
            ? 'success'
            : plan.state === 'cancelled'
            ? 'default'
            : plan.state === 'proposed' && plan.approving
            ? 'primary'
            : plan.state === 'paused' || plan.state === 'proposed'
            ? 'warning'
            : needsInput(plan, pending)
            ? 'warning'
            : 'primary';
    return (
        <Chip
            size="small"
            variant="outlined"
            color={color}
            data-testid="agent-plan-state"
            data-plan-state={plan.state}
            icon={
                plan.state === 'completed' ? (
                    <CheckCircleIcon sx={{ fontSize: 14 }} />
                ) : (
                    <FiberManualRecordIcon sx={{ fontSize: 12 }} />
                )
            }
            label={planChip(plan, layout, pending)}
            sx={{ flex: 'none' }}
        />
    );
}

/** The controls of the card: icon buttons in the 400 px panel, text buttons on the page (design). */
function Controls({
    plan,
    layout,
    onControl,
}: {
    plan: Plan;
    layout: 'panel' | 'page';
    onControl: (action: 'pause' | 'resume' | 'cancel') => Promise<void>;
}) {
    const [cancelOpen, setCancelOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const run = async (action: 'pause' | 'resume' | 'cancel') => {
        setBusy(true);
        try {
            await onControl(action);
        } finally {
            setBusy(false);
        }
    };
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flex: 'none' }}>
            {pauseAllowed(plan) &&
                (layout === 'panel' ? (
                    <Tooltip title="Pause plan">
                        <IconButton
                            size="small"
                            aria-label="Pause plan"
                            disabled={busy}
                            onClick={() => void run('pause')}
                        >
                            <PauseIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                    </Tooltip>
                ) : (
                    <Button
                        size="small"
                        variant="text"
                        startIcon={<PauseIcon />}
                        disabled={busy}
                        onClick={() => void run('pause')}
                    >
                        Pause
                    </Button>
                ))}
            {resumeAllowed(plan) &&
                (layout === 'panel' ? (
                    <Tooltip title="Resume plan">
                        <IconButton
                            size="small"
                            aria-label="Resume plan"
                            disabled={busy}
                            onClick={() => void run('resume')}
                        >
                            <PlayArrowIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                    </Tooltip>
                ) : (
                    <Button
                        size="small"
                        variant="text"
                        startIcon={<PlayArrowIcon />}
                        disabled={busy}
                        onClick={() => void run('resume')}
                    >
                        Resume
                    </Button>
                ))}
            {cancelAllowed(plan) &&
                (layout === 'panel' ? (
                    <Tooltip title="Cancel plan">
                        <IconButton
                            size="small"
                            aria-label="Cancel plan"
                            disabled={busy}
                            onClick={() => setCancelOpen(true)}
                        >
                            <CancelOutlinedIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                    </Tooltip>
                ) : (
                    <Button
                        size="small"
                        variant="text"
                        color="error"
                        disabled={busy}
                        onClick={() => setCancelOpen(true)}
                    >
                        Cancel plan
                    </Button>
                ))}
            <CancelDialog
                plan={plan}
                open={cancelOpen}
                busy={busy}
                onClose={() => setCancelOpen(false)}
                onConfirm={async () => {
                    await run('cancel');
                    setCancelOpen(false);
                }}
            />
        </Box>
    );
}

/** The confirmation before a plan is cancelled (design, D1.10: the platform jobs keep running). */
function CancelDialog({
    plan,
    open,
    busy,
    onClose,
    onConfirm,
}: {
    plan: Plan;
    open: boolean;
    busy: boolean;
    onClose: () => void;
    onConfirm: () => Promise<void>;
}) {
    const keep = useRef<HTMLButtonElement>(null);
    return (
        <Dialog
            open={open}
            onClose={onClose}
            aria-labelledby="agent-cancel-plan-title"
            aria-describedby="agent-cancel-plan-text"
            TransitionProps={{ onEntered: () => keep.current?.focus() }}
        >
            <DialogTitle id="agent-cancel-plan-title">Cancel plan?</DialogTitle>
            <DialogContent>
                <DialogContentText id="agent-cancel-plan-text" data-testid="agent-plan-cancel-text">
                    {cancelConfirmText(plan)}
                </DialogContentText>
            </DialogContent>
            <DialogActions>
                <Button ref={keep} onClick={onClose}>
                    Keep running
                </Button>
                <Button color="error" disabled={busy} onClick={() => void onConfirm()}>
                    Cancel plan
                </Button>
            </DialogActions>
        </Dialog>
    );
}

/** The banner of the plan's state (design, MUI mapping): one Alert per state and pause reason. */
export function PlanBanner({ plan }: { plan: Plan }) {
    if (plan.state === 'proposed') return null;
    if (plan.state === 'paused') {
        const reason = plan.pause_reason ?? '';
        const interrupted = plan.steps.some((s) => s.state === 'failed' && reason === 'restart');
        return (
            <Alert severity="warning" sx={{ mt: 1, fontSize: 12.5 }} data-testid="agent-plan-banner">
                <AlertTitle sx={{ fontSize: 13 }}>{pauseTitle(reason)}</AlertTitle>
                {pauseText(plan)}
                {interrupted && (
                    <Box component="span" sx={{ display: 'block', mt: 0.5 }}>
                        {RESTART_INTERRUPTED}
                    </Box>
                )}
            </Alert>
        );
    }
    if (plan.state === 'completed') {
        return (
            <Alert severity="success" sx={{ mt: 1, fontSize: 12.5 }} data-testid="agent-plan-banner">
                {completedText(plan)}
            </Alert>
        );
    }
    if (plan.state === 'failed') {
        const failed = plan.steps.find((s) => s.state === 'failed');
        return (
            <Alert severity="error" sx={{ mt: 1, fontSize: 12.5 }} data-testid="agent-plan-banner">
                <AlertTitle sx={{ fontSize: 13 }}>{failedTitle(plan)}</AlertTitle>
                {failed?.result && <Box sx={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{failed.result}</Box>}
                <Box sx={{ mt: failed?.result ? 0.5 : 0 }}>{failedText(plan)}</Box>
                <Box sx={{ mt: 0.5, color: 'text.secondary' }}>{FAILED_HINT}</Box>
            </Alert>
        );
    }
    if (plan.state === 'cancelled') {
        return (
            <Alert severity="info" sx={{ mt: 1, fontSize: 12.5 }} data-testid="agent-plan-banner">
                {cancelledText(plan)}
            </Alert>
        );
    }
    // waiting for the platform: the agent is idle, nobody spends turns or model cost (design)
    if (awaitingPlatform(plan)) {
        const search = plan.steps.some((s) => s.state === 'waiting' && s.tool === 'propose_search');
        const waiting = plan.steps.find((s) => s.state === 'waiting');
        const kind = waiting ? bannerJobKind(waiting) : undefined;
        return (
            <Alert severity="info" sx={{ mt: 1, fontSize: 12.5 }} data-testid="agent-plan-banner">
                {search ? SEARCH_WAITING_INFO : waitingInfo(kind)}
            </Alert>
        );
    }
    return null;
}

/** The tail of a step's job log, collapsed (design, L9: the switch and "Stop job" share a row). */
function LogTail({
    step,
    open,
    onToggle,
    job,
    onStop,
    busy,
}: {
    step: PlanStep;
    open: boolean;
    onToggle: () => void;
    job?: WatchJob;
    onStop?: () => void;
    busy?: boolean;
}) {
    const tail = logTail(job?.log_tail ?? step.log_tail);
    const stoppable = !!job && job.state === 'running' && !!onStop;
    if (!tail && !stoppable) return null;
    return (
        <Box sx={{ mt: 0.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, minWidth: 0 }}>
                {tail ? (
                    <Box
                        component="button"
                        type="button"
                        onClick={onToggle}
                        aria-expanded={open}
                        data-testid="agent-plan-log-toggle"
                        sx={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 0.25,
                            border: 0,
                            background: 'none',
                            p: 0,
                            font: 'inherit',
                            fontSize: 12,
                            color: agentColors.muted,
                            cursor: 'pointer',
                        }}
                    >
                        {open ? <ExpandMoreIcon sx={{ fontSize: 16 }} /> : <ChevronRightIcon sx={{ fontSize: 16 }} />}
                        {LOG_SWITCH}
                    </Box>
                ) : (
                    <span />
                )}
                {stoppable && (
                    <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        startIcon={<StopIcon />}
                        disabled={busy}
                        onClick={onStop}
                        data-testid="agent-plan-stop-job"
                        sx={{ flex: 'none' }}
                    >
                        Stop job
                    </Button>
                )}
            </Box>
            {tail && (
                <Collapse in={open} unmountOnExit>
                    <Box component="pre" data-testid="agent-plan-log" sx={{ ...PRE_SX, maxHeight: 150 }}>
                        {tail}
                    </Box>
                </Collapse>
            )}
        </Box>
    );
}

/** The progress of a running step: the bar, the message, the runtime and the time left (design, D2.4/D4.6). */
function StepProgress({ plan, step, now, working }: { plan: Plan; step: PlanStep; now: number; working?: boolean }) {
    const phase = stepPhase(plan, step, working);
    const paused = phase === 'paused';
    const percent = typeof step.progress === 'number' ? step.progress : undefined;
    const message = stepMessage(step);
    const timeLine = stepTimeLine(step, now);
    const runtime = stepRuntime(step, now);
    const detail =
        step.state === 'waiting' && !step.started_at
            ? message
            : [message, timeLine].filter((s) => s !== '').join(' · ');
    if (percent === undefined && !detail && !paused) return null;
    return (
        <Box sx={{ mt: 0.5 }} data-testid="agent-plan-progress">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <LinearProgress
                    variant={percent === undefined ? 'indeterminate' : 'determinate'}
                    value={percent}
                    color={paused ? 'warning' : 'primary'}
                    sx={{ flex: 1, height: 4, borderRadius: 2 }}
                />
                {percent !== undefined && (
                    <Typography sx={{ fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                        {`${Math.round(percent)} %`}
                    </Typography>
                )}
            </Box>
            {detail && (
                <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.25, overflowWrap: 'anywhere' }}>
                    {detail}
                </Typography>
            )}
            {paused && (
                <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.25 }}>
                    {runtime
                        ? `${runtime} · step ${step.idx + 1} starts after you resume`
                        : `Step ${step.idx + 1} starts after you resume`}
                </Typography>
            )}
        </Box>
    );
}

/** One step of the card: number, effect, state, the gateway's summary and, where there is one, its progress. */
/** One line per placeholder that resolved: which object an earlier step created (gateway issue #177). */
function StepRefs({ plan, step }: { plan: Plan; step: PlanStep }): ReactElement | null {
    const refs = stepRefs(plan, step);
    if (refs.length === 0) return null;
    return (
        <Box component="ul" data-testid="agent-plan-step-refs" sx={{ listStyle: 'none', m: 0, mt: 0.25, p: 0 }}>
            {refs.map((r) => {
                const href = stepRefLink(r);
                const text = stepRefText(r);
                const idAt = text.indexOf(` ${r.id}`) + 1;
                return (
                    <Typography key={r.step} component="li" sx={{ fontSize: 12, color: 'text.secondary' }}>
                        {href ? (
                            <>
                                {`◦ ${text.slice(0, idAt)}`}
                                <Link href={href} underline="always" sx={{ fontSize: 12 }}>
                                    {r.id}
                                </Link>
                                {text.slice(idAt + r.id.length)}
                            </>
                        ) : (
                            `◦ ${text}`
                        )}
                    </Typography>
                );
            })}
        </Box>
    );
}

function StepItem({
    plan,
    step,
    layout,
    now,
    jobs,
    onControl,
    approvals,
    onDecide,
    working,
}: {
    plan: Plan;
    step: PlanStep;
    layout: 'panel' | 'page';
    now: number;
    jobs: WatchJob[];
    onControl: (action: 'stop', step: number) => Promise<void>;
    approvals: Approval[];
    onDecide?: (a: Approval, approve: boolean) => Promise<void>;
    working?: boolean;
}) {
    const phase = stepPhase(plan, step, working);
    const main = stepMain(step);
    const note = agentNote(step);
    const job = jobOfStep(jobs, step);
    const waiting = step.state === 'waiting';
    const [logOpen, setLogOpen] = useState(phase === 'running' && !waiting);
    const [busy, setBusy] = useState(false);
    const strong = phase !== 'queued' && phase !== 'notrun';
    const decide = onDecide;
    const parkedApproval = step.parked_approval ? approvals.find((a) => a.id === step.parked_approval) : undefined;
    const embedded = phase === 'approval' && parkedApproval?.state === 'pending' && decide ? parkedApproval : undefined;
    const extra = computeStepLine(plan, step);
    const loadStepFiles = useCallback(
        (chatId: string) => agentApi.planStepUploads(chatId, plan.id, step.idx).then((r) => r.entries),
        [plan.id, step.idx],
    );
    return (
        <Box component="li" data-testid="agent-plan-step" data-status={phase} sx={{ minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: 12, color: 'text.secondary', minWidth: 14, lineHeight: '22px' }}>
                    {step.idx}
                </Typography>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', minWidth: 0 }}>
                        <EffectChip effect={step.effect} />
                        <Box
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 0.5,
                                flex: 'none',
                                fontSize: 12,
                                ml: 'auto',
                            }}
                            title={step.result}
                        >
                            {PHASE_ICON[phase]}
                            <Typography component="span" sx={{ fontSize: 12 }}>
                                {PHASE_LABEL[phase]}
                            </Typography>
                        </Box>
                    </Box>
                    <Typography
                        data-testid="agent-plan-step-summary"
                        data-from-gateway={main.fromGateway ? 'true' : 'false'}
                        sx={{
                            fontSize: 13,
                            fontWeight: strong ? 500 : 400,
                            color: strong ? 'text.primary' : 'text.secondary',
                            mt: 0.5,
                            overflowWrap: 'anywhere',
                            ...(main.fromGateway ? {} : { fontFamily: MONO, fontSize: 12 }),
                        }}
                    >
                        {main.head}
                    </Typography>
                    <SummaryDetails details={main.details} />
                    <StepRefs plan={plan} step={step} />
                    {/* Up to LISTED_FILES the summary lists the files itself; above it the step shows the folders and
                        the collapsed list of every file (gateway issue #172). */}
                    {step.uploads && step.uploads.files > LISTED_FILES && (
                        <UploadFiles
                            data={step.uploads}
                            chatId={plan.chat_id}
                            approvalId={`${plan.id}:${step.idx}`}
                            layout={layout}
                            load={loadStepFiles}
                        />
                    )}
                    {((phase === 'open' && extra) ||
                        (step.state === 'open' && (!step.covered || step.image_origin))) && (
                        <Box component="ul" sx={{ listStyle: 'none', m: 0, mt: 0.25, p: 0 }}>
                            {phase === 'open' && extra && (
                                <Typography component="li" sx={{ fontSize: 12, color: 'text.secondary' }}>
                                    {`◦ ${extra}`}
                                </Typography>
                            )}
                            {step.state === 'open' && !step.covered && (
                                <Typography
                                    component="li"
                                    sx={{ fontSize: 12, color: 'text.secondary' }}
                                    data-testid="agent-plan-step-asks-again"
                                >
                                    {`◦ ${uncoveredText(step)}`}
                                </Typography>
                            )}
                            {step.state === 'open' && step.image_origin && (
                                <Typography
                                    component="li"
                                    sx={{ fontSize: 12, color: 'text.secondary' }}
                                    data-testid="agent-plan-step-image-origin"
                                >
                                    {`◦ ${imageOriginText(step)}`}
                                </Typography>
                            )}
                        </Box>
                    )}
                    {step.summary_proposed && (
                        <ProposedSummary summary={step.summary_proposed} testId="agent-plan-step-proposed" />
                    )}
                    {note && NOTE_PHASES.includes(phase) && (
                        <AgentText label={AGENT_NOTE_LABEL} text={note} testId="agent-plan-step-note" />
                    )}
                    {/* a step the plan does not cover asks on its own (D2.8): the decision is in the card */}
                    {embedded && decide && (
                        <StepApproval
                            plan={plan}
                            step={step}
                            approval={embedded}
                            onDecide={async (approve) => {
                                setBusy(true);
                                try {
                                    await decide(embedded, approve);
                                } finally {
                                    setBusy(false);
                                }
                            }}
                            busy={busy}
                        />
                    )}
                    {(phase === 'running' || phase === 'paused' || waiting) && (
                        <StepProgress plan={plan} step={step} now={now} working={working} />
                    )}
                    {(phase === 'running' || phase === 'paused' || waiting) && (
                        <LogTail
                            step={step}
                            job={job}
                            open={logOpen}
                            onToggle={() => setLogOpen((o) => !o)}
                            busy={busy}
                            onStop={
                                job && job.state === 'running'
                                    ? () => {
                                          setBusy(true);
                                          onControl('stop', step.idx).finally(() => setBusy(false));
                                      }
                                    : undefined
                            }
                        />
                    )}
                    <Technical text={stepTechnical(step)} testId="agent-plan-step-technical" />
                </Box>
            </Box>
        </Box>
    );
}

/** The states in which the card shows the shared step list; the others keep the full view of every step (issue #221). */
const RUNNING_LIST_STATES: Plan['state'][] = ['approved', 'paused', 'completed', 'failed', 'cancelled'];

/**
 * What the card adds to an opened step of the shared list (issue #221): the approval of a step the plan does not
 * cover (D2.8) and the stop button of its job. The decisions stay here, in the card.
 */
function StepExtra({
    plan,
    step,
    jobs,
    approvals,
    onDecide,
    onControl,
    working,
}: {
    plan: Plan;
    step: PlanStep;
    jobs: WatchJob[];
    approvals: Approval[];
    onDecide?: (a: Approval, approve: boolean) => Promise<void>;
    onControl: (action: 'stop', step: number) => Promise<void>;
    working?: boolean;
}) {
    const [busy, setBusy] = useState(false);
    const phase = stepPhase(plan, step, working);
    const job = jobOfStep(jobs, step);
    const parked = step.parked_approval ? approvals.find((a) => a.id === step.parked_approval) : undefined;
    const embedded = phase === 'approval' && parked?.state === 'pending' && onDecide ? parked : undefined;
    const stoppable = !!job && job.state === 'running' && (phase === 'running' || phase === 'paused');
    if (!embedded && !stoppable) return null;
    return (
        <Box sx={{ minWidth: 0 }}>
            {embedded && onDecide && (
                <StepApproval
                    plan={plan}
                    step={step}
                    approval={embedded}
                    onDecide={async (approve) => {
                        setBusy(true);
                        try {
                            await onDecide(embedded, approve);
                        } finally {
                            setBusy(false);
                        }
                    }}
                    busy={busy}
                />
            )}
            {stoppable && (
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.5 }}>
                    <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        startIcon={<StopIcon />}
                        disabled={busy}
                        onClick={() => {
                            setBusy(true);
                            onControl('stop', step.idx).finally(() => setBusy(false));
                        }}
                        data-testid="agent-plan-stop-job"
                    >
                        Stop job
                    </Button>
                </Box>
            )}
        </Box>
    );
}

/** The approval of a step the plan does not cover, decided inside the card (design, D2.8). */
export function StepApproval({
    plan,
    step,
    approval,
    onDecide,
    busy,
}: {
    plan: Plan;
    step: PlanStep;
    approval: Approval;
    onDecide: (approve: boolean) => Promise<void>;
    busy?: boolean;
}) {
    const parts = summaryParts(approval.summary);
    return (
        <Box
            data-testid="agent-plan-step-approval"
            data-approval-id={approval.id}
            sx={{
                mt: 0.75,
                p: 1,
                border: 1,
                borderColor: agentColors.amberLine,
                borderRadius: 1,
                bgcolor: '#fff',
                minWidth: 0,
            }}
        >
            <Typography sx={{ fontSize: 12.5, fontWeight: 500 }}>
                {waitingForApproval(approval.created_at, Date.now())}
            </Typography>
            {parts && <SummaryDetails details={parts.details} />}
            {approval.preview && <Technical text={approval.preview} open={!parts} />}
            <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
                <Button
                    size="small"
                    variant="contained"
                    disabled={busy}
                    onClick={() => void onDecide(true)}
                    data-testid="agent-plan-step-approve"
                >
                    Approve step
                </Button>
                <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    disabled={busy}
                    onClick={() => void onDecide(false)}
                    data-testid="agent-plan-step-reject"
                >
                    Reject
                </Button>
            </Box>
            <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.75, overflowWrap: 'anywhere' }}>
                {rejectText(plan, step)}
            </Typography>
        </Box>
    );
}

/** The budget block of a proposed plan (design, D4.5, L12). */
function BudgetBlock({ plan, now }: { plan: Plan; now: number }) {
    const rows = budgetRowsOf(plan, now);
    if (rows.length === 0) return null;
    return (
        <Paper variant="outlined" sx={{ mt: 1.25, p: 1.25, borderRadius: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: 11, letterSpacing: 1.2, color: 'text.disabled', textTransform: 'uppercase' }}>
                {BUDGET_OVERLINE}
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 2, rowGap: 0.25, mt: 0.5 }}>
                {rows.map((r) => (
                    <Box key={r.label} sx={{ display: 'contents' }}>
                        <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>{r.label}</Typography>
                        <Typography sx={{ fontSize: 12.5 }}>{r.value}</Typography>
                    </Box>
                ))}
            </Box>
        </Paper>
    );
}

/** One right of the plan's grant, with its effect chip (design, L13). */
function RightRow({ text, effect }: { text: string; effect: 'read' | 'write' | 'compute' | 'irreversible' }) {
    return (
        <ListItem sx={{ px: 0, py: 0.25, gap: 1, alignItems: 'flex-start' }}>
            <CheckIcon sx={{ fontSize: 16, color: agentColors.ok, mt: '3px', flex: 'none' }} aria-hidden />
            <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: 12.5, overflowWrap: 'anywhere' }}>{rightText(text)}</Typography>
            </Box>
            <EffectChip effect={effect} />
        </ListItem>
    );
}

/** The rights block of a proposed plan: what the plan may do while it runs (design, D4.4/E1, L13). */
function RightsBlock({ plan }: { plan: Plan }) {
    const grant = grantRows(plan);
    const irreversible = plan.steps.filter((s) => s.effect === 'irreversible');
    if (grant.length === 0) return null;
    return (
        <Paper variant="outlined" sx={{ mt: 1.25, p: 1.25, borderRadius: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: 11, letterSpacing: 1.2, color: 'text.disabled', textTransform: 'uppercase' }}>
                {RIGHTS_OVERLINE}
            </Typography>
            <List dense disablePadding sx={{ mt: 0.5 }}>
                {grant.map((g, i) => (
                    <RightRow key={i} text={g.text} effect={g.effect} />
                ))}
                {irreversible.map((s) => (
                    <ListItem key={`irr-${s.idx}`} sx={{ px: 0, py: 0.25, gap: 1, alignItems: 'flex-start' }}>
                        <BackHandIcon
                            sx={{ fontSize: 16, color: 'text.disabled', mt: '3px', flex: 'none' }}
                            aria-hidden
                        />
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography sx={{ fontSize: 12.5, color: 'text.secondary', overflowWrap: 'anywhere' }}>
                                {`Step ${s.idx} – ${IRREVERSIBLE_HINT}`}
                            </Typography>
                        </Box>
                    </ListItem>
                ))}
            </List>
            <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.5 }}>{RIGHTS_END_TEXT}</Typography>
        </Paper>
    );
}

/** The checkbox that lets this plan notify in the browser (design, D4.4, L26). */
function NotifyCheckbox({
    optedIn,
    onOptIn,
}: {
    /** The choice that counts for this plan (stored choice, else the browser permission); undefined without one. */
    optedIn?: boolean;
    onOptIn: (on: boolean) => void;
}) {
    const [permission, setPermission] = useState<NotifyPermission>(() => permissionOf(browserNotify()));
    // the browser may only be asked on a gesture, and only while it has not decided yet (D4.4)
    const ask = async () => setPermission(await requestPermission());
    // a permission the browser granted earlier counts as "on": the checkbox must not promise what it never does
    const state = notifyCheckbox(permission, optedIn ?? defaultOptIn(permission));
    return (
        <Box sx={{ mt: 1.25 }}>
            <FormControlLabel
                control={
                    <Checkbox
                        size="small"
                        checked={state.checked}
                        disabled={state.disabled}
                        onChange={(_, checked) => {
                            onOptIn(checked);
                            if (checked) void ask();
                        }}
                        inputProps={{ 'data-testid': 'agent-plan-notify' } as Record<string, string>}
                    />
                }
                label={<Typography sx={{ fontSize: 12.5 }}>{NOTIFY_LABEL}</Typography>}
            />
            {state.blocked ? (
                <Alert severity="info" sx={{ mt: 0.5, fontSize: 12 }} data-testid="agent-plan-notify-state">
                    {state.help}
                </Alert>
            ) : (
                <FormHelperText sx={{ mt: 0 }} data-testid="agent-plan-notify-state">
                    {state.help}
                </FormHelperText>
            )}
        </Box>
    );
}

/** The objects the plan produced, as links to their platform pages (design, L4). */
function CreatedLinks({ plan }: { plan: Plan }) {
    const outputs = planOutputs(plan);
    if (outputs.length === 0) return null;
    return (
        <Box sx={{ mt: 1.25 }} data-testid="agent-plan-created">
            <Typography sx={{ fontSize: 11, letterSpacing: 1.2, color: 'text.disabled', textTransform: 'uppercase' }}>
                {CREATED_OVERLINE}
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '20px 56px 1fr', columnGap: 1, rowGap: 0.25, mt: 0.5 }}>
                {outputs.map((o) => {
                    const kind = outputKind(o);
                    const href = outputLink(o);
                    const label = o.label || o.id;
                    return (
                        <Box key={`${kind}:${o.id}`} sx={{ display: 'contents' }}>
                            <OutputIcon kind={kind} />
                            <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>
                                {kind === 'dataset'
                                    ? 'Dataset'
                                    : kind === 'model'
                                    ? 'Model'
                                    : kind === 'deployment'
                                    ? 'Deployment'
                                    : 'Image'}
                            </Typography>
                            {href ? (
                                <Link
                                    href={href}
                                    underline="always"
                                    title={label}
                                    sx={{
                                        fontSize: kind === 'image' ? 12 : 12.5,
                                        fontFamily: kind === 'image' ? MONO : 'inherit',
                                        overflowWrap: 'anywhere',
                                    }}
                                >
                                    {label}
                                </Link>
                            ) : (
                                <Typography sx={{ fontSize: 12.5, overflowWrap: 'anywhere' }}>{label}</Typography>
                            )}
                        </Box>
                    );
                })}
            </Box>
        </Box>
    );
}

function OutputIcon({ kind }: { kind: ReturnType<typeof outputKind> }): ReactElement {
    const sx = { fontSize: 18, color: 'text.secondary' } as const;
    if (kind === 'dataset') return <DescriptionOutlinedIcon sx={sx} aria-hidden />;
    if (kind === 'model') return <ViewInArOutlinedIcon sx={sx} aria-hidden />;
    return <Inventory2OutlinedIcon sx={sx} aria-hidden />;
}

/**
 * A plan of several platform calls: the gateway's steps, the agent's title and notes, and — for an autonomous
 * plan — its budget, progress and controls.
 */
export default function PlanCard({
    plan,
    approval,
    approvals,
    onDecide,
    dense,
    register = true,
    layout,
    jobs = [],
    pending,
    onControl,
    onNotify,
    notifyOptIn,
    working,
}: {
    plan: Plan;
    approval?: Approval;
    /** All approvals of the chat: the card finds the one a step waits for (D2.8). */
    approvals?: Approval[];
    onDecide?: (a: Approval, approve: boolean) => Promise<void>;
    dense?: boolean;
    /** Counts as the view's card of this plan (false only where the approval list shows the card itself). */
    register?: boolean;
    /** Where the card sits: the 400 px panel uses icon buttons for the controls, the page text buttons. */
    layout?: 'panel' | 'page';
    /** Observed platform jobs of the chat (A-E2); they carry the log tail, the ETA and the stop route. */
    jobs?: WatchJob[];
    /** Approvals that are still pending, by id: a step with such a parked approval waits for the user. */
    pending?: ReadonlySet<string>;
    /** Runs a control of the plan (pause, resume, cancel, stop a step's job); without one the card calls the API. */
    onControl?: (action: 'pause' | 'resume' | 'cancel' | 'stop', step?: number) => Promise<void>;
    /** The user allowed browser notifications for a plan (E4, D4.4). */
    onNotify?: (on: boolean) => void;
    /** The choice that counts for a plan (the stored one, else the browser permission), from the agent context. */
    notifyOptIn?: (planId: string) => boolean;
    /** The chat's agent is working: the next step of an approved plan shows 'Starting…' (#176). */
    working?: boolean;
}) {
    useRegisterPlanCard(plan.id, register);
    const now = Date.now();
    const canDecide = plan.state === 'proposed' && approval?.state === 'pending' && !!onDecide;
    const title = agentTitle(plan);
    const auto = isAutonomous(plan);
    const frame = layout ?? (dense ? 'panel' : 'page');
    const pendingIds = useMemo(() => pending ?? new Set<string>(), [pending]);
    const allApprovals = approvals ?? (approval ? [approval] : []);
    const runControl = async (action: 'pause' | 'resume' | 'cancel' | 'stop', step?: number) => {
        if (onControl) return onControl(action, step);
        switch (action) {
            case 'pause':
                await agentApi.pausePlan(plan.chat_id, plan.id);
                break;
            case 'resume':
                await agentApi.resumePlan(plan.chat_id, plan.id);
                break;
            case 'cancel':
                await agentApi.cancelPlan(plan.chat_id, plan.id);
                break;
            case 'stop':
                if (step) await agentApi.stopPlanStep(plan.chat_id, plan.id, step);
                break;
        }
    };
    // while the plan may still change, its progress moves: redraws every 5 s keep the runtime and the ETA honest
    const [, tick] = useState(0);
    const live = plan.state === 'approved';
    useEffect(() => {
        if (!live) return undefined;
        const t = setInterval(() => tick((n) => n + 1), 5000);
        return () => clearInterval(t);
    }, [live]);

    return (
        <Card
            variant="outlined"
            data-testid="agent-plan-card"
            data-plan-id={plan.id}
            data-plan-state={plan.state}
            role="group"
            tabIndex={-1}
            aria-label={ariaLabel(plan, pendingIds)}
            sx={{
                borderRadius: 1,
                borderLeft: 3,
                borderLeftColor: edgeColor(plan),
                boxShadow: 'none',
                minWidth: 0,
                outline: 'none',
            }}
        >
            <CardContent sx={{ p: dense ? 1.25 : 1.5, '&:last-child': { pb: dense ? 1.25 : 1.5 } }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75, minWidth: 0 }}>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', minWidth: 0 }}>
                            <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
                                Plan · {stepCount(plan.steps.length)}
                            </Typography>
                            <StateChip plan={plan} layout={frame} pending={pendingIds} />
                            <Box sx={{ ml: 'auto' }}>
                                <Controls plan={plan} layout={frame} onControl={runControl} />
                            </Box>
                        </Box>
                        <Box aria-live="polite">
                            {auto && budgetLine(plan, now) && (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
                                    <TimelapseIcon sx={{ fontSize: 14, color: 'text.secondary' }} aria-hidden />
                                    <Typography
                                        variant="caption"
                                        color="text.secondary"
                                        data-testid="agent-plan-budget"
                                    >
                                        {budgetLine(plan, now)}
                                    </Typography>
                                </Box>
                            )}
                        </Box>
                        {/* an interactive plan keeps the line it always had (its expiry matters); an
                            autonomous one is described by its chip, its budget line and its banner (D4.2) */}
                        {!auto && (
                            <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.25 }}>
                                {planLabel(plan, now)}
                            </Typography>
                        )}
                        {title && <AgentText label={AGENT_TITLE_LABEL} text={title} testId="agent-plan-title" />}
                    </Box>
                </Box>

                <PlanBanner plan={plan} />

                {plan.state === 'proposed' && auto && <BudgetBlock plan={plan} now={now} />}
                {plan.state === 'proposed' && auto && <RightsBlock plan={plan} />}
                {plan.state === 'proposed' && auto && onNotify && (
                    <NotifyCheckbox optedIn={notifyOptIn?.(plan.id)} onOptIn={onNotify} />
                )}

                {RUNNING_LIST_STATES.includes(plan.state) ? (
                    <Box sx={{ mt: 1.25 }}>
                        <PlanStepList
                            plan={plan}
                            jobs={jobs}
                            pending={pendingIds}
                            variant={frame === 'panel' ? 'compact' : 'detail'}
                            chatId={plan.chat_id}
                            working={working}
                            renderStepExtra={(step) => (
                                <StepExtra
                                    key={step.idx}
                                    plan={plan}
                                    step={step}
                                    jobs={jobs}
                                    approvals={allApprovals}
                                    onDecide={onDecide}
                                    onControl={runControl}
                                    working={working}
                                />
                            )}
                        />
                    </Box>
                ) : (
                    <Box
                        component="ol"
                        sx={{
                            listStyle: 'none',
                            m: 0,
                            p: 0,
                            mt: 1.25,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 1.25,
                        }}
                    >
                        {plan.steps.map((step) => (
                            <StepItem
                                key={step.idx}
                                plan={plan}
                                step={step}
                                layout={frame}
                                now={now}
                                jobs={jobs}
                                approvals={allApprovals}
                                onDecide={onDecide}
                                onControl={runControl}
                                working={working}
                            />
                        ))}
                    </Box>
                )}

                <CreatedLinks plan={plan} />
                {plan.state === 'cancelled' && createdStay(plan) !== '' && (
                    <Typography
                        sx={{ fontSize: 12, color: 'text.secondary', mt: 0.75 }}
                        data-testid="agent-plan-cancelled-stay"
                    >
                        {createdStay(plan)}
                    </Typography>
                )}

                {canDecide && approval && summaryChanged(approval) && (
                    <>
                        <ChangedAlert />
                        {approval.summary_proposed && (
                            <ProposedSummary summary={approval.summary_proposed} testId="agent-approval-proposed" />
                        )}
                    </>
                )}
                {plan.state === 'proposed' && uncoveredSummary(plan) !== '' && (
                    <Box
                        sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 1.25 }}
                        data-testid="agent-plan-uncovered-summary"
                    >
                        <HourglassEmptyIcon sx={{ fontSize: 17, color: agentColors.amber }} aria-hidden />
                        <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{uncoveredSummary(plan)}</Typography>
                    </Box>
                )}
                {canDecide && approval && onDecide && (
                    <Decision
                        approving={plan.approving}
                        explain={auto ? approvalExplain(plan) : undefined}
                        onDecide={(approve) => onDecide(approval, approve)}
                    />
                )}
            </CardContent>
        </Card>
    );
}

/** The spoken label of the card: the number of steps and the state (design, accessibility). */
function ariaLabel(plan: Plan, pending: ReadonlySet<string>): string {
    const chip = planChip(plan, 'page', pending);
    return `Plan, ${plan.steps.length} ${plan.steps.length === 1 ? 'step' : 'steps'}: ${chip}`;
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
