// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { useMemo, useState } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import CircularProgress from '@mui/material/CircularProgress';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';

import {
    backgroundStatus,
    backgroundSummary,
    commandPreview,
    formatBackgroundRuntime,
    runningCount,
    sortBackground,
    tailLines,
} from '../background';
import { formatElapsed } from '../runState';
import {
    groupRuns,
    RUN_STATUS_LABEL,
    runUsage,
    runDuration,
    runItems,
    runsSummary,
    runStatus,
    runSubtitle,
    runTitle,
    shortRunId,
} from '../subagents';
import type { RunStatus, SubagentRun } from '../subagents';
import type { BackgroundTask, LLMCall, SubagentEntry, SubagentRunMeta } from '../types';
import { useNow } from '../useNow';
import { formatTokens, formatTokensShort } from '../usage';
import EllipsisText from './EllipsisText';
import Markdown from './Markdown';
import StepList from './StepList';
import { agentColors, blockSx, MONO } from './tokens';

const TONE_COLOR = {
    running: agentColors.green,
    ok: agentColors.ok,
    error: agentColors.red,
    muted: 'text.secondary',
} as const;

const RUN_COLOR: Record<RunStatus, string> = {
    running: agentColors.green,
    idle: agentColors.amberText,
    done: agentColors.ok,
    failed: agentColors.red,
    stopped: 'text.secondary',
};

const sectionTitleSx = {
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: 'text.disabled',
    mb: 0.25,
} as const;

function BackgroundRow({
    task,
    now,
    onStop,
}: {
    task: BackgroundTask;
    now: number;
    onStop: (id: string) => Promise<void>;
}) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>();
    const st = backgroundStatus(task);
    const running = task.state === 'running';
    const lines = tailLines(task.tail, 3);
    const stop = async () => {
        setBusy(true);
        setError(undefined);
        try {
            await onStop(task.id);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };
    return (
        <Box
            component="li"
            data-testid="agent-bg-task"
            data-state={task.state}
            sx={{ py: 0.75, borderTop: 1, borderColor: 'divider', '&:first-of-type': { borderTop: 0 }, minWidth: 0 }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                {running && <CircularProgress size={11} thickness={5} sx={{ flex: 'none' }} />}
                <Typography component="span" sx={{ fontFamily: MONO, fontSize: 12, fontWeight: 500, flex: 'none' }}>
                    {task.id}
                </Typography>
                <Typography component="span" noWrap sx={{ fontSize: 12, color: TONE_COLOR[st.tone], minWidth: 0 }}>
                    {st.label}
                    {task.session && task.session !== 'main' ? ` · subagent ${shortRunId(task.session)}` : ''}
                </Typography>
                <Typography
                    component="span"
                    sx={{
                        ml: 'auto',
                        flex: 'none',
                        fontSize: 11.5,
                        color: 'text.secondary',
                        fontVariantNumeric: 'tabular-nums',
                    }}
                >
                    {formatBackgroundRuntime(task, now)}
                </Typography>
                {running && (
                    <Button
                        size="small"
                        color="error"
                        variant="outlined"
                        disabled={busy}
                        onClick={() => void stop()}
                        aria-label={`Stop ${task.id}`}
                        data-testid="agent-bg-stop"
                        sx={{
                            flex: 'none',
                            minWidth: 0,
                            py: 0,
                            px: 1,
                            fontSize: 11.5,
                            textTransform: 'none',
                            lineHeight: 1.6,
                        }}
                    >
                        {busy ? <CircularProgress size={12} color="inherit" /> : 'Stop'}
                    </Button>
                )}
            </Box>
            <Typography
                noWrap
                title={task.command}
                sx={{ fontFamily: MONO, fontSize: 11.5, color: 'text.secondary', mt: 0.25 }}
            >
                $ {commandPreview(task.command)}
            </Typography>
            {lines.length > 0 && (
                <Box
                    component="pre"
                    data-testid="agent-bg-tail"
                    title={running ? 'Last lines (live)' : 'Last lines'}
                    sx={{
                        m: 0,
                        mt: 0.5,
                        px: 0.75,
                        py: 0.5,
                        bgcolor: agentColors.panelBg,
                        border: 1,
                        borderColor: 'divider',
                        borderRadius: 0.5,
                        fontFamily: MONO,
                        fontSize: 11,
                        lineHeight: 1.45,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all',
                        maxHeight: 72,
                        overflow: 'hidden',
                    }}
                >
                    {lines.join('\n')}
                </Box>
            )}
            {error && (
                <Typography role="alert" sx={{ fontSize: 11.5, color: agentColors.red, mt: 0.25 }}>
                    {error}
                </Typography>
            )}
        </Box>
    );
}

function RunSteps({ run, live, chatId }: { run: SubagentRun; live: boolean; chatId: string }) {
    const items = useMemo(() => runItems(run, live), [run, live]);
    if (items.length === 0)
        return <Typography sx={{ fontSize: 12, color: 'text.secondary', py: 0.5 }}>No steps recorded yet.</Typography>;
    return (
        <Box data-testid="agent-subagent-steps" sx={{ display: 'grid', gap: 0.5, pt: 0.5, minWidth: 0 }}>
            {items.map((it) =>
                it.type === 'task' ? (
                    <Typography
                        key={it.key}
                        title={it.text}
                        sx={{
                            fontSize: 12,
                            color: 'text.secondary',
                            display: '-webkit-box',
                            WebkitLineClamp: 3,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            overflowWrap: 'anywhere',
                        }}
                    >
                        <b>Task:</b> {it.text.replace(/^task:\s*/i, '')}
                    </Typography>
                ) : it.type === 'text' ? (
                    <Box key={it.key} sx={{ fontSize: 12.5, maxHeight: 180, overflowY: 'auto', minWidth: 0 }}>
                        <Markdown text={it.text} dense images={{ chatId }} />
                    </Box>
                ) : (
                    <StepList key={it.key} steps={it.steps} />
                ),
            )}
        </Box>
    );
}

function SubagentRow({
    run,
    status,
    now,
    calls,
    chatId,
    onOpen,
}: {
    run: SubagentRun;
    status: RunStatus;
    now: number;
    calls: LLMCall[];
    chatId: string;
    /** Opens the subagent's own view (issue #48). */
    onOpen?: (runId: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const usage = runUsage(run, calls);
    const live = status === 'running' || status === 'idle';
    const meta = [
        RUN_STATUS_LABEL[status],
        formatElapsed(runDuration(run, status, now)),
        run.toolCalls ? `${run.toolCalls} tool${run.toolCalls === 1 ? '' : 's'}` : '',
    ].filter(Boolean);
    return (
        <Box
            component="li"
            data-testid="agent-subagent-run"
            data-status={status}
            sx={{ borderTop: 1, borderColor: 'divider', '&:first-of-type': { borderTop: 0 }, minWidth: 0 }}
        >
            <Box sx={{ display: 'flex', alignItems: 'flex-start', minWidth: 0 }}>
                <ButtonBase
                    onClick={() => setOpen(!open)}
                    aria-expanded={open}
                    sx={{
                        display: 'flex',
                        flex: 1,
                        minWidth: 0,
                        alignItems: 'flex-start',
                        gap: 0.75,
                        py: 0.75,
                        textAlign: 'left',
                    }}
                >
                    <ChevronRightIcon
                        sx={{
                            fontSize: 16,
                            mt: '1px',
                            flex: 'none',
                            color: 'text.secondary',
                            transform: open ? 'rotate(90deg)' : 'none',
                            transition: 'transform 150ms',
                        }}
                    />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                            {live && <CircularProgress size={11} thickness={5} sx={{ flex: 'none' }} />}
                            <EllipsisText text={runTitle(run)} sx={{ fontSize: 12.5, fontWeight: 500 }} />
                            {usage && (
                                <Tooltip
                                    title={`${usage.calls} model call${usage.calls === 1 ? '' : 's'} · ${formatTokens(
                                        usage.tokens,
                                    )} tokens (input and output), recorded at the LLM proxy`}
                                >
                                    <Typography
                                        component="span"
                                        data-testid="agent-subagent-tokens"
                                        sx={{
                                            ml: 'auto',
                                            flex: 'none',
                                            fontSize: 11.5,
                                            color: 'text.secondary',
                                            fontVariantNumeric: 'tabular-nums',
                                        }}
                                    >
                                        {formatTokensShort(usage.tokens)} tokens
                                    </Typography>
                                </Tooltip>
                            )}
                        </Box>
                        <Typography noWrap sx={{ fontSize: 11.5, color: 'text.secondary' }}>
                            <Box component="span" sx={{ color: RUN_COLOR[status] }}>
                                {meta[0]}
                            </Box>
                            {meta.length > 1 ? ` · ${meta.slice(1).join(' · ')}` : ''} · {runSubtitle(run)}
                        </Typography>
                    </Box>
                </ButtonBase>
                {onOpen && (
                    <Tooltip title="Open this subagent (read-only)">
                        <IconButton
                            size="small"
                            aria-label={`Open subagent ${runTitle(run)}`}
                            data-testid="agent-subagent-open"
                            onClick={() => onOpen(run.runId)}
                            sx={{ flex: 'none', mt: 0.5, ml: 0.25, p: 0.5 }}
                        >
                            <SmartToyOutlinedIcon sx={{ fontSize: 17, color: agentColors.subagent }} />
                        </IconButton>
                    </Tooltip>
                )}
            </Box>
            <Collapse in={open} unmountOnExit>
                <Box sx={{ pl: 2.75, pb: 1 }}>
                    <RunSteps run={run} live={live} chatId={chatId} />
                </Box>
            </Collapse>
        </Box>
    );
}

/**
 * Background tasks and subagent runs of the chat as a strip on top of the chat: collapsed one line
 * with the counts (and a spinner while something runs), opened the background tasks with state, runtime, last
 * lines and Stop, and the subagent runs with state, duration and tokens, each opening its own steps.
 */
export default function TaskStrip({
    chatId,
    chatRunning,
    background,
    onStopBackground,
    subagentEntries,
    subagentRuns,
    llmCalls,
    onOpenSubagent,
    subagentsElsewhere = false,
}: {
    chatId: string;
    chatRunning: boolean;
    background: BackgroundTask[];
    onStopBackground: (id: string) => Promise<void>;
    subagentEntries: SubagentEntry[];
    subagentRuns: SubagentRunMeta[];
    llmCalls: LLMCall[];
    /** Opens a subagent's own view (issue #48). */
    onOpenSubagent?: (runId: string) => void;
    /** The subagents are reachable elsewhere (the panel's chat selector): they alone open no strip. */
    subagentsElsewhere?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const runs = useMemo(() => groupRuns(subagentEntries, subagentRuns), [subagentEntries, subagentRuns]);
    const bgRunning = runningCount(background);
    // runtimes and statuses estimated from the entries need a clock while anything may be live
    const anyLive =
        bgRunning > 0 || chatRunning || runs.some((r) => runStatus(r, { chatRunning, now: Date.now() }) === 'running');
    const now = useNow(anyLive, 1000);
    const statuses = runs.map((r) => runStatus(r, { chatRunning, now }));
    const subRunning = statuses.filter((s) => s === 'running').length;
    const sorted = useMemo(() => sortBackground(background), [background]);
    // subagents alone open no strip where `subagentsElsewhere` (the panel lists them in its chat selector, so the
    // transcript keeps its height; issue #48); with background tasks they are listed here as well
    if (background.length === 0 && (runs.length === 0 || subagentsElsewhere)) return null;
    const busy = bgRunning + subRunning > 0;
    const summary = [
        background.length ? `Background ${backgroundSummary(background)}` : '',
        runs.length ? `Subagents ${runsSummary(statuses)}` : '',
    ]
        .filter(Boolean)
        .join(' · ');
    return (
        <Box data-testid="agent-tasks" sx={{ ...blockSx, overflow: 'hidden' }}>
            <ButtonBase
                onClick={() => setOpen(!open)}
                aria-expanded={open}
                sx={{
                    display: 'flex',
                    width: '100%',
                    justifyContent: 'flex-start',
                    alignItems: 'center',
                    gap: 1,
                    px: 1.5,
                    py: 0.9,
                    textAlign: 'left',
                }}
            >
                {busy ? (
                    <CircularProgress size={14} thickness={5} sx={{ flex: 'none' }} />
                ) : (
                    <LayersOutlinedIcon sx={{ fontSize: 16, color: agentColors.green }} />
                )}
                <Typography sx={{ fontSize: 13, fontWeight: 500, flex: 'none' }}>Tasks</Typography>
                <Typography noWrap title={summary} sx={{ fontSize: 12.5, color: 'text.secondary', minWidth: 0 }}>
                    {summary}
                </Typography>
                <ExpandMoreIcon
                    sx={{
                        ml: 'auto',
                        fontSize: 18,
                        color: 'text.secondary',
                        transform: open ? 'rotate(180deg)' : 'none',
                        transition: 'transform 150ms',
                    }}
                />
            </ButtonBase>
            <Collapse in={open} unmountOnExit>
                <Box sx={{ px: 1.5, pb: 1, maxHeight: 340, overflowY: 'auto' }}>
                    {sorted.length > 0 && (
                        <Box sx={{ mt: 0.25 }}>
                            <Typography sx={sectionTitleSx}>Background ({sorted.length})</Typography>
                            <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                                {sorted.map((t) => (
                                    <BackgroundRow key={t.id} task={t} now={now} onStop={onStopBackground} />
                                ))}
                            </Box>
                        </Box>
                    )}
                    {runs.length > 0 && (
                        <Box sx={{ mt: sorted.length ? 1 : 0.25 }}>
                            <Typography sx={{ ...sectionTitleSx, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <AccountTreeOutlinedIcon sx={{ fontSize: 12 }} />
                                Subagents ({runs.length})
                            </Typography>
                            <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                                {runs.map((r, i) => (
                                    <SubagentRow
                                        key={r.runId}
                                        run={r}
                                        status={statuses[i]}
                                        now={now}
                                        calls={llmCalls}
                                        chatId={chatId}
                                        onOpen={onOpenSubagent}
                                    />
                                ))}
                            </Box>
                        </Box>
                    )}
                </Box>
            </Collapse>
        </Box>
    );
}
