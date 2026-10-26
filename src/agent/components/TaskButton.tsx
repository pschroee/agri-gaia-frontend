// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { useState } from 'react';

import useMediaQuery from '@mui/material/useMediaQuery';
import Popover from '@mui/material/Popover';
import SwipeableDrawer from '@mui/material/SwipeableDrawer';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ChecklistOutlinedIcon from '@mui/icons-material/ChecklistOutlined';

import { compactButtonLabel, panelPopoverGeometry, POPOVER_MEDIA_QUERY, taskAriaLabel, taskButtonLabel, taskCounts } from '../tasks';
import type { Task } from '../tasks';
import { HEADER_HOST, useHostWidth } from '../useHostWidth';
import HeaderStatusButton from './HeaderStatusButton';
import TaskList from './TaskList';
import { agentColors } from './tokens';

/**
 * The agent's task list as a button in the chat header, left of the context ring (issue #88): "3/7 tasks" (compact
 * "3/7" where the chat area is narrow), green while a task is in progress, a green check when all are done.
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
            <HeaderStatusButton
                buttonRef={setBtn}
                ariaLabel={taskAriaLabel(counts)}
                open={open}
                testId="agent-task-button"
                dataAttrs={{ 'data-task-running': String(running) }}
                tone={running ? 'running' : 'default'}
                onClick={() => setOpen(true)}
                icon={
                    all ? (
                        <CheckCircleIcon aria-hidden sx={{ fontSize: 18, color: agentColors.ok }} />
                    ) : (
                        <ChecklistOutlinedIcon aria-hidden sx={{ fontSize: 18 }} />
                    )
                }
                label={taskButtonLabel(counts, compact)}
            />
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
