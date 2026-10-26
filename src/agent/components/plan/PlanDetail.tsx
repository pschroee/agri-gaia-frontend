// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The body of the plan dialog and of the panel view (issue #221): the head band (bar, count, times, budget, banner)
// and the list of steps. `usePlanDetailData` loads what the rows need: the observed jobs and the result checks.

import Box from '@mui/material/Box';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';

import { cardsTrigger } from '../../annotation';
import { useChecks } from '../../assess';
import { useJobs } from '../../jobs';
import type { WatchJob } from '../../jobs';
import { budgetLine, doneSteps, isAutonomous } from '../../plan';
import type { Plan } from '../../plan';
import { planHeadLine } from '../../planDetail';
import type { AssessCheck } from '../../types';
import { PlanBanner } from '../PlanCard';
import PlanStepList from './PlanStepList';

/** The jobs and checks of a chat, read only while `active` (an open dialog or panel view). */
export function usePlanDetailData(chatId: string | undefined, active: boolean): { jobs: WatchJob[]; checks: AssessCheck[] } {
    const id = active ? chatId : undefined;
    const jobs = useJobs(id);
    const checks = useChecks(id, [cardsTrigger(jobs)]);
    return { jobs, checks };
}

/** The bar, the count line, the budget line and the banner of the plan's state. */
export function PlanHeadBand({ plan, px = 3, bordered }: { plan: Plan; px?: number; bordered?: boolean }) {
    const now = Date.now();
    const total = plan.steps.length;
    const value = total > 0 ? (doneSteps(plan) / total) * 100 : 0;
    const budget = isAutonomous(plan) ? budgetLine(plan, now) : '';
    return (
        <Box
            data-testid="agent-plan-head-band"
            sx={{ px, pt: 0.5, pb: 1.5, ...(bordered ? { borderBottom: 1, borderColor: 'divider' } : {}) }}
        >
            <LinearProgress
                variant="determinate"
                value={value}
                color={plan.state === 'failed' ? 'error' : plan.state === 'paused' ? 'warning' : 'primary'}
                aria-label="Steps done"
                sx={{ height: 6, borderRadius: 3 }}
            />
            <Typography data-testid="agent-plan-head-line" sx={{ fontSize: 12.5, color: 'text.secondary', mt: 0.75 }}>
                {planHeadLine(plan, now)}
            </Typography>
            {budget && (
                <Typography data-testid="agent-plan-head-budget" sx={{ fontSize: 12.5, color: 'text.secondary' }}>
                    {budget}
                </Typography>
            )}
            <PlanBanner plan={plan} />
        </Box>
    );
}

export default function PlanDetail({
    plan,
    jobs,
    checks,
    pending,
    variant,
    chatId,
}: {
    plan: Plan;
    jobs: WatchJob[];
    checks: readonly AssessCheck[];
    pending: ReadonlySet<string>;
    variant: 'detail' | 'compact';
    chatId: string;
}) {
    const px = variant === 'compact' ? 2 : 3;
    return (
        <Box data-testid="agent-plan-detail">
            <PlanHeadBand plan={plan} px={px} />
            <Box sx={{ px, pb: 2 }}>
                <PlanStepList plan={plan} jobs={jobs} checks={checks} pending={pending} variant={variant} chatId={chatId} />
            </Box>
        </Box>
    );
}
