// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The plan in the 400 px agent panel (issue #221): a surface over the chat inside the panel, so that the platform page
// next to it stays visible. The chat stays mounted underneath. Reading only, like the dialog.

import { useEffect, useRef } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ChatOutlinedIcon from '@mui/icons-material/ChatOutlined';

import { stepCount } from '../../plan';
import type { Plan } from '../../plan';
import { planCardInDom, scrollToPlanCard, useShownPlanCards } from '../../planRegistry';
import PlanDetail, { usePlanDetailData } from './PlanDetail';

const NO_PENDING: ReadonlySet<string> = new Set();

export default function PlanPanelView({
    chatId,
    plans,
    planId,
    onBack,
    pending = NO_PENDING,
}: {
    chatId: string;
    plans: Plan[];
    planId: string;
    onBack: () => void;
    pending?: ReadonlySet<string>;
}) {
    const plan = plans.find((p) => p.id === planId);
    const { jobs, checks } = usePlanDetailData(chatId, true);
    const shown = useShownPlanCards();
    const root = useRef<HTMLDivElement>(null);
    useEffect(() => {
        root.current?.focus();
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onBack();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onBack]);
    if (!plan) return null;
    const canShow = shown.has(plan.id) || planCardInDom(plan.id);
    return (
        <Box
            ref={root}
            tabIndex={-1}
            role="region"
            aria-label="Plan"
            data-testid="agent-plan-panel"
            sx={{ position: 'absolute', inset: 0, zIndex: 2, bgcolor: '#fff', display: 'flex', flexDirection: 'column', outline: 'none' }}
        >
            <Box sx={{ height: 44, flex: 'none', px: 1, display: 'flex', alignItems: 'center', gap: 0.5, borderBottom: 1, borderColor: 'divider' }}>
                <IconButton size="small" aria-label="Back to chat" onClick={onBack}>
                    <ArrowBackIcon fontSize="small" />
                </IconButton>
                <Typography sx={{ fontSize: 14, fontWeight: 500, flex: 1, minWidth: 0 }}>
                    Plan · {stepCount(plan.steps.length)}
                </Typography>
                {canShow && (
                    <Button
                        size="small"
                        startIcon={<ChatOutlinedIcon />}
                        data-testid="agent-plan-panel-show"
                        onClick={() => {
                            onBack();
                            // the chat is uncovered in the next frame; the card is in the document already
                            setTimeout(() => scrollToPlanCard(plan.id), 0);
                        }}
                    >
                        Show in chat
                    </Button>
                )}
            </Box>
            <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                <PlanDetail plan={plan} jobs={jobs} checks={checks} pending={pending} variant="compact" chatId={chatId} />
            </Box>
        </Box>
    );
}
