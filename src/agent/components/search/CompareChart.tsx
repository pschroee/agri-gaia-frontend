// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The comparison of the trials of a search (gateway issue #168, design c1/c2): the target value of every trial as a
// bar, the best one dark, a running one dashed, "best so far" as a step line, the target as a reference line and a
// failed trial as a cross. The direction comes from the objective (G7). The values stand again as words below the
// chart, which is also its accessible name.

import { Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from 'recharts';

import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';

import type { Search, Trial } from '../../experiments';
import { compareCaption, compareData } from '../../experimentsTab';
import { bestTrialOf, metricWords, scoreText } from '../../searchView';
import { agentColors } from '../tokens';

const BAR = '#b0c9bb';
const BAR_RUNNING = '#e0ebe5';

export default function CompareChart({ search, trials, height = 220 }: { search: Search; trials: Trial[]; height?: number }) {
    const o = search.objective;
    const best = bestTrialOf(search, trials);
    const data = compareData(search, trials, best).map((p) => ({ ...p, cross: p.failed ? 0 : undefined }));
    const caption = compareCaption(search, trials, best);
    const target = search.budget?.target;
    const domain: [number, number | 'auto'] = o?.metric === 'val_loss' ? [0, 'auto'] : [0, 1];
    return (
        <Paper variant="outlined" sx={{ p: 2, minWidth: 0 }} data-testid="search-compare">
            <Typography variant="subtitle2" sx={{ fontWeight: 500 }}>
                {metricWords(o).label} per trial
            </Typography>
            <Box component="figure" sx={{ m: 0 }}>
                <Box role="img" aria-label={caption} sx={{ height }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                            <YAxis domain={domain} tick={{ fontSize: 11 }} width={40} />
                            <Tooltip formatter={(v: unknown) => (typeof v === 'number' ? scoreText(v, o) : String(v))} />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                            <Bar dataKey="score" name="Trial" isAnimationActive={false} maxBarSize={72}>
                                {data.map((p) => (
                                    <Cell
                                        key={p.idx}
                                        fill={p.best ? agentColors.green : p.running ? BAR_RUNNING : BAR}
                                        stroke={p.running ? agentColors.green : undefined}
                                        strokeDasharray={p.running ? '4 3' : undefined}
                                    />
                                ))}
                            </Bar>
                            <Line dataKey="bestSoFar" name="Best so far" type="stepAfter" stroke={agentColors.amber} dot={false} strokeWidth={2} isAnimationActive={false} />
                            {typeof target === 'number' && (
                                <ReferenceLine y={target} stroke={agentColors.muted} strokeDasharray="5 4" label={{ value: `Target ${target}`, position: 'insideTopRight', fontSize: 11 }} />
                            )}
                            <Scatter dataKey="cross" name="Failed" shape="cross" fill={agentColors.red} stroke={agentColors.red} isAnimationActive={false} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </Box>
                <Typography component="figcaption" variant="caption" color="text.secondary" data-testid="search-compare-caption">
                    {caption}
                </Typography>
            </Box>
        </Paper>
    );
}
