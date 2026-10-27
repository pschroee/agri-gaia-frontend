// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The live part of a running plan step (issue #221): the bar, the platform's line, the runtime, the epoch of a
// training with its figures, and the end of the job's log. It needs no chat context, so other views can use it alone.

import Box from '@mui/material/Box';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';

import type { WatchJob } from '../../jobs';
import { stepMessage, stepPhase, stepRuntime, stepTimeLine } from '../../plan';
import type { Plan, PlanStep } from '../../plan';
import { epochLine, metricPairs, withJob } from '../../planDetail';
import { logTail } from '../../planText';
import { agentColors, MONO } from '../tokens';
import { PRE_SX } from '../PlanCard';

/** The note for a build: the platform delivers a percentage and a line for it, no log. */
export const NO_BUILD_LOG = 'The platform reports no build log.';

const BUILD_KINDS = ['image', 'image_build'];

export default function StepLive({
    plan,
    step,
    job,
    now,
    working,
    compact,
}: {
    plan: Plan;
    step: PlanStep;
    job?: WatchJob;
    now: number;
    working?: boolean;
    compact?: boolean;
}) {
    const live = withJob(step, job);
    const phase = stepPhase(plan, live, working);
    const paused = phase === 'paused';
    const percent = typeof live.progress === 'number' ? live.progress : undefined;
    const message = stepMessage(live, job?.kind);
    const timeLine = stepTimeLine(live, now);
    const runtime = stepRuntime(live, now);
    const detail =
        live.state === 'waiting' && !live.started_at ? message : [message, timeLine].filter((s) => s !== '').join(' · ');
    const epoch = live.last_epoch;
    const epochHead = epoch ? epochLine({ ...epoch, values: {} }) : '';
    const metrics = metricPairs(epoch, 4);
    const log = logTail(live.log_tail);
    const build = !log && !!job && BUILD_KINDS.includes(job.kind);
    if (percent === undefined && !detail && !paused && !epochHead && !log && !build) return null;
    return (
        <Box data-testid="agent-plan-progress" sx={{ minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <LinearProgress
                    variant={percent === undefined ? 'indeterminate' : 'determinate'}
                    value={percent}
                    color={paused ? 'warning' : 'primary'}
                    sx={{ flex: 1, height: 4, borderRadius: 2 }}
                />
                {percent !== undefined && (
                    <Typography sx={{ fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                        {`${Math.round(percent)} %`}
                    </Typography>
                )}
            </Box>
            {detail && (
                <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.25, overflowWrap: 'anywhere' }}>
                    {detail}
                </Typography>
            )}
            {paused && (
                <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.25 }}>
                    {runtime
                        ? `${runtime} · step ${step.idx + 1} starts after you resume`
                        : `Step ${step.idx + 1} starts after you resume`}
                </Typography>
            )}
            {epochHead && (
                <Box data-testid="agent-plan-epoch" sx={{ mt: 0.75 }}>
                    <Typography sx={{ fontSize: 12, fontWeight: 500 }}>{epochHead}</Typography>
                    {metrics.length > 0 && (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 2, rowGap: 0.25, mt: 0.25 }}>
                            {metrics.map((m) => (
                                <Typography key={m.key} sx={{ fontSize: 12, fontFamily: MONO }}>
                                    {`${m.key} ${m.value}`}
                                </Typography>
                            ))}
                        </Box>
                    )}
                </Box>
            )}
            {log && (
                <Box sx={{ mt: 0.75 }}>
                    <Typography sx={{ fontSize: 11.5, fontWeight: 500, color: 'text.secondary' }}>Log</Typography>
                    <Box
                        component="pre"
                        data-testid="agent-plan-log"
                        sx={{ ...PRE_SX, maxHeight: compact ? 150 : 200, bgcolor: agentColors.panelBg }}
                    >
                        {log}
                    </Box>
                </Box>
            )}
            {build && (
                <Typography data-testid="agent-plan-no-log" sx={{ fontSize: 12, color: 'text.secondary', mt: 0.5 }}>
                    {NO_BUILD_LOG}
                </Typography>
            )}
        </Box>
    );
}
