// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { useState } from 'react';

import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import CheckIcon from '@mui/icons-material/Check';
import BlockIcon from '@mui/icons-material/Block';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import MoveDownIcon from '@mui/icons-material/MoveDown';
import RemoveIcon from '@mui/icons-material/Remove';
import StopCircleOutlinedIcon from '@mui/icons-material/StopCircleOutlined';

import { backgroundStatus } from '../background';
import type { BackgroundTask } from '../types';

import { formatMs } from '../format';
import type { SubagentNavItem } from '../subagents';
import type { Step, StepStatus } from '../transcript';
import StepDetail from './StepDetail';
import { agentColors, blockSx, MONO } from './tokens';

const STATUS_LABEL: Record<StepStatus, string> = {
    running: 'running',
    done: 'done',
    error: 'failed',
    waiting: 'needs approval',
    blocked: 'blocked',
    stopped: 'not finished',
    aborted: 'stopped by you',
};

function StatusIcon({ status }: { status: StepStatus }) {
    const sx = { fontSize: 16 };
    switch (status) {
        case 'running':
            return <CircularProgress size={12} thickness={5} sx={{ m: '2px' }} />;
        case 'done':
            return <CheckIcon sx={{ ...sx, color: agentColors.ok }} />;
        case 'waiting':
            return <HourglassEmptyIcon sx={{ ...sx, color: agentColors.amber }} />;
        case 'blocked':
            return <BlockIcon sx={{ ...sx, color: agentColors.red }} />;
        case 'error':
            return <CloseIcon sx={{ ...sx, color: agentColors.red }} />;
        case 'aborted':
            return <StopCircleOutlinedIcon sx={{ ...sx, color: 'text.secondary' }} />;
        default:
            return <RemoveIcon sx={{ ...sx, color: 'text.disabled' }} />;
    }
}

function headline(steps: Step[]): string {
    const running = steps.some((s) => s.status === 'running');
    const n = steps.length;
    const word = n === 1 ? 'tool call' : 'tool calls';
    return running ? `Working · ${n} ${word}` : `${n} ${word}`;
}

/** Control of running foreground commands and the background tasks they became (ChatView → Conversation). */
export type StepControls = {
    /** Tool call IDs of running foreground commands that can be stopped or moved. */
    running: Set<string>;
    onStop: (toolCallId: string) => Promise<void>;
    onBackground: (toolCallId: string) => Promise<BackgroundTask>;
    /** Background task per tool call that started it. */
    background: Map<string, BackgroundTask>;
    /** The runs each `subagent` call started, listed in a card below the answer and opened on click (#48, #54). */
    subagents?: { byCall: Map<string, SubagentNavItem[]>; onOpen: (runId: string) => void };
};

/**
 * Open state of the steps' details, kept by the caller so it survives reloads of the transcript and the switch from
 * live to stored message (like the thinking blocks); keyed by `stepOpenKey`.
 */
export type StepExpand = { open: Record<string, boolean>; onOpenChange: (key: string, open: boolean) => void };

/** Key of a step in the open state (shared with the thinking blocks' record, so it gets a prefix). */
export const stepOpenKey = (id: string) => `step:${id}`;

const TONE_COLOR = { running: agentColors.green, ok: agentColors.ok, error: agentColors.red, muted: 'text.secondary' };

/** Small chip on a step that started (or became) a background task: "bg-3 · running". */
function BackgroundChip({ task }: { task: BackgroundTask }) {
    const st = backgroundStatus(task);
    return (
        <Tooltip title={`Background task ${task.id}: ${st.label}`}>
            <Box
                component="span"
                data-testid="agent-step-bg"
                sx={{
                    flex: 'none',
                    fontFamily: MONO,
                    fontSize: 11,
                    px: 0.6,
                    borderRadius: 0.75,
                    border: 1,
                    borderColor: agentColors.greenLine,
                    color: TONE_COLOR[st.tone],
                    whiteSpace: 'nowrap',
                }}
            >
                {task.id} · {st.tone === 'running' ? 'running' : st.label}
            </Box>
        </Tooltip>
    );
}

/** Stop and "Move to background" on a running foreground command; failures show below the row. */
function RunningControls({
    id,
    controls,
    onError,
}: {
    id: string;
    controls: StepControls;
    onError: (t?: string) => void;
}) {
    const [busy, setBusy] = useState<'stop' | 'bg'>();
    const act = async (kind: 'stop' | 'bg') => {
        setBusy(kind);
        onError(undefined);
        try {
            if (kind === 'stop') await controls.onStop(id);
            else await controls.onBackground(id);
        } catch (e) {
            onError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(undefined);
        }
    };
    const btn = { p: 0.25, flex: 'none' } as const;
    return (
        <Box sx={{ display: 'flex', flex: 'none', ml: 0.25 }}>
            <Tooltip title="Move to background: keeps running, the agent continues and is told when it ends">
                <span>
                    <IconButton
                        size="small"
                        aria-label="Move to background"
                        data-testid="agent-step-background"
                        disabled={!!busy}
                        onClick={() => void act('bg')}
                        sx={btn}
                    >
                        {busy === 'bg' ? <CircularProgress size={14} /> : <MoveDownIcon sx={{ fontSize: 17 }} />}
                    </IconButton>
                </span>
            </Tooltip>
            <Tooltip title="Stop the command: the agent learns about it and continues">
                <span>
                    <IconButton
                        size="small"
                        aria-label="Stop command"
                        data-testid="agent-step-stop"
                        disabled={!!busy}
                        onClick={() => void act('stop')}
                        sx={btn}
                    >
                        {busy === 'stop' ? (
                            <CircularProgress size={14} />
                        ) : (
                            <StopCircleOutlinedIcon sx={{ fontSize: 17, color: agentColors.red }} />
                        )}
                    </IconButton>
                </span>
            </Tooltip>
        </Box>
    );
}

function StepRow({
    s,
    controls,
    open,
    onToggle,
}: {
    s: Step;
    controls?: StepControls;
    open: boolean;
    onToggle: () => void;
}) {
    const [error, setError] = useState<string>();
    const controllable = s.status === 'running' && !!controls?.running.has(s.id);
    const task = controls?.background.get(s.id);
    return (
        <Box component="li" data-testid="agent-step" data-step-id={s.id} data-open={open} sx={{ minWidth: 0 }}>
            <Box
                role="button"
                tabIndex={0}
                aria-expanded={open}
                aria-label={`${open ? 'Hide' : 'Show'} details of ${s.tool}`}
                data-testid="agent-step-row"
                onClick={onToggle}
                onKeyDown={(e) => {
                    if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
                    e.preventDefault();
                    onToggle();
                }}
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    minWidth: 0,
                    cursor: 'pointer',
                    borderRadius: 0.5,
                    mx: -0.5,
                    px: 0.5,
                    '&:hover': { bgcolor: 'action.hover' },
                    '&:focus-visible': { outline: `2px solid ${agentColors.green}`, outlineOffset: -2 },
                }}
            >
                <ChevronRightIcon
                    sx={{
                        fontSize: 16,
                        flex: 'none',
                        mr: -0.5,
                        color: 'text.secondary',
                        transition: 'transform 150ms',
                        transform: open ? 'rotate(90deg)' : 'none',
                    }}
                />
                <Tooltip title={STATUS_LABEL[s.status]}>
                    <Box sx={{ display: 'flex', flex: 'none' }}>
                        <StatusIcon status={s.status} />
                    </Box>
                </Tooltip>
                <Typography component="span" sx={{ fontFamily: MONO, fontSize: 12, flex: 'none' }}>
                    {s.tool}
                </Typography>
                {s.summary && (
                    <Typography
                        component="span"
                        noWrap
                        title={s.summary}
                        sx={{ fontSize: 12, color: 'text.secondary', minWidth: 0 }}
                    >
                        {s.summary}
                    </Typography>
                )}
                {task && <BackgroundChip task={task} />}
                <Typography
                    component="span"
                    sx={{
                        ml: 'auto',
                        pl: 1,
                        flex: 'none',
                        fontSize: 11.5,
                        fontVariantNumeric: 'tabular-nums',
                        color:
                            s.status === 'blocked' || s.status === 'error'
                                ? agentColors.red
                                : s.status === 'waiting'
                                ? agentColors.amberText
                                : 'text.disabled',
                    }}
                >
                    {s.status === 'done' || s.status === 'running'
                        ? formatMs(s.durationMs) ?? ''
                        : STATUS_LABEL[s.status]}
                </Typography>
                {controllable && controls && (
                    // the controls act on the command; they do not open its details
                    <Box
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        sx={{ display: 'flex' }}
                    >
                        <RunningControls id={s.id} controls={controls} onError={setError} />
                    </Box>
                )}
            </Box>
            {error && (
                <Typography role="alert" sx={{ fontSize: 11.5, color: agentColors.red, pl: 3 }}>
                    {error}
                </Typography>
            )}
            <Collapse in={open} unmountOnExit>
                <StepDetail step={s} />
            </Collapse>
        </Box>
    );
}

/**
 * Compact list of the tool calls of one agent step, in the answer where they happened (as before issue #54, restored
 * by #57): status, tool name in monospace, a hint at the arguments and the measured duration. A running foreground
 * command offers "Move to background" and "Stop"; a call that started a background task names it. A click on a step
 * opens its details below it (issue #58: command or arguments, platform requests, result); several can be open.
 */
export default function StepList({
    steps,
    controls,
    expand,
}: {
    steps: Step[];
    controls?: StepControls;
    /** Open state kept by the caller; without it the list keeps its own (e.g. in the task strip). */
    expand?: StepExpand;
}) {
    const [own, setOwn] = useState<Record<string, boolean>>({});
    const openOf = (id: string) => !!(expand ? expand.open[stepOpenKey(id)] : own[id]);
    const toggle = (id: string) => {
        const next = !openOf(id);
        if (expand) expand.onOpenChange(stepOpenKey(id), next);
        else setOwn((c) => ({ ...c, [id]: next }));
    };
    const total = steps.reduce((sum, s) => sum + (s.durationMs ?? 0), 0);
    const anyDuration = steps.some((s) => s.durationMs !== undefined);
    return (
        <Box data-testid="agent-step-list" sx={{ ...blockSx, borderLeft: `3px solid ${agentColors.green}`, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, pt: 1, pb: 0.75 }}>
                <Typography sx={{ fontSize: 13, fontWeight: 500 }}>{headline(steps)}</Typography>
                {anyDuration && (
                    <Typography
                        sx={{ ml: 'auto', fontSize: 11.5, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}
                    >
                        {formatMs(total)}
                    </Typography>
                )}
            </Box>
            <Box
                component="ul"
                data-testid="agent-steps"
                sx={{ listStyle: 'none', m: 0, px: 1.5, pb: 1, display: 'grid', rowGap: 0.75 }}
            >
                {steps.map((s) => (
                    <StepRow key={s.id} s={s} controls={controls} open={openOf(s.id)} onToggle={() => toggle(s.id)} />
                ))}
            </Box>
        </Box>
    );
}
