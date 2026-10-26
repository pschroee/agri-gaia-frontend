// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The platform calls of one plan step (issue #221): loaded from GET /api/activity?plan=&step= when the step is opened
// and again when its state changes. Reading only; the whole activity opens from the link at the foot.

import { useEffect, useState } from 'react';

import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Skeleton from '@mui/material/Skeleton';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';

import { activityLinkOf } from '../../activity';
import { agentApi } from '../../api';
import { formatClock, formatMs, OUTCOME_LABEL, outcomeOf } from '../../format';
import { activityQuery } from '../../planDetail';
import type { ActivityCall } from '../../types';
import { MONO } from '../tokens';

export const ACTIVITY_EMPTY = 'No platform calls recorded for this step.';
export const ACTIVITY_ERROR = 'Activity could not be loaded.';

const cellSx = { py: 0.5, px: 1, fontSize: 12, verticalAlign: 'top' } as const;

type Load = { state: 'loading' } | { state: 'error' } | { state: 'ready'; calls: ActivityCall[] };

export default function StepActivity({
    chatId,
    planId,
    idx,
    reloadKey,
}: {
    chatId: string;
    planId: string;
    idx: number;
    /** Changes whenever the step changes (state, attempts, end): the calls are read again. */
    reloadKey: string;
}) {
    const [load, setLoad] = useState<Load>({ state: 'loading' });
    useEffect(() => {
        let alive = true;
        agentApi
            .activity(activityQuery(planId, idx))
            .then((page) => {
                if (!alive) return;
                const calls = (page.calls ?? []).filter((c) => (c.kind ?? 'platform') === 'platform');
                setLoad({ state: 'ready', calls: [...calls].sort((a, b) => b.id - a.id) });
            })
            .catch(() => {
                if (alive) setLoad((prev) => (prev.state === 'ready' ? prev : { state: 'error' }));
            });
        return () => {
            alive = false;
        };
    }, [planId, idx, reloadKey]);

    return (
        <Box data-testid="agent-plan-step-activity" sx={{ minWidth: 0 }}>
            {load.state === 'loading' && (
                <Box data-testid="agent-plan-step-activity-loading">
                    <Skeleton height={22} />
                    <Skeleton height={22} />
                </Box>
            )}
            {load.state === 'error' && (
                <Typography sx={{ fontSize: 12, color: 'error.main' }}>{ACTIVITY_ERROR}</Typography>
            )}
            {load.state === 'ready' && load.calls.length === 0 && (
                <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{ACTIVITY_EMPTY}</Typography>
            )}
            {load.state === 'ready' && load.calls.length > 0 && (
                <>
                    <Table size="small" sx={{ tableLayout: 'fixed' }}>
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ ...cellSx, width: 76, color: 'text.secondary', fontWeight: 500 }}>Time</TableCell>
                                <TableCell sx={{ ...cellSx, color: 'text.secondary', fontWeight: 500 }}>Call</TableCell>
                                <TableCell sx={{ ...cellSx, width: 96, color: 'text.secondary', fontWeight: 500 }}>Outcome</TableCell>
                                <TableCell sx={{ ...cellSx, width: 72, color: 'text.secondary', fontWeight: 500 }}>Duration</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {load.calls.map((c) => (
                                <TableRow key={c.id} data-testid="agent-plan-step-activity-row">
                                    <TableCell sx={cellSx}>{formatClock(c.created_at, true)}</TableCell>
                                    <TableCell sx={{ ...cellSx, fontFamily: MONO, overflowWrap: 'anywhere' }}>{c.detail}</TableCell>
                                    <TableCell sx={cellSx}>{OUTCOME_LABEL[c.outcome ?? outcomeOf(c.result)]}</TableCell>
                                    <TableCell sx={cellSx}>{formatMs(c.duration_ms) ?? '–'}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    <Link
                        href={activityLinkOf(chatId, load.calls[load.calls.length - 1]?.tool_call_id)}
                        underline="always"
                        data-testid="agent-plan-step-activity-link"
                        sx={{ fontSize: 12, display: 'inline-block', mt: 0.5 }}
                    >
                        Open in Activity
                    </Link>
                </>
            )}
        </Box>
    );
}
