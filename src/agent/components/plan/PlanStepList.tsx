// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The steps of a plan as one list of rows (issue #221), shared by the plan dialog, the panel view and the plan card:
// the step the plan is on is marked and open, the others are one line each; a step the user opened or closed by hand
// keeps that state when the plan moves on. It needs no chat context beyond the chat id.

import { ReactNode, useEffect, useMemo, useState } from 'react';

import Box from '@mui/material/Box';

import { jobOfStep } from '../../jobs';
import type { WatchJob } from '../../jobs';
import { pendingStepOf } from '../../plan';
import type { Plan, PlanStep } from '../../plan';
import { currentIdx } from '../../planDetail';
import type { AssessCheck } from '../../types';
import PlanStepRow from './PlanStepRow';

/** How often the runtimes move while a step runs. */
const TICK_MS = 5000;

export default function PlanStepList({
    plan,
    jobs,
    checks,
    pending,
    variant,
    chatId,
    working,
    renderStepExtra,
}: {
    plan: Plan;
    jobs: WatchJob[];
    checks?: readonly AssessCheck[];
    pending: ReadonlySet<string>;
    variant: 'detail' | 'compact';
    chatId: string;
    working?: boolean;
    /** What the caller adds to the opened step (the card's approval and stop button). */
    renderStepExtra?: (step: PlanStep) => ReactNode;
}) {
    const [manual, setManual] = useState<Record<number, boolean>>({});
    const [now, setNow] = useState(() => Date.now());
    const live = plan.steps.some((s) => s.state === 'running' || s.state === 'waiting');
    useEffect(() => {
        setNow(Date.now());
        if (!live) return undefined;
        const t = setInterval(() => setNow(Date.now()), TICK_MS);
        return () => clearInterval(t);
    }, [live, plan]);

    const current = currentIdx(plan);
    // a step that waits for the user's approval is opened too: its decision is in the card
    const asking = pendingStepOf(plan, pending)?.idx;
    const ordered = useMemo(() => [...plan.steps].sort((a, b) => a.idx - b.idx), [plan.steps]);
    const isOpen = (idx: number) => manual[idx] ?? (idx === current || idx === asking);
    return (
        <Box component="div" data-testid="agent-plan-steps" data-variant={variant} sx={{ minWidth: 0 }}>
            {ordered.map((step) => (
                <PlanStepRow
                    key={step.idx}
                    plan={plan}
                    step={step}
                    variant={variant}
                    open={isOpen(step.idx)}
                    onToggle={() => setManual((m) => ({ ...m, [step.idx]: !isOpen(step.idx) }))}
                    current={step.idx === current}
                    job={jobOfStep(jobs, step)}
                    checks={checks}
                    pending={pending}
                    now={now}
                    working={working}
                    chatId={chatId}
                    extra={renderStepExtra?.(step)}
                />
            ))}
        </Box>
    );
}
