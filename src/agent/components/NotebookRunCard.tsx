// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The card of a run in the chat's notebook server (own code C-E4), in the chat under the tool call that started it.
// Everything on it comes from the gateway's observed job (kind `notebook_run`, `src/agent/jobs.ts`) — its state, its
// line, the tail of its log, its result files and the address in JupyterHub (`link`); the entry file, the datasets
// and the time limit come from the approval's structured data, which the caller passes along.
//
// The card never builds the JupyterHub address itself and never polls: it follows the `job` events of the chat. While
// the run goes it ticks the time itself and offers "Stop run", which calls the stop route of the gateway (A-E2 D2.9);
// the gateway reports a stopped run as failed with its explanation, and the card then shows it as stopped.

import { useState } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import Paper from '@mui/material/Paper';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import StopCircleOutlinedIcon from '@mui/icons-material/StopCircleOutlined';
import TimerOffIcon from '@mui/icons-material/TimerOff';

import { agentApi } from '../api';
import { formatBytes } from '../files';
import { useNow } from '../useNow';
import {
    factText,
    formatTime,
    fullLog,
    isLive,
    isResultFile,
    LAUNCH_HINT,
    midTrunc,
    outputName,
    outputSize,
    runFacts,
    runHeadTime,
    runViewOf,
    shortLog,
    startingNote,
    timeoutNote,
    RUN_LABEL,
} from '../notebook';
import type { NotebookApprovalData, NotebookRunView } from '../notebook';
import type { WatchJob } from '../jobs';
import { agentColors, MONO } from './tokens';

export type RunCardLayout = 'panel' | 'page';

/** The colour of the left border: a failed run stands out, a stopped one stays quiet (design decision). */
const EDGE: Record<NotebookRunView, string> = {
    starting: agentColors.green,
    running: agentColors.green,
    finished: agentColors.green,
    failed: agentColors.red,
    timeout: agentColors.amber,
    stopped: '#bdbdbd',
};

/** Colour of the state word and its symbol. */
const STATE_COLOR: Record<NotebookRunView, string> = {
    starting: 'text.primary',
    running: 'text.primary',
    finished: agentColors.ok,
    failed: 'error.main',
    timeout: 'warning.dark',
    stopped: 'text.secondary',
};

/** The symbol of the state, next to its word: the state is never told by the colour alone. */
function StateIcon({ view }: { view: NotebookRunView }) {
    switch (view) {
        case 'starting':
        case 'running':
            return <CircularProgress size={14} thickness={5} />;
        case 'finished':
            return <CheckIcon sx={{ fontSize: 18, color: agentColors.ok }} aria-hidden />;
        case 'failed':
            return <CloseIcon sx={{ fontSize: 18, color: 'error.main' }} aria-hidden />;
        case 'timeout':
            return <TimerOffIcon sx={{ fontSize: 18, color: 'warning.dark' }} aria-hidden />;
        default:
            return <StopCircleOutlinedIcon sx={{ fontSize: 18, color: 'text.secondary' }} aria-hidden />;
    }
}

const PRE_SX = {
    m: 0,
    p: '8px 12px',
    borderRadius: 1,
    fontFamily: MONO,
    fontSize: 12,
    lineHeight: '18px',
    whiteSpace: 'pre',
    overflowX: 'auto',
} as const;

/** The tail of the run's log; a failed run shows it in the red block of the step details (design, gap L13). */
function LogBlock({ label, text, error }: { label: string; text: string; error: boolean }) {
    return (
        <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 12, color: error ? 'error.main' : 'text.secondary', display: 'block', mb: 0.5 }}>
                {label}
            </Typography>
            <Box
                component="pre"
                aria-label={label}
                sx={{
                    ...PRE_SX,
                    border: 1,
                    borderColor: error ? 'rgba(211,47,47,0.5)' : 'grey.300',
                    bgcolor: error ? agentColors.redTint : agentColors.panelBg,
                    color: error ? 'error.dark' : 'text.primary',
                }}
            >
                {text}
            </Box>
        </Box>
    );
}

/** The files the run left in `outputs/`, with the sizes the gateway reports (gap L12). */
function ResultFiles({ files }: { files: { name: string; size?: number }[] }) {
    return (
        <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 12, color: 'text.secondary', display: 'block', mb: 0.5 }}>
                Result files in outputs/
            </Typography>
            <Paper variant="outlined" sx={{ minWidth: 0 }}>
                <List dense disablePadding aria-label="Result files">
                    {files.map((f) => (
                        <ListItem key={f.name} sx={{ gap: 1.5, minWidth: 0, py: 0.25 }}>
                            <InsertDriveFileOutlinedIcon
                                sx={{ fontSize: 18, color: 'text.secondary', flex: 'none' }}
                                aria-hidden
                            />
                            <Typography
                                title={f.name}
                                sx={{ fontFamily: MONO, fontSize: 12, flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}
                            >
                                {f.name}
                            </Typography>
                            {f.size !== undefined && (
                                <Typography sx={{ fontSize: 12, color: 'text.secondary', flex: 'none' }}>
                                    {formatBytes(f.size)}
                                </Typography>
                            )}
                        </ListItem>
                    ))}
                </List>
            </Paper>
        </Box>
    );
}

/**
 * One observed run of the chat's notebook server. `data` is the structured data of the approval that started it
 * (the entry file, the datasets and the time limit, which the job itself does not carry); without it the card shows
 * what the job alone can tell.
 */
export default function NotebookRunCard({
    job,
    layout,
    data,
}: {
    job: WatchJob;
    layout: RunCardLayout;
    data?: NotebookApprovalData;
}) {
    const view = runViewOf(job);
    const live = isLive(view);
    const now = useNow(live, 1000);
    const [logOpen, setLogOpen] = useState(false);
    const [stopping, setStopping] = useState(false);
    const [stopError, setStopError] = useState<string>();
    const panel = layout === 'panel';

    const label = RUN_LABEL[view];
    const entry = data?.entry ?? '';
    const fileMax = panel ? 26 : 56;
    const time = runHeadTime(job, data, now);
    const facts = runFacts(job, data, now);
    const short = shortLog(view, job.log_tail);
    const full = fullLog(job.log_tail);
    const outputs = (job.outputs ?? []).filter(
        (o) => (!o.resource || o.resource === 'notebook_file') && isResultFile(o),
    );
    const showResults = outputs.length > 0 || view === 'finished';
    const note =
        view === 'starting'
            ? startingNote(job.started_at ? formatTime(job.started_at) : undefined, entry, fileMax)
            : view === 'timeout'
            ? timeoutNote(data?.limits.timeout_min)
            : undefined;

    const stop = async () => {
        setStopping(true);
        setStopError(undefined);
        try {
            // the stop route of the gateway for this job (A-E2 D2.9); it stops the chat's notebook server, and the
            // run then ends and is reported as stopped
            await agentApi.stopJob(job.chat_id, job.id);
        } catch (e) {
            setStopError(e instanceof Error ? e.message : String(e));
        } finally {
            setStopping(false);
        }
    };

    return (
        <Card
            variant="outlined"
            role="group"
            data-testid="agent-notebook-run"
            data-state={view}
            aria-label={entry ? `Notebook run ${entry}: ${label}` : `Notebook run: ${label}`}
            sx={{ borderLeft: `3px solid ${EDGE[view]}`, overflow: 'hidden', minWidth: 0 }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: panel ? 1 : 1.25 }}>
                <Box sx={{ flex: 'none', width: 18, display: 'flex', justifyContent: 'center' }}>
                    <StateIcon view={view} />
                </Box>
                <Typography
                    role="status"
                    aria-live="polite"
                    sx={{ flex: 'none', fontSize: 13, fontWeight: 500, color: STATE_COLOR[view], whiteSpace: 'nowrap' }}
                >
                    {label}
                </Typography>
                {entry && (
                    <Typography
                        title={entry}
                        sx={{
                            flex: 1,
                            minWidth: 0,
                            fontFamily: MONO,
                            fontSize: 12,
                            color: 'text.secondary',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                        }}
                    >
                        {midTrunc(entry, fileMax)}
                    </Typography>
                )}
                {time && (
                    <Typography
                        sx={{ ml: 'auto', flex: 'none', fontSize: 12, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}
                    >
                        {time}
                    </Typography>
                )}
            </Box>
            {view === 'starting' ? (
                <LinearProgress aria-label="Starting notebook server" sx={{ height: 4 }} />
            ) : (
                <Box sx={{ height: '1px', bgcolor: 'divider' }} />
            )}
            <Box
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1.25,
                    px: 1.5,
                    py: panel ? 1.25 : 1.5,
                    minWidth: 0,
                }}
            >
                {facts.length > 0 &&
                    (panel ? (
                        <Typography
                            data-testid="agent-notebook-run-facts"
                            sx={{ fontSize: 12, color: 'text.secondary' }}
                        >
                            {facts.map((f, i) => (
                                <Box
                                    key={f.label}
                                    component="span"
                                    sx={{ color: f.tone === 'error' ? 'error.main' : f.tone === 'warning' ? 'warning.dark' : undefined }}
                                >
                                    {i > 0 ? ' · ' : ''}
                                    {factText(f)}
                                </Box>
                            ))}
                        </Typography>
                    ) : (
                        <Box
                            component="dl"
                            data-testid="agent-notebook-run-facts"
                            sx={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', columnGap: 2, rowGap: 0.5, m: 0, minWidth: 0 }}
                        >
                            {facts.map((f) => (
                                <Box key={f.label} sx={{ display: 'contents' }}>
                                    <Typography component="dt" sx={{ fontSize: 12, color: 'text.secondary' }}>
                                        {f.label}
                                    </Typography>
                                    <Typography
                                        component="dd"
                                        sx={{
                                            m: 0,
                                            fontSize: 13,
                                            color:
                                                f.tone === 'error'
                                                    ? 'error.main'
                                                    : f.tone === 'warning'
                                                    ? 'warning.dark'
                                                    : 'text.primary',
                                        }}
                                    >
                                        {f.value}
                                    </Typography>
                                </Box>
                            ))}
                        </Box>
                    ))}
                {note && <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>{note}</Typography>}
                {logOpen && full ? (
                    <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontSize: 12, color: 'text.secondary', display: 'block', mb: 0.5 }}>
                            {full.label}
                        </Typography>
                        <Box
                            component="pre"
                            tabIndex={0}
                            aria-label={full.label}
                            sx={{ ...PRE_SX, maxHeight: 320, overflow: 'auto', border: 1, borderColor: 'grey.300', bgcolor: agentColors.panelBg }}
                        >
                            {full.text}
                        </Box>
                    </Box>
                ) : (
                    short && <LogBlock label={short.label} text={short.text} error={short.error} />
                )}
                {showResults &&
                    (outputs.length > 0 ? (
                        <ResultFiles files={outputs.map((o) => ({ name: outputName(o), size: outputSize(o) }))} />
                    ) : (
                        <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>No files in outputs/.</Typography>
                    ))}
            </Box>
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 0.5,
                    px: panel ? 1 : 1.5,
                    pb: 0.75,
                    minWidth: 0,
                }}
            >
                {view !== 'starting' && full && (
                    <Button
                        size="small"
                        variant="text"
                        startIcon={<ArticleOutlinedIcon fontSize="small" />}
                        aria-expanded={logOpen}
                        onClick={() => setLogOpen((o) => !o)}
                        sx={{ flex: 'none' }}
                    >
                        {logOpen ? 'Hide log' : 'Show log'}
                    </Button>
                )}
                {job.link && (
                    <Tooltip title={live ? '' : LAUNCH_HINT}>
                        <Box
                            component="a"
                            href={job.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="Open in JupyterHub (opens in a new tab)"
                            sx={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 0.75,
                                px: 0.75,
                                py: 0.5,
                                borderRadius: 1,
                                fontSize: 13,
                                fontWeight: 500,
                                letterSpacing: '0.02857em',
                                textTransform: 'uppercase',
                                textDecoration: 'none',
                                color: 'primary.main',
                                '&:hover': { bgcolor: 'rgba(15,84,50,0.04)' },
                            }}
                        >
                            Open in JupyterHub
                            <OpenInNewIcon sx={{ fontSize: 16 }} aria-hidden />
                        </Box>
                    </Tooltip>
                )}
                {live && (
                    <Tooltip title="Stop run">
                        <IconButton
                            size="small"
                            color="error"
                            disabled={stopping}
                            onClick={() => void stop()}
                            aria-label="Stop run"
                            sx={{ ml: 'auto', flex: 'none' }}
                        >
                            <StopCircleOutlinedIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                )}
                {stopError && (
                    <Typography role="alert" sx={{ flexBasis: '100%', fontSize: 12, color: 'error.main' }}>
                        {`Stopping failed: ${stopError}`}
                    </Typography>
                )}
            </Box>
        </Card>
    );
}
