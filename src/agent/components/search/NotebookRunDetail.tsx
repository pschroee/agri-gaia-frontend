// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The detail of a notebook run without figures (issue #222): what the gateway knows of the job, and the end of its log.

import Box from '@mui/material/Box';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';

import type { RunRow } from '../../experimentRuns';
import { jobRunState, liveDuration, startedText, STATE_LABEL, durationCell } from '../../experimentRuns';
import type { WatchJob } from '../../jobs';
import { agentColors, MONO } from '../tokens';
import { LogTail } from './TrialDetail';

const labelSx = { fontSize: 11.5, fontWeight: 500, color: 'text.secondary', lineHeight: 1.5 } as const;

function Field({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
    return (
        <>
            <Typography sx={labelSx}>{label}</Typography>
            <Typography component="div" sx={{ fontSize: 14, fontFamily: mono ? MONO : undefined, overflowWrap: 'anywhere' }}>
                {children}
            </Typography>
        </>
    );
}

type Props = {
    job?: WatchJob;
    /** The row of the overview, when the detail was opened from there: the entry file, and the job before it loads. */
    row?: RunRow;
    now: number;
    /** False while the jobs of the chat are not loaded yet: no "unknown" message then. */
    settled: boolean;
};

export default function NotebookRunDetail({ job, row, now, settled }: Props) {
    const j = job ?? row?.job;
    if (!j) {
        return settled ? (
            <Paper variant="outlined" sx={{ p: 2 }} data-testid="notebook-detail-unknown">
                <Typography sx={{ fontSize: 14 }}>This run is no longer known to the gateway.</Typography>
            </Paper>
        ) : null;
    }
    const state = jobRunState(j);
    const started = j.run_started_at ?? j.started_at;
    const ended = j.run_ended_at ?? j.ended_at;
    const seconds = liveDuration(
        { state, duration_s: started && ended ? (Date.parse(ended) - Date.parse(started)) / 1000 : undefined, started_at: started },
        undefined,
        now,
    );
    return (
        <Paper variant="outlined" sx={{ p: 2 }} data-testid="notebook-detail">
            <Box sx={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 1, alignItems: 'baseline' }}>
                <Field label="Entry" mono>
                    {row?.title || j.ref || '–'}
                </Field>
                <Field label="State">{STATE_LABEL[state]}</Field>
                <Field label="Started">{started ? startedText(started, now) : '–'}</Field>
                <Field label="Finished">{ended ? `${startedText(ended, now)}` : '–'}</Field>
                <Field label="Duration">{durationCell(seconds)}</Field>
                <Field label="Message">
                    <Box component="span" sx={{ color: state === 'failed' ? agentColors.red : undefined }}>
                        {j.message || '–'}
                    </Box>
                </Field>
            </Box>
            {typeof j.progress === 'number' && state === 'running' && (
                <LinearProgress variant="determinate" value={Math.max(0, Math.min(100, j.progress))} aria-label="Progress" sx={{ height: 4, borderRadius: 2, mt: 2 }} />
            )}
            <Box sx={{ mt: 2 }}>
                <LogTail text={j.log_tail ?? ''} />
            </Box>
        </Paper>
    );
}
