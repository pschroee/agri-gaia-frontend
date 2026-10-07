// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// How an answer came about, behind one line (issue #54, decision 3): "Thought 9 s · 3 tool calls ›", opened the
// model's thinking blocks (each collapsible on its own) and the tool steps in the order they happened. While the
// answer is being worked on: "Thinking …" with a progress bar and the current step, as in the design.

import { useState } from 'react';

import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Collapse from '@mui/material/Collapse';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

import { currentStep, processSummary } from '../answer';
import type { ProcessPart } from '../answer';
import StepList from './StepList';
import type { StepControls } from './StepList';
import ThinkingBlock from './ThinkingBlock';
import type { Thinking } from './Conversation';
import { agentColors } from './tokens';

/** The design's indeterminate bar under "Thinking …": 4 px high, at most 240 px wide. */
export function WorkingBar() {
    return (
        <Box
            aria-hidden
            sx={{
                position: 'relative',
                height: 4,
                borderRadius: 2,
                overflow: 'hidden',
                bgcolor: '#c5dccf',
                maxWidth: 240,
                '@keyframes agentWorkingBar': {
                    '0%': { left: '-35%', right: '100%' },
                    '60%': { left: '100%', right: '-90%' },
                    '100%': { left: '100%', right: '-90%' },
                },
                '& > span': {
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    bgcolor: agentColors.green,
                    animation: 'agentWorkingBar 1.8s cubic-bezier(0.65, 0.815, 0.735, 0.395) infinite',
                },
                '@media (prefers-reduced-motion: reduce)': { '& > span': { animation: 'none', left: 0, right: '60%' } },
            }}
        >
            <span />
        </Box>
    );
}

/** "Thinking …" (or another label) with the bar; a running step below it with its controls. */
export function WorkingIndicator({
    label = 'Thinking …',
    step,
    controls,
}: {
    label?: string;
    step?: ProcessPart & { type: 'steps' };
    controls?: StepControls;
}) {
    return (
        <Box
            data-testid="agent-working"
            role="status"
            sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, minWidth: 0 }}
        >
            <Box component="span" sx={{ fontSize: 13, color: 'text.secondary' }}>
                {label}
            </Box>
            <WorkingBar />
            {step && <StepList steps={step.steps} controls={controls} plain />}
        </Box>
    );
}

/** The collapsed line of an answer and, opened, its thinking and steps in order. */
export function ProcessLine({
    process,
    thinking,
    controls,
    open,
    onOpenChange,
}: {
    process: ProcessPart[];
    thinking: Thinking;
    controls?: StepControls;
    /** Kept by the caller per answer (so it survives re-renders of the transcript); collapsed by default. */
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}) {
    const [ownOpen, setOwnOpen] = useState(false);
    const isOpen = open ?? ownOpen;
    const setOpen = onOpenChange ?? setOwnOpen;
    const summary = processSummary(process);
    if (!summary) return null;
    return (
        <Box data-testid="agent-process" data-open={isOpen} sx={{ color: 'text.secondary', minWidth: 0 }}>
            <ButtonBase
                onClick={() => setOpen(!isOpen)}
                aria-expanded={isOpen}
                data-testid="agent-process-toggle"
                sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.25,
                    py: 0.25,
                    pr: 0.5,
                    borderRadius: 0.5,
                    fontSize: 13,
                    lineHeight: 1.4,
                    fontVariantNumeric: 'tabular-nums',
                    color: 'inherit',
                    textAlign: 'left',
                    '&:hover': { color: 'text.primary' },
                }}
            >
                <span>{summary}</span>
                <ChevronRightIcon
                    sx={{
                        fontSize: 18,
                        transition: 'transform 150ms',
                        transform: isOpen ? 'rotate(90deg)' : 'none',
                    }}
                />
            </ButtonBase>
            <Collapse in={isOpen} unmountOnExit>
                <Box
                    data-testid="agent-process-details"
                    sx={{
                        mt: 0.5,
                        ml: '2px',
                        pl: 1.5,
                        borderLeft: 2,
                        borderColor: 'divider',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 0.75,
                        color: 'text.primary',
                        minWidth: 0,
                    }}
                >
                    {process.map((p, i) =>
                        p.type === 'thinking' ? (
                            <ThinkingBlock
                                key={p.id}
                                part={p}
                                open={thinking.open[p.id]}
                                onOpenChange={thinking.onOpenChange}
                            />
                        ) : (
                            <StepList key={`steps-${i}`} steps={p.steps} controls={controls} plain />
                        ),
                    )}
                </Box>
            </Collapse>
        </Box>
    );
}

/** The step to show under "Thinking …" as a one-row step list, if any. */
export function currentStepPart(process: ProcessPart[]): (ProcessPart & { type: 'steps' }) | undefined {
    const s = currentStep(process);
    return s ? { type: 'steps', steps: [s] } : undefined;
}
