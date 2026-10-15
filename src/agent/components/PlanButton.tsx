// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The current plan of a chat as a button in the chat header (issue #138, L8), after the pattern of the task button
// (#88): the plan the user should look at next, its state at the dot, a click opens the list of the chat's plans.
// Hidden without a plan. Which plan that is and what the words say is pure logic in ../planButton.ts.

import { useState } from 'react';

import Badge from '@mui/material/Badge';
import ButtonBase from '@mui/material/ButtonBase';
import Tooltip from '@mui/material/Tooltip';
import useMediaQuery from '@mui/material/useMediaQuery';
import Popover from '@mui/material/Popover';
import SwipeableDrawer from '@mui/material/SwipeableDrawer';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import TaskAltIcon from '@mui/icons-material/TaskAlt';

// the geometry of the header popover is the task button's (tasks.ts): the same row, the same rules
import { compactButtonLabel, panelPopoverGeometry, POPOVER_MEDIA_QUERY } from '../tasks';
import type { Plan } from '../plan';
import { currentPlan, planAriaLabel, planButtonLabel, planMark, planTooltip } from '../planButton';
import type { PlanMark } from '../planButton';
import { scrollToPlanCard } from '../planRegistry';
import { HEADER_HOST, useHostWidth } from '../useHostWidth';
import PlanList from './PlanList';
import { agentColors } from './tokens';

/** Colour of the button (and of its dot) per state: attention amber, running green, failed red, else muted. */
export const planButtonColor = (mark: PlanMark): string => {
    switch (mark) {
        case 'approval':
            return agentColors.amber;
        case 'running':
            return agentColors.green;
        case 'failed':
            return agentColors.red;
        default:
            return agentColors.muted;
    }
};

/**
 * The current plan of the chat in the chat header, right of the task button (issue #138): "Plan · Running" (compact
 * "Plan" where the chat area is narrow, e.g. in the panel), a dot while the plan needs attention or runs (pulsing,
 * like the task button's), a tooltip with the plan's title and state. Hidden without a plan. A click opens the
 * read-only list of all the chat's plans: popover on viewports of at least 600 px (also in the context panel),
 * else a bottom sheet.
 */
export default function PlanButton({ plans }: { plans: Plan[] | undefined }) {
    const [btn, setBtn] = useState<HTMLButtonElement | null>(null);
    const [open, setOpen] = useState(false);
    const { width, panel } = useHostWidth(btn);
    // the container follows the viewport (popover on desktop, also in the panel; sheet on mobile) ...
    const popover = useMediaQuery(POPOVER_MEDIA_QUERY);
    // read at render time: the plans come from the chat view, which reloads them on every change of the run
    const now = Date.now();
    const plan = currentPlan(plans ?? [], now);
    if (!plan) return null;
    const mark = planMark(plan, now);
    // ... while the label follows the width of the chat area, as the task button's does
    const compact = compactButtonLabel(width);
    const close = () => setOpen(false);
    const jumpTo = (planId: string) => {
        close();
        scrollToPlanCard(planId);
    };
    // in the panel the popover spans the panel header's width right below it, as the task list does
    const header = panel && popover && open ? btn?.closest<HTMLElement>(HEADER_HOST) : null;
    const geo = header ? panelPopoverGeometry(header.getBoundingClientRect()) : null;
    return (
        <>
            <Tooltip title={planTooltip(plan, now)}>
                <ButtonBase
                    ref={setBtn}
                    aria-label={planAriaLabel((plans ?? []).length, plan, now)}
                    aria-haspopup="dialog"
                    aria-expanded={open}
                    data-testid="agent-plan-button"
                    data-plan-state={plan.state}
                    data-plan-mark={mark}
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
                        color: planButtonColor(mark),
                        bgcolor: open ? 'rgba(15,84,50,0.08)' : 'transparent',
                        '&:hover': { bgcolor: 'rgba(15,84,50,0.08)' },
                        '&.Mui-focusVisible': { outline: `2px solid ${agentColors.green}`, outlineOffset: 1 },
                    }}
                >
                    <Badge
                        variant="dot"
                        invisible={mark !== 'approval' && mark !== 'running' && mark !== 'failed'}
                        overlap="circular"
                        sx={{
                            '& .MuiBadge-dot': {
                                bgcolor: planButtonColor(mark),
                                border: '1.5px solid #fff',
                                boxSizing: 'border-box',
                                width: 8,
                                height: 8,
                                minWidth: 8,
                                ...(mark === 'approval' || mark === 'running'
                                    ? {
                                          animation:
                                              mark === 'approval'
                                                  ? 'agPulseAmber 1.6s ease-out infinite'
                                                  : 'agPulse 1.6s ease-out infinite',
                                          '@keyframes agPulse': {
                                              '0%': { boxShadow: '0 0 0 0 rgba(15,84,50,.55)' },
                                              '70%': { boxShadow: '0 0 0 6px rgba(15,84,50,0)' },
                                              '100%': { boxShadow: '0 0 0 0 rgba(15,84,50,0)' },
                                          },
                                          '@keyframes agPulseAmber': {
                                              '0%': { boxShadow: '0 0 0 0 rgba(237,108,2,.55)' },
                                              '70%': { boxShadow: '0 0 0 6px rgba(237,108,2,0)' },
                                              '100%': { boxShadow: '0 0 0 0 rgba(237,108,2,0)' },
                                          },
                                          '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
                                      }
                                    : {}),
                            },
                        }}
                    >
                        {mark === 'done' ? (
                            <TaskAltIcon aria-hidden sx={{ fontSize: 18 }} />
                        ) : (
                            <FactCheckOutlinedIcon aria-hidden sx={{ fontSize: 18 }} />
                        )}
                    </Badge>
                    <span>{planButtonLabel(plan, now, compact)}</span>
                </ButtonBase>
            </Tooltip>
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
                    <PlanList
                        plans={plans ?? []}
                        onClose={close}
                        onOpenPlan={jumpTo}
                        maxListHeight="min(440px, calc(100vh - 150px))"
                    />
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
                            ...(panel ? { left: 'auto', right: 0, width } : { width: '100%' }),
                            // above the fixed platform footer (30 px)
                            bottom: '30px',
                            maxHeight: 'calc(70% - 30px)',
                            borderTopLeftRadius: 12,
                            borderTopRightRadius: 12,
                            bgcolor: '#fff',
                        },
                    }}
                >
                    <PlanList plans={plans ?? []} sheet onClose={close} onOpenPlan={jumpTo} maxListHeight="calc(70vh - 110px)" />
                </SwipeableDrawer>
            )}
        </>
    );
}
