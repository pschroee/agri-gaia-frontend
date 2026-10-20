// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The curves of one trial (gateway issue #168, design c1): loss and accuracy per epoch (training dashed, validation
// solid, the x axis spans all planned epochs so a running trial fills from the left) and the GPU (utilisation as an
// area, memory on a second axis). Each chart is a figure with its numbers as text below it. A chart without points
// is the empty state of W2-c (`TrialChartEmpty`).

import { ReactNode } from 'react';

import { Area, CartesianGrid, ComposedChart, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

import type { EpochRow, GpuPoint, Trial } from '../../experiments';
import { curveCaption, curveData, gpuCaption, gpuData } from '../../experimentsTab';
import type { CurveKind } from '../../experimentsTab';
import { isOpen } from '../../searchView';
import { agentColors } from '../tokens';
import TrialChartEmpty from './TrialChartEmpty';

const TITLE: Record<CurveKind, string> = { loss: 'Loss per epoch', acc: 'Accuracy per epoch' };

function Figure({ title, caption, children, testId }: { title: string; caption: string; children: ReactNode; testId: string }) {
    return (
        <Box component="figure" sx={{ m: 0, minWidth: 0 }} data-testid={testId}>
            <Typography variant="subtitle2" sx={{ fontWeight: 500 }}>
                {title}
            </Typography>
            <Box role="img" aria-label={`${title}. ${caption}`} sx={{ height: 170 }}>
                {children}
            </Box>
            <Typography component="figcaption" variant="caption" color="text.secondary">
                {caption}
            </Typography>
        </Box>
    );
}

/** One curve chart; null when the rows hold no value of this kind (a notebook that writes no accuracy). */
export function CurveChart({ kind, rows, epochs }: { kind: CurveKind; rows: EpochRow[]; epochs?: number | null }) {
    const data = curveData(rows, kind);
    if (data.length === 0) return null;
    const max = Math.max(epochs ?? 0, data[data.length - 1].epoch, 2);
    const domain: [number, number | 'auto'] = kind === 'acc' ? [0, 1] : [0, 'auto'];
    return (
        <Figure title={TITLE[kind]} caption={curveCaption(data, kind)} testId={`trial-chart-${kind}`}>
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="epoch" type="number" domain={[1, max]} allowDecimals={false} tick={{ fontSize: 11 }} />
                    <YAxis domain={domain} tick={{ fontSize: 11 }} width={36} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line dataKey="train" name="Training" stroke={agentColors.green} strokeDasharray="4 3" dot={false} strokeWidth={1.5} isAnimationActive={false} connectNulls />
                    <Line dataKey="val" name="Validation" stroke={agentColors.green} dot={false} strokeWidth={2} isAnimationActive={false} connectNulls />
                </LineChart>
            </ResponsiveContainer>
        </Figure>
    );
}

export function GpuChart({ points, trial }: { points: GpuPoint[]; trial: Trial }) {
    const { rows, totalGb } = gpuData(points);
    const caption = gpuCaption(rows, totalGb, isOpen(trial));
    return (
        <Figure title="GPU" caption={caption} testId="trial-chart-gpu">
            <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={rows} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="min" type="number" domain={[0, 'dataMax']} tick={{ fontSize: 11 }} unit=" min" />
                    <YAxis yAxisId="u" domain={[0, 100]} tick={{ fontSize: 11 }} width={36} unit=" %" />
                    <YAxis yAxisId="m" orientation="right" domain={[0, totalGb || 'auto']} tick={{ fontSize: 11, fill: agentColors.amberText }} width={32} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area yAxisId="u" dataKey="util" name="Utilisation %" stroke={agentColors.green} fill={agentColors.greenLine} dot={false} isAnimationActive={false} />
                    <Line yAxisId="m" dataKey="memGb" name={`Memory GB (of ${totalGb})`} stroke={agentColors.amber} dot={false} strokeWidth={2} isAnimationActive={false} />
                </ComposedChart>
            </ResponsiveContainer>
        </Figure>
    );
}

type Props = {
    trial: Trial;
    epochs: EpochRow[];
    gpu: GpuPoint[];
    loading: boolean;
    error?: string;
};

/** Loss, accuracy and GPU of a trial, each chart or its empty state. */
export default function TrialCharts({ trial, epochs, gpu, loading, error }: Props) {
    const hasLoss = curveData(epochs, 'loss').length > 0;
    const hasAcc = curveData(epochs, 'acc').length > 0;
    const noFigures = epochs.length === 0 || (!hasLoss && !hasAcc);
    return (
        <Box sx={{ display: 'grid', gap: 2, minWidth: 0 }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 2 }}>
                {noFigures ? (
                    <Box sx={{ gridColumn: '1 / -1' }}>
                        <TrialChartEmpty trial={trial} kind="figures" loading={loading} error={error} />
                    </Box>
                ) : (
                    <>
                        <CurveChart kind="loss" rows={epochs} epochs={trial.epochs} />
                        <CurveChart kind="acc" rows={epochs} epochs={trial.epochs} />
                    </>
                )}
            </Box>
            {gpu.length > 0 ? <GpuChart points={gpu} trial={trial} /> : <TrialChartEmpty trial={trial} kind="gpu" loading={loading} error={error} />}
        </Box>
    );
}
