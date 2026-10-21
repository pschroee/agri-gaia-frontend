// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The empty states of the trial charts (gateway issue #168, G1): no figures yet, a training that writes none, no GPU
// in the run, GPU data not available; plus the loading skeleton, the error and the "Reconnecting…" hint. The parent
// renders this only when the chart has no points.

import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import HourglassEmptyOutlinedIcon from '@mui/icons-material/HourglassEmptyOutlined';
import InsertChartOutlinedIcon from '@mui/icons-material/InsertChartOutlined';
import MemoryIcon from '@mui/icons-material/Memory';
import SyncIcon from '@mui/icons-material/Sync';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

import type { Trial } from '../../experiments';
import { figuresMissing, gpuMissing, type Missing } from '../../searchView';
import { agentColors } from '../tokens';

type Props = {
    trial: Trial;
    kind: 'figures' | 'gpu';
    /** The detail is still being read: skeleton instead of a text. */
    loading?: boolean;
    /** The detail could not be read. */
    error?: string;
    height?: number;
};

const ICONS: Record<Missing['icon'], ReactNode> = {
    wait: <HourglassEmptyOutlinedIcon fontSize="small" />,
    chart: <InsertChartOutlinedIcon fontSize="small" />,
    gpu: <MemoryIcon fontSize="small" />,
    sync: <SyncIcon fontSize="small" />,
};

/** The text of the empty state for a chart without points. */
export function emptyState(trial: Trial, kind: 'figures' | 'gpu'): Missing {
    return (
        (kind === 'figures' ? figuresMissing(trial, []) : gpuMissing(trial, [])) ?? {
            icon: 'wait',
            title: kind === 'figures' ? 'No figures yet' : 'GPU data not available',
            caption: '',
        }
    );
}

export function TrialChartEmpty({ trial, kind, loading, error, height = 160 }: Props) {
    if (loading)
        return (
            <Skeleton
                variant="rounded"
                height={height}
                role="progressbar"
                aria-label="Loading chart"
                animation="wave"
            />
        );
    const m: Missing = error
        ? { icon: 'sync', title: 'Could not load the data', caption: error }
        : emptyState(trial, kind);
    return (
        <Box
            role="status"
            sx={{
                height,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 0.5,
                textAlign: 'center',
                px: 2,
                border: `1px dashed ${agentColors.outline}`,
                borderRadius: 1,
                color: agentColors.muted,
            }}
        >
            {error ? <ErrorOutlineIcon fontSize="small" color="error" /> : ICONS[m.icon]}
            <Typography sx={{ fontSize: 14, fontWeight: 500, color: 'text.primary' }}>{m.title}</Typography>
            {m.caption && <Typography sx={{ fontSize: 12 }}>{m.caption}</Typography>}
        </Box>
    );
}

/** "Reconnecting… · showing the last values from 09:52:14" while the stream is down. */
export function ReconnectingHint({ since }: { since?: string }) {
    return (
        <Box
            role="status"
            sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 12, color: 'text.secondary' }}
        >
            <CircularProgress size={12} thickness={5} aria-hidden />
            <span>{since ? `Reconnecting… · showing the last values from ${since}` : 'Reconnecting…'}</span>
        </Box>
    );
}

export default TrialChartEmpty;
