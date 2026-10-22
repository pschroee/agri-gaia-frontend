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
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined';
import RemoveIcon from '@mui/icons-material/Remove';
import StopCircleOutlinedIcon from '@mui/icons-material/StopCircleOutlined';

import { backgroundStatus } from '../background';
import type { BackgroundTask } from '../types';

import { formatMs } from '../format';
import { groupSkillLoads, groupStatus, skillLabel, skillRead } from '../skillStep';
import type { StepGroup } from '../skillStep';
import type { StopState, SubagentNavItem } from '../subagents';
import { abortLabel } from '../transcript';
import type { Step, StepStatus } from '../transcript';
import BlockedRows from './internet/BlockedRows';
import StepDetail from './StepDetail';
import { agentColors, blockSx, MONO } from './tokens';

const STATUS_LABEL: Record<StepStatus, string> = {
    running: 'running',
    done: 'done',
    error: 'failed',
    waiting: 'needs approval',
    blocked: 'blocked',
    stopped: 'not finished',
    // the reason decides what a stopped step says (issue #120, abortLabel); this is the wording without one
    aborted: 'stopped',
};

/**
 * What a step row shows on its right: the duration while it runs or is done, otherwise what its state means. A step
 * that was stopped names the reason (issue #120, F9): "stopped by you" only when the user stopped, else the limit or
 * the trash, and just "stopped" when nothing recorded a reason.
 */
function statusText(s: Step): string {
    if (s.status === 'done' || s.status === 'running') return formatMs(s.durationMs) ?? '';
    if (s.status === 'aborted') return abortLabel(s.abortReason);
    return STATUS_LABEL[s.status];
}

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
    /** Background task per ID ("bg-3"), for the rows of bg_output and bg_stop (#197). */
    backgroundById?: Map<string, BackgroundTask>;
    /** The runs each `subagent` call started, listed in a card below the answer and opened on click (#48, #54). */
    subagents?: {
        byCall: Map<string, SubagentNavItem[]>;
        onOpen: (runId: string) => void;
        /** Stop control of the card (issue #120); missing where there is nothing to stop (read-only views). */
        stop?: {
            onStop: (runId: string) => void;
            stateOf: (runId: string) => StopState;
            errorOf: (runId: string) => string | undefined;
            dismissError: (runId: string) => void;
        };
    };
};

/**
 * Open state of the steps' details, kept by the caller so it survives reloads of the transcript and the switch from
 * live to stored message (like the thinking blocks); keyed by `stepOpenKey`.
 */
export type StepExpand = { open: Record<string, boolean>; onOpenChange: (key: string, open: boolean) => void };

/** Key of a step in the open state (shared with the thinking blocks' record, so it gets a prefix). */
export const stepOpenKey = (id: string) => `step:${id}`;

const TONE_COLOR = { running: agentColors.green, ok: agentColors.ok, error: agentColors.red, muted: 'text.secondary' };

/** The border of the chip follows the state, like its text (#197). */
const TONE_LINE = { running: agentColors.greenLine, ok: agentColors.greenLine, error: agentColors.redLine, muted: 'divider' };

/** The tools that name a task by its ID instead of starting it. */
const BG_TOOLS = new Set(['bg_output', 'bg_stop']);

function bgIdOf(s: Step): string | undefined {
    if (!BG_TOOLS.has(s.name ?? s.tool)) return undefined;
    const id = (s.args as { id?: unknown } | undefined)?.id;
    return typeof id === 'string' ? id : undefined;
}

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
                    borderColor: TONE_LINE[st.tone],
                    color: TONE_COLOR[st.tone],
                    whiteSpace: 'nowrap',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                }}
            >
                <LayersOutlinedIcon sx={{ fontSize: 12 }} />
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
    // 16 px symbols with 2 px padding make the buttons 20 px high; the negative margin keeps the 18 px row from growing (#197); the tooltip wrappers are flex boxes, as inline spans they grew to 22 px
    const btn = { p: '2px', my: '-1px', flex: 'none' } as const;
    return (
        <Box sx={{ display: 'flex', flex: 'none', ml: 0.25 }}>
            <Tooltip title="Move to background: keeps running, the agent continues and is told when it ends">
                <Box component="span" sx={{ display: 'flex' }}>
                    <IconButton
                        size="small"
                        aria-label="Move to background"
                        data-testid="agent-step-background"
                        disabled={!!busy}
                        onClick={() => void act('bg')}
                        sx={btn}
                    >
                        {busy === 'bg' ? <CircularProgress size={14} /> : <LayersOutlinedIcon sx={{ fontSize: 16 }} />}
                    </IconButton>
                </Box>
            </Tooltip>
            <Tooltip title="Stop the command: the agent learns about it and continues">
                <Box component="span" sx={{ display: 'flex' }}>
                    <IconButton
                        size="small"
                        aria-label="Stop command"
                        data-testid="agent-step-stop"
                        disabled={!!busy}
                        onClick={() => void act('stop')}
                        sx={{ ...btn, color: 'text.secondary', '&:hover': { color: agentColors.red } }}
                    >
                        {busy === 'stop' ? <CircularProgress size={14} /> : <StopCircleOutlinedIcon sx={{ fontSize: 16 }} />}
                    </IconButton>
                </Box>
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
    const bgId = bgIdOf(s);
    const task = controls?.background.get(s.id) ?? (bgId ? controls?.backgroundById?.get(bgId) : undefined);
    const skill = skillRead(s);
    const named = skill ? skillLabel(skill) : undefined;
    return (
        <Box
            component="li"
            data-testid="agent-step"
            data-step-id={s.id}
            data-open={open}
            data-skill={skill?.skill}
            sx={{ minWidth: 0 }}
        >
            <Box
                role="button"
                tabIndex={0}
                aria-expanded={open}
                aria-label={
                    skill
                        ? `${open ? 'Hide' : 'Show'} details of skill ${skill.skill}`
                        : `${open ? 'Hide' : 'Show'} details of ${s.tool}`
                }
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
                <Tooltip title={statusText(s)}>
                    <Box sx={{ display: 'flex', flex: 'none' }}>
                        <StatusIcon status={s.status} />
                    </Box>
                </Tooltip>
                {named && skill ? (
                    <>
                        <MenuBookOutlinedIcon
                            data-testid="agent-step-skill-icon"
                            sx={{ fontSize: 16, flex: 'none', color: 'text.secondary' }}
                        />
                        <Typography component="span" sx={{ fontSize: 12, fontWeight: 500, flex: 'none' }}>
                            {named.label}
                        </Typography>
                        <Typography
                            component="span"
                            noWrap
                            title={skill.path}
                            sx={{ fontFamily: MONO, fontSize: 12, color: 'text.secondary', minWidth: 0 }}
                        >
                            {named.text}
                        </Typography>
                    </>
                ) : (
                    <>
                        <Typography component="span" sx={{ fontFamily: MONO, fontSize: 12, flex: 'none' }}>
                            {s.tool}
                        </Typography>
                        {s.summary && (
                            <Typography
                                component="span"
                                noWrap
                                title={s.summary}
                                // minWidth 24: the reason of a stopped step needs its room, the command gives way
                                // with an ellipsis instead of vanishing (issue #120)
                                sx={{ fontSize: 12, color: 'text.secondary', minWidth: 24 }}
                            >
                                {s.summary}
                            </Typography>
                        )}
                    </>
                )}
                {task && <BackgroundChip task={task} />}
                <Typography
                    component="span"
                    noWrap
                    title={statusText(s)}
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
                    {statusText(s)}
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
            <BlockedRows toolCallId={s.id} tool={s.tool} />
            <Collapse in={open} unmountOnExit>
                <StepDetail step={s} />
            </Collapse>
        </Box>
    );
}

/**
 * Row of a run of skill loads (issue #73): "Skills loaded" with the names; opened, one row per skill, each opening its
 * own details. Its open state is kept under the group key like a single step's.
 */
function SkillGroupRow({
    group,
    controls,
    openOf,
    toggle,
}: {
    group: Extract<StepGroup, { type: 'skills' }>;
    controls?: StepControls;
    openOf: (id: string) => boolean;
    toggle: (id: string) => void;
}) {
    const open = openOf(group.key);
    const status = groupStatus(group.steps);
    const names = group.skills.join(', ');
    const known = group.steps.filter((s) => s.durationMs !== undefined);
    const total = known.reduce((sum, s) => sum + (s.durationMs ?? 0), 0);
    return (
        <Box
            component="li"
            data-testid="agent-step-skill-group"
            data-skills={group.skills.join(',')}
            data-open={open}
            sx={{ minWidth: 0 }}
        >
            <Box
                role="button"
                tabIndex={0}
                aria-expanded={open}
                aria-label={`${open ? 'Hide' : 'Show'} details of skills ${names}`}
                data-testid="agent-step-skill-group-row"
                onClick={() => toggle(group.key)}
                onKeyDown={(e) => {
                    if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
                    e.preventDefault();
                    toggle(group.key);
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
                <Tooltip title={STATUS_LABEL[status]}>
                    <Box sx={{ display: 'flex', flex: 'none' }}>
                        <StatusIcon status={status} />
                    </Box>
                </Tooltip>
                <MenuBookOutlinedIcon
                    data-testid="agent-step-skill-icon"
                    sx={{ fontSize: 16, flex: 'none', color: 'text.secondary' }}
                />
                <Typography component="span" sx={{ fontSize: 12, fontWeight: 500, flex: 'none' }}>
                    Skills loaded
                </Typography>
                <Typography
                    component="span"
                    noWrap
                    title={names}
                    sx={{ fontFamily: MONO, fontSize: 12, color: 'text.secondary', minWidth: 0 }}
                >
                    {names}
                </Typography>
                {known.length > 0 && (
                    <Typography
                        component="span"
                        sx={{
                            ml: 'auto',
                            pl: 1,
                            flex: 'none',
                            fontSize: 11.5,
                            fontVariantNumeric: 'tabular-nums',
                            color: 'text.disabled',
                        }}
                    >
                        {formatMs(total)}
                    </Typography>
                )}
            </Box>
            <Collapse in={open} unmountOnExit>
                <Box component="ul" sx={{ listStyle: 'none', m: 0, pl: 2.5, pt: 0.75, display: 'grid', rowGap: 0.75 }}>
                    {group.steps.map((s) => (
                        <StepRow key={s.id} s={s} controls={controls} open={openOf(s.id)} onToggle={() => toggle(s.id)} />
                    ))}
                </Box>
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
                {groupSkillLoads(steps).map((g) =>
                    g.type === 'step' ? (
                        <StepRow
                            key={g.step.id}
                            s={g.step}
                            controls={controls}
                            open={openOf(g.step.id)}
                            onToggle={() => toggle(g.step.id)}
                        />
                    ) : (
                        <SkillGroupRow key={g.key} group={g} controls={controls} openOf={openOf} toggle={toggle} />
                    ),
                )}
            </Box>
        </Box>
    );
}
