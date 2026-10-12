// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { useEffect, useId, useMemo, useRef, useState } from 'react';

import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';

import { openBlockers, sortedTasks, taskCounts } from '../tasks';
import type { Task } from '../tasks';
import EllipsisText from './EllipsisText';
import { agentColors } from './tokens';

/** Ring that turns while the task is in progress (design "Agent Task List", issue #88). */
function Spinner() {
    return (
        <Box
            component="svg"
            role="img"
            aria-label="In progress"
            width={18}
            height={18}
            viewBox="0 0 20 20"
            sx={{
                display: 'block',
                animation: 'agSpin 1.2s linear infinite',
                '@keyframes agSpin': { to: { transform: 'rotate(360deg)' } },
                '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
            }}
        >
            <circle cx="10" cy="10" r="7.5" fill="none" stroke="rgba(15,84,50,0.18)" strokeWidth="2.5" />
            <circle
                cx="10"
                cy="10"
                r="7.5"
                fill="none"
                stroke={agentColors.green}
                strokeWidth="2.5"
                strokeDasharray="16 48"
                strokeLinecap="round"
            />
        </Box>
    );
}

function StatusIcon({ status }: { status: Task['status'] }) {
    if (status === 'completed')
        return <CheckCircleIcon aria-label="Done" sx={{ fontSize: 20, color: agentColors.ok }} />;
    if (status === 'in_progress') return <Spinner />;
    return <RadioButtonUncheckedIcon aria-label="Pending" sx={{ fontSize: 20, color: agentColors.muted }} />;
}

const chipSx = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 0.5,
    height: 22,
    maxWidth: '100%',
    boxSizing: 'border-box',
    pl: '6px',
    pr: 1,
    border: 1,
    borderRadius: '11px',
    fontSize: 12,
} as const;

function TaskRow({
    task,
    all,
    expanded,
    onToggle,
    descId,
}: {
    task: Task;
    all: Task[];
    expanded: boolean;
    onToggle: () => void;
    descId: string;
}) {
    const done = task.status === 'completed';
    const blockers = openBlockers(task, all);
    const blocked = blockers.length > 0;
    const hasDesc = !!task.description;
    return (
        <Box role="listitem" data-testid="agent-task-row" data-task-status={task.status}>
            <Box
                onClick={hasDesc ? onToggle : undefined}
                sx={{
                    display: 'grid',
                    gridTemplateColumns: '20px minmax(0, 1fr) 32px',
                    columnGap: 1.5,
                    alignItems: 'start',
                    py: '9px',
                    pl: 2,
                    pr: 1,
                    cursor: hasDesc ? 'pointer' : 'default',
                }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 20 }}>
                    <StatusIcon status={task.status} />
                </Box>
                <Box sx={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1px' }}>
                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, minWidth: 0, lineHeight: '20px' }}>
                        <Box
                            component="span"
                            sx={{ flex: 'none', fontSize: 12, color: agentColors.muted, fontVariantNumeric: 'tabular-nums' }}
                        >
                            #{task.id}
                        </Box>
                        <EllipsisText
                            text={task.subject}
                            sx={{
                                flex: 1,
                                minWidth: 0,
                                fontSize: 14,
                                color: done || blocked ? agentColors.muted : 'text.primary',
                                textDecoration: done ? 'line-through' : 'none',
                            }}
                        />
                    </Box>
                    {task.status === 'in_progress' && task.activeForm && (
                        <EllipsisText
                            text={`${task.activeForm}…`}
                            sx={{ fontSize: 13, lineHeight: '18px', fontStyle: 'italic', color: agentColors.green }}
                        />
                    )}
                    {(task.owner || blocked) && (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5, minWidth: 0 }}>
                            {task.owner && (
                                <Box
                                    component="span"
                                    title={`Owner: ${task.owner}`}
                                    sx={{ ...chipSx, flex: 'none', borderColor: agentColors.outline, color: 'text.primary' }}
                                >
                                    <SmartToyOutlinedIcon sx={{ fontSize: 14, color: agentColors.muted }} />
                                    <Box
                                        component="span"
                                        sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                    >
                                        {task.owner}
                                    </Box>
                                </Box>
                            )}
                            {blocked && (
                                <Box
                                    component="span"
                                    sx={{
                                        ...chipSx,
                                        whiteSpace: 'nowrap',
                                        borderColor: agentColors.amberLine,
                                        bgcolor: 'rgba(237,108,2,0.08)',
                                        color: agentColors.amberText,
                                    }}
                                >
                                    <HourglassEmptyIcon sx={{ fontSize: 14 }} />
                                    blocked by {blockers.map((i) => `#${i}`).join(', ')}
                                </Box>
                            )}
                        </Box>
                    )}
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                    {hasDesc && (
                        <IconButton
                            size="small"
                            aria-label={expanded ? 'Hide description' : 'Show description'}
                            aria-expanded={expanded}
                            aria-controls={descId}
                            onClick={(e) => {
                                e.stopPropagation();
                                onToggle();
                            }}
                            sx={{ width: 32, height: 32, my: '-6px', color: agentColors.muted }}
                        >
                            <ExpandMoreIcon
                                sx={{ fontSize: 20, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}
                            />
                        </IconButton>
                    )}
                </Box>
            </Box>
            {hasDesc && (
                <Collapse in={expanded} unmountOnExit>
                    <Box
                        id={descId}
                        sx={{
                            pt: 0,
                            pb: 1.25,
                            pl: 6,
                            pr: 2,
                            mt: '-3px',
                            fontSize: 13,
                            lineHeight: '19px',
                            color: agentColors.muted,
                            whiteSpace: 'pre-wrap',
                            overflowWrap: 'anywhere',
                        }}
                    >
                        {task.description}
                    </Box>
                </Collapse>
            )}
        </Box>
    );
}

/**
 * The agent's task list, read-only (issue #88): header with progress, open tasks first, completed ones behind a
 * toggle, description on request. Rendered inside a popover or a bottom sheet (`sheet`: handle and close button).
 */
export default function TaskList({
    tasks,
    sheet = false,
    maxListHeight = 440,
    onClose,
    initialShowDone = false,
    initialExpanded = [],
}: {
    tasks: Task[];
    sheet?: boolean;
    maxListHeight?: number | string;
    onClose: () => void;
    initialShowDone?: boolean;
    initialExpanded?: number[];
}) {
    const uid = useId();
    const rootRef = useRef<HTMLDivElement>(null);
    const [expanded, setExpanded] = useState<number[]>(initialExpanded);
    const [showDone, setShowDone] = useState(initialShowDone);
    const sorted = useMemo(() => sortedTasks(tasks), [tasks]);
    const counts = taskCounts(tasks);
    const allDone = counts.total > 0 && counts.completed === counts.total;
    const open = sorted.filter((t) => t.status !== 'completed');
    const completed = sorted.filter((t) => t.status === 'completed');
    const headId = `${uid}-head`;
    const dragStart = useRef<number>();

    // focus moves into the list when it opens; MUI returns it to the button when it closes
    useEffect(() => {
        rootRef.current?.focus({ preventScroll: true });
    }, []);

    const toggle = (id: number) => setExpanded((l) => (l.includes(id) ? l.filter((i) => i !== id) : [...l, id]));
    const row = (t: Task) => (
        <TaskRow
            key={t.id}
            task={t}
            all={tasks}
            expanded={expanded.includes(t.id)}
            onToggle={() => toggle(t.id)}
            descId={`${uid}-d${t.id}`}
        />
    );

    return (
        <Box
            ref={rootRef}
            role="dialog"
            aria-labelledby={headId}
            tabIndex={-1}
            data-testid="agent-task-list"
            sx={{ display: 'flex', flexDirection: 'column', width: '100%', minHeight: 0, outline: 'none' }}
        >
            {sheet && (
                <Box
                    aria-hidden
                    onPointerDown={(e) => {
                        dragStart.current = e.clientY;
                        e.currentTarget.setPointerCapture?.(e.pointerId);
                    }}
                    onPointerUp={(e) => {
                        if (dragStart.current !== undefined && e.clientY - dragStart.current > 40) onClose();
                        dragStart.current = undefined;
                    }}
                    sx={{ display: 'flex', justifyContent: 'center', pt: '10px', pb: '6px', cursor: 'grab', touchAction: 'none' }}
                >
                    <Box sx={{ width: 32, height: 4, borderRadius: '2px', bgcolor: 'rgba(0,0,0,0.26)' }} />
                </Box>
            )}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 40, py: 0.75, pl: 2, pr: 1 }}>
                <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 1 }}>
                    <Typography id={headId} component="h2" sx={{ fontSize: 16, lineHeight: '24px', fontWeight: 500 }}>
                        Tasks
                    </Typography>
                    <Typography component="span" sx={{ fontSize: 14, color: agentColors.muted, whiteSpace: 'nowrap' }}>
                        {counts.completed} of {counts.total} done
                    </Typography>
                </Box>
                {sheet && (
                    <IconButton aria-label="Close tasks" onClick={onClose} sx={{ width: 40, height: 40, color: agentColors.muted }}>
                        <CloseIcon sx={{ fontSize: 22 }} />
                    </IconButton>
                )}
            </Box>
            <LinearProgress
                variant="determinate"
                value={counts.total ? (counts.completed / counts.total) * 100 : 0}
                aria-label="Task progress"
                sx={{
                    height: 4,
                    mx: 2,
                    mb: 0.75,
                    borderRadius: '2px',
                    bgcolor: 'rgba(15,84,50,0.16)',
                    '& .MuiLinearProgress-bar': { bgcolor: allDone ? agentColors.ok : agentColors.green },
                }}
            />
            <Box
                role="list"
                sx={{
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    maxHeight: maxListHeight,
                    minHeight: 0,
                    pt: '2px',
                    pb: 0.75,
                    overscrollBehavior: 'contain',
                }}
            >
                {allDone && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', pt: 2.25, pb: 1.75, px: 2 }}>
                        <CheckCircleIcon aria-hidden sx={{ fontSize: 40, color: agentColors.ok }} />
                        <Typography sx={{ fontSize: 16, lineHeight: '24px', fontWeight: 500, mt: 0.5 }}>
                            All tasks done
                        </Typography>
                        <Typography sx={{ fontSize: 13, color: agentColors.muted }}>
                            {counts.completed} of {counts.total} completed
                        </Typography>
                    </Box>
                )}
                {open.map(row)}
                {completed.length > 0 && (
                    <ButtonBase
                        onClick={() => setShowDone((v) => !v)}
                        aria-expanded={showDone}
                        data-testid="agent-task-completed-toggle"
                        sx={{
                            display: 'flex',
                            justifyContent: 'flex-start',
                            gap: 1.5,
                            width: '100%',
                            mt: 0.5,
                            px: 2,
                            py: 1,
                            borderTop: 1,
                            borderColor: 'divider',
                            fontSize: 13,
                            lineHeight: '20px',
                            fontFamily: 'inherit',
                            color: agentColors.muted,
                            textAlign: 'left',
                        }}
                    >
                        <ExpandMoreIcon
                            aria-hidden
                            sx={{ fontSize: 20, transform: showDone ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}
                        />
                        <span>{showDone ? 'Hide completed' : `Show ${completed.length} completed`}</span>
                    </ButtonBase>
                )}
                {showDone && completed.map(row)}
            </Box>
        </Box>
    );
}
