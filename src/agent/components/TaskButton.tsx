// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { useState } from 'react';

import Badge from '@mui/material/Badge';
import ButtonBase from '@mui/material/ButtonBase';
import useMediaQuery from '@mui/material/useMediaQuery';
import Popover from '@mui/material/Popover';
import SwipeableDrawer from '@mui/material/SwipeableDrawer';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ChecklistOutlinedIcon from '@mui/icons-material/ChecklistOutlined';

import { compactButtonLabel, panelPopoverGeometry, POPOVER_MEDIA_QUERY, taskAriaLabel, taskButtonLabel, taskCounts } from '../tasks';
import type { Task } from '../tasks';
import { HEADER_HOST, useHostWidth } from '../useHostWidth';
import TaskList from './TaskList';
import { agentColors } from './tokens';

/**
 * The agent's task list as a button in the chat header, left of the context ring (issue #88): "3/7 tasks" (compact
 * "3/7" where the chat area is narrow), a pulsing dot while a task is in progress, a green check when all are done.
 * Hidden without tasks. A click opens the read-only list: popover on viewports of at least 600 px (also in the
 * context panel), else a bottom sheet.
 */
export default function TaskButton({ tasks }: { tasks: Task[] | undefined }) {
    // state, not a ref object: the button only exists once the chat has tasks, and the measuring starts then
    const [btn, setBtn] = useState<HTMLButtonElement | null>(null);
    const [open, setOpen] = useState(false);
    const { width, panel } = useHostWidth(btn);
    // the container follows the viewport (popover on desktop, also in the panel; sheet on mobile) ...
    const popover = useMediaQuery(POPOVER_MEDIA_QUERY);
    const counts = taskCounts(tasks ?? []);
    if (counts.total === 0) return null;
    // ... while the label follows the width of the chat area, as before
    const compact = compactButtonLabel(width);
    const all = counts.completed === counts.total;
    const running = counts.inProgress > 0 && !all;
    const close = () => setOpen(false);
    // in the panel the popover spans the panel header's width right below it (read when rendered, so a resize that
    // changes `width` or re-renders the button follows; Popover itself re-positions on window resize)
    const header = panel && popover && open ? btn?.closest<HTMLElement>(HEADER_HOST) : null;
    const geo = header ? panelPopoverGeometry(header.getBoundingClientRect()) : null;
    return (
        <>
            <ButtonBase
                ref={setBtn}
                aria-label={taskAriaLabel(counts)}
                aria-haspopup="dialog"
                aria-expanded={open}
                data-testid="agent-task-button"
                data-task-running={running}
                onClick={() => setOpen(true)}
                sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.75,
                    flex: 'none',
                    whiteSpace: 'nowrap',
                    height: 30,
                    px: 1,
                    mx: '-2px',
                    borderRadius: 1,
                    fontSize: 14,
                    fontFamily: 'inherit',
                    fontVariantNumeric: 'tabular-nums',
                    color: running ? agentColors.green : agentColors.muted,
                    bgcolor: open ? 'rgba(15,84,50,0.08)' : 'transparent',
                    '&:hover': { bgcolor: 'rgba(15,84,50,0.08)' },
                    '&.Mui-focusVisible': { outline: `2px solid ${agentColors.green}`, outlineOffset: 1 },
                }}
            >
                {all ? (
                    <CheckCircleIcon aria-hidden sx={{ fontSize: 18, color: agentColors.ok }} />
                ) : (
                    <Badge
                        variant="dot"
                        invisible={!running}
                        overlap="circular"
                        sx={{
                            '& .MuiBadge-dot': {
                                bgcolor: agentColors.green,
                                border: '1.5px solid #fff',
                                boxSizing: 'border-box',
                                width: 8,
                                height: 8,
                                minWidth: 8,
                                animation: 'agPulse 1.6s ease-out infinite',
                                '@keyframes agPulse': {
                                    '0%': { boxShadow: '0 0 0 0 rgba(15,84,50,.55)' },
                                    '70%': { boxShadow: '0 0 0 6px rgba(15,84,50,0)' },
                                    '100%': { boxShadow: '0 0 0 0 rgba(15,84,50,0)' },
                                },
                                '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
                            },
                        }}
                    >
                        <ChecklistOutlinedIcon aria-hidden sx={{ fontSize: 18 }} />
                    </Badge>
                )}
                <span>{taskButtonLabel(counts, compact)}</span>
            </ButtonBase>
            {popover ? (
                <Popover
                    open={open}
                    onClose={close}
                    {...(geo
                        ? {
                              anchorReference: 'anchorPosition' as const,
                              anchorPosition: { top: geo.top, left: geo.left },
                              transformOrigin: { vertical: 'top' as const, horizontal: 'left' as const },
                              slotProps: { paper: { sx: { width: geo.width, maxWidth: geo.width } } },
                              marginThreshold: 0,
                          }
                        : {
                              anchorEl: btn,
                              anchorOrigin: { vertical: 'bottom' as const, horizontal: 'right' as const },
                              transformOrigin: { vertical: 'top' as const, horizontal: 'right' as const },
                              slotProps: { paper: { sx: { width: 360, maxWidth: 'calc(100vw - 24px)', mt: 0.5 } } },
                          })}
                >
                    <TaskList tasks={tasks ?? []} onClose={close} maxListHeight="min(440px, calc(100vh - 150px))" />
                </Popover>
            ) : (
                <SwipeableDrawer
                    anchor="bottom"
                    open={open}
                    onClose={close}
                    onOpen={() => setOpen(true)}
                    disableSwipeToOpen
                    disableDiscovery
                    PaperProps={{
                        sx: {
                            // in the panel the sheet is as wide as the panel, else as the screen
                            ...(panel ? { left: 'auto', right: 0, width: width } : { width: '100%' }),
                            // above the fixed platform footer (30 px)
                            bottom: '30px',
                            maxHeight: 'calc(70% - 30px)',
                            borderTopLeftRadius: 12,
                            borderTopRightRadius: 12,
                            bgcolor: '#fff',
                        },
                    }}
                >
                    <TaskList tasks={tasks ?? []} sheet onClose={close} maxListHeight="calc(70vh - 110px)" />
                </SwipeableDrawer>
            )}
        </>
    );
}
