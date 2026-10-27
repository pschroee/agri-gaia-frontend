// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The history of a plan step (issue #245): a dense list of what the platform job did (check and time), does now
// (spinner and how long) and has still to do (empty circle, grey). Shown in the opened step, under the live part.

import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import Typography from '@mui/material/Typography';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';

import type { WatchJob } from '../../jobs';
import { isBuildStep } from '../../plan';
import type { PlanStep } from '../../plan';
import { historyRows } from '../../stepHistory';
import type { HistoryState } from '../../stepHistory';
import { agentColors } from '../tokens';

const MARK: Record<HistoryState, JSX.Element> = {
    done: <CheckCircleIcon sx={{ fontSize: 12, color: agentColors.ok }} aria-hidden />,
    running: <CircularProgress size={12} thickness={6} aria-hidden />,
    pending: <RadioButtonUncheckedIcon sx={{ fontSize: 12, color: 'text.disabled' }} aria-hidden />,
};

const LABEL: Record<HistoryState, string> = { done: 'Done', running: 'Running', pending: 'Still to come' };

export default function StepHistory({ job, step, now }: { job?: WatchJob; step?: PlanStep; now: number }) {
    const rows = historyRows(job, now, { trainingBuild: !!step && isBuildStep(step) });
    if (rows.length === 0) return null;
    return (
        <Box data-testid="agent-plan-history" sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 11.5, fontWeight: 500, color: 'text.secondary' }}>History</Typography>
            <List dense disablePadding aria-label="Step history">
                {rows.map((r, i) => (
                    <ListItem
                        key={`${i}:${r.text}`}
                        disableGutters
                        data-testid="agent-plan-history-row"
                        data-state={r.state}
                        sx={{ py: 0.125, gap: 1, alignItems: 'center', minWidth: 0 }}
                    >
                        <Box component="span" sx={{ display: 'inline-flex', width: 14, justifyContent: 'center', flex: 'none' }} title={LABEL[r.state]}>
                            {MARK[r.state]}
                        </Box>
                        <Typography
                            component="span"
                            sx={{
                                fontSize: 12,
                                flex: 1,
                                minWidth: 0,
                                overflowWrap: 'anywhere',
                                color: r.state === 'pending' ? 'text.disabled' : 'text.primary',
                                fontWeight: r.state === 'running' ? 500 : 400,
                            }}
                        >
                            {r.text}
                        </Typography>
                        {r.when && (
                            <Typography
                                component="span"
                                data-testid="agent-plan-history-when"
                                sx={{ fontSize: 12, color: 'text.secondary', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
                            >
                                {r.when}
                            </Typography>
                        )}
                    </ListItem>
                ))}
            </List>
        </Box>
    );
}
