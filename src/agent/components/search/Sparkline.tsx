// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import { Line, LineChart } from 'recharts';

import type { EpochRow } from '../../experiments';

/** The sparkline of the search card: the target metric per epoch, 120 × 28. */
export function Sparkline({ epochs, metric, label }: { epochs: EpochRow[]; metric: string; label: string }) {
    const theme = useTheme();
    const data = epochs
        .map((e) => ({ epoch: e.epoch, v: typeof e[metric] === 'number' ? (e[metric] as number) : undefined }))
        .filter((d) => d.v !== undefined);
    if (data.length === 0) return null;
    return (
        <Box role="img" aria-label={label} sx={{ width: 120, height: 28, flex: 'none' }}>
            <LineChart width={120} height={28} data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
                <Line dataKey="v" stroke={theme.palette.primary.main} strokeWidth={1.75} dot={false} isAnimationActive={false} />
            </LineChart>
        </Box>
    );
}
