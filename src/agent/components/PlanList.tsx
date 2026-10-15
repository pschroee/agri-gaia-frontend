// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The plans of a chat, listed (issue #138, L8): one line per plan with its state and number of steps. Read-only:
// a click jumps to the plan's card in the transcript — deciding and stopping stays in the card (issue #103, D4.2).
// Rendered inside a popover or a bottom sheet (`sheet`: handle and close button), after the pattern of TaskList.

import { useEffect, useId, useRef } from 'react';

import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import BlockIcon from '@mui/icons-material/Block';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloseIcon from '@mui/icons-material/Close';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import ScheduleIcon from '@mui/icons-material/Schedule';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';

import type { Plan } from '../plan';
import { planEntrySub, planEntryTitle, planMark } from '../planButton';
import EllipsisText from './EllipsisText';
import { agentColors } from './tokens';

/** The state of one plan as an icon; the label says the state in words, the icon carries it for the eye. */
function StateIcon({ plan, now }: { plan: Plan; now: number }) {
    switch (planMark(plan, now)) {
        case 'approval':
            return <HourglassEmptyIcon aria-label="Waiting for approval" sx={{ fontSize: 20, color: agentColors.amber }} />;
        case 'running':
            return <CircularProgress size={16} aria-label="Running" sx={{ color: agentColors.green }} />;
        case 'done':
            return <CheckCircleIcon aria-label="Completed" sx={{ fontSize: 20, color: agentColors.ok }} />;
        case 'failed':
            return <ErrorOutlineIcon aria-label="Failed" sx={{ fontSize: 20, color: agentColors.red }} />;
        // rejected, replaced, expired (also an approved plan whose time is over)
        case 'plain':
        default:
            if (plan.state === 'superseded') return <SwapHorizIcon aria-hidden sx={{ fontSize: 20, color: agentColors.muted }} />;
            if (plan.state === 'rejected') return <BlockIcon aria-hidden sx={{ fontSize: 20, color: agentColors.muted }} />;
            return <ScheduleIcon aria-hidden sx={{ fontSize: 20, color: agentColors.muted }} />;
    }
}

function PlanRow({ plan, now, onOpen }: { plan: Plan; now: number; onOpen: () => void }) {
    return (
        <ButtonBase
            role="listitem"
            data-testid="agent-plan-row"
            data-plan-state={plan.state}
            onClick={onOpen}
            sx={{
                display: 'grid',
                gridTemplateColumns: '20px minmax(0, 1fr)',
                columnGap: 1.5,
                alignItems: 'start',
                justifyContent: 'flex-start',
                width: '100%',
                textAlign: 'left',
                py: '9px',
                pl: 2,
                pr: 2,
                borderRadius: 0,
                '&:hover': { bgcolor: 'rgba(0,0,0,0.04)' },
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 20 }}>
                <StateIcon plan={plan} now={now} />
            </Box>
            <Box sx={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1px' }}>
                <EllipsisText text={planEntryTitle(plan)} testId="agent-plan-row-title" sx={{ fontSize: 14, lineHeight: '20px' }} />
                <EllipsisText
                    text={planEntrySub(plan, now)}
                    sx={{ fontSize: 13, lineHeight: '18px', color: agentColors.muted }}
                />
            </Box>
        </ButtonBase>
    );
}

/**
 * The plans of a chat, read-only (issue #138): header with the number, one line per plan, a click opens the card's
 * place in the transcript and closes the list. `sheet` adds the grab handle and the close button of the bottom sheet.
 */
export default function PlanList({
    plans,
    sheet = false,
    maxListHeight = 440,
    onClose,
    onOpenPlan,
}: {
    plans: Plan[];
    sheet?: boolean;
    maxListHeight?: number | string;
    onClose: () => void;
    onOpenPlan: (planId: string) => void;
}) {
    const uid = useId();
    const rootRef = useRef<HTMLDivElement>(null);
    const now = Date.now();
    const headId = `${uid}-head`;
    const dragStart = useRef<number>();

    // focus moves into the list when it opens; MUI returns it to the button when it closes
    useEffect(() => {
        rootRef.current?.focus({ preventScroll: true });
    }, []);

    return (
        <Box
            ref={rootRef}
            role="dialog"
            aria-labelledby={headId}
            tabIndex={-1}
            data-testid="agent-plan-list"
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
                        Plans
                    </Typography>
                    <Typography component="span" sx={{ fontSize: 14, color: agentColors.muted, whiteSpace: 'nowrap' }}>
                        {plans.length === 1 ? '1 plan' : `${plans.length} plans`}
                    </Typography>
                </Box>
                {sheet && (
                    <IconButton size="small" aria-label="Close plans" onClick={onClose} sx={{ color: agentColors.muted }}>
                        <CloseIcon sx={{ fontSize: 22 }} />
                    </IconButton>
                )}
            </Box>
            <Box
                role="list"
                aria-label="Plans of this chat"
                sx={{ overflowY: 'auto', overflowX: 'hidden', maxHeight: maxListHeight, pb: 0.75, overscrollBehavior: 'contain' }}
            >
                {plans.map((p) => (
                    <PlanRow key={p.id} plan={p} now={now} onOpen={() => onOpenPlan(p.id)} />
                ))}
            </Box>
        </Box>
    );
}
