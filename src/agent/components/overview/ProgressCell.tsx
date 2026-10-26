// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import Box from '@mui/material/Box';
import LinearProgress from '@mui/material/LinearProgress';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import { agentColors } from '../tokens';

export type ProgressCellProps = {
    label: string;
    /** 0-100; undefined without a known share. */
    value?: number;
    indeterminate?: boolean;
    sub?: string;
    tone?: 'default' | 'attention' | 'failed';
    /** Full text, shown on hover. */
    title?: string;
};

const TONE_COLOR = { default: 'text.secondary', attention: agentColors.amberText, failed: agentColors.red } as const;

/** Text of a run's progress with a thin bar below it (only for a known share, or while it runs). */
export default function ProgressCell({ label, value, indeterminate, sub, tone = 'default', title }: ProgressCellProps) {
    const known = value !== undefined && !indeterminate;
    return (
        <Box sx={{ minWidth: 0 }} data-testid="progress-cell">
            <Tooltip title={title ?? ''} placement="top-start" disableHoverListener={!title}>
                <Typography noWrap sx={{ fontSize: 12, color: TONE_COLOR[tone] }}>
                    {label}
                </Typography>
            </Tooltip>
            {(known || indeterminate) && (
                <LinearProgress
                    variant={known ? 'determinate' : 'indeterminate'}
                    value={known ? Math.max(0, Math.min(100, value as number)) : undefined}
                    aria-label={label}
                    sx={{ height: 4, borderRadius: 2, mt: 0.5 }}
                />
            )}
            {sub && (
                <Typography noWrap sx={{ fontSize: 11, color: 'text.secondary', mt: 0.25 }}>
                    {sub}
                </Typography>
            )}
        </Box>
    );
}
