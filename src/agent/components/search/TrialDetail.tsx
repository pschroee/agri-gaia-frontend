// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The detail of the selected trial (gateway issue #168, design c1/c2/g5): title, way and state, the live epoch with
// the time left, the curves, the parameters, where the figures come from, the agent's note and the end of the log.
// The controls of the trial (stop, adopt) are in the head of the search (`SearchControls` with the trial).

import { useMemo } from 'react';

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import StarIcon from '@mui/icons-material/Star';

import { mergeSeries, useTrialDetail } from '../../experiments';
import type { ExperimentsState, Search, Trial } from '../../experiments';
import { fixedSettings, pathWord, sourceText, trialTitle } from '../../experimentsTab';
import { AGENT_NOTE_LABEL } from '../../notebook';
import { durationText, epochPercent, epochText, etaText, firstErrorLine, logTailLines, trialStateView } from '../../searchView';
import { AgentText } from '../PlanCard';
import { agentColors, MONO } from '../tokens';
import { StateCell } from './TrialTable';
import TrialCharts from './TrialCharts';

/** The state line: "Running · 11 min", "Done · 14 min", "Failed · <first error line> · 3 min". */
export function stateLine(t: Trial, firstError?: string): string {
    const parts = [durationText(t.duration_s)].filter((p) => p !== '–');
    if (t.state === 'failed' && firstError) parts.unshift(firstError.length > 80 ? `${firstError.slice(0, 79)}…` : firstError);
    return parts.join(' · ');
}

/** The end of the log, the lines from the first error on in red. "last {n} lines" says what it is (A12). */
export function LogTail({ text }: { text: string }) {
    const lines = logTailLines(text, 20);
    const err = firstErrorLine(lines);
    return (
        <Box data-testid="trial-log">
            <Box sx={{ display: 'flex', columnGap: 1, alignItems: 'baseline' }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 500 }}>
                    End of the log
                </Typography>
                <Typography variant="caption" color="text.secondary">
                    {lines.length > 0 ? `last ${lines.length} lines` : 'no output yet'}
                </Typography>
            </Box>
            <Box
                component="pre"
                tabIndex={0}
                aria-label="End of the log"
                sx={{ fontFamily: MONO, fontSize: 12, lineHeight: 1.6, bgcolor: 'grey.100', borderRadius: 1, p: 1.25, m: 0, mt: 0.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 380, overflow: 'auto' }}
            >
                {lines.map((l, i) => (
                    <Box component="span" key={i} sx={{ display: 'block', color: err >= 0 && i >= err ? agentColors.red : undefined }}>
                        {l || ' '}
                    </Box>
                ))}
            </Box>
        </Box>
    );
}

type Props = {
    chatId: string;
    trial: Trial;
    search?: Search;
    state: ExperimentsState;
};

export default function TrialDetail({ chatId, trial, search, state }: Props) {
    // a finished trial's log end is read again once its state changed; the stream carries the points meanwhile
    const { detail, loading, error } = useTrialDetail(chatId, trial, `${trial.ended_at ?? ''}`);
    const series = useMemo(() => mergeSeries(detail, state.progress[trial.id]), [detail, state.progress, trial.id]);
    const live = trial.state === 'running' || trial.state === 'declared';
    const log = detail?.log_tail ?? '';
    const err = firstErrorLine(logTailLines(log, 20));
    const firstError = err >= 0 ? logTailLines(log, 20)[err] : trial.error;
    const view = trialStateView(trial, !!state.stopping[trial.id]);
    const line = stateLine(trial, trial.state === 'failed' ? firstError : undefined);
    const pct = epochPercent(trial);
    const eta = live ? etaText(trial.eta) : undefined;
    const fixed = search ? fixedSettings(search) : '';
    const winner = !!search && typeof search.winner_idx === 'number' && search.winner_idx === trial.idx;
    return (
        <Paper variant="outlined" sx={{ p: 2, minWidth: 0 }} data-testid="trial-detail" aria-live="polite" aria-label={trialTitle(trial)}>
            <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 1.5, rowGap: 0.5 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 500 }}>
                    {trialTitle(trial)}
                </Typography>
                <Chip size="small" variant="outlined" label={pathWord(trial.path).toUpperCase()} sx={{ fontFamily: MONO, fontSize: 11 }} />
                <Box sx={{ display: 'inline-flex', alignItems: 'center', columnGap: 0.75, fontSize: 13 }}>
                    <StateCell view={view} />
                    {line && <span>· {line}</span>}
                </Box>
                <Box sx={{ flex: 1 }} />
                {winner && <Chip size="small" variant="outlined" icon={<StarIcon />} label="Winner" />}
            </Box>
            {live && typeof pct === 'number' && (
                <Box sx={{ mt: 1.5 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="caption">{epochText(trial)}</Typography>
                        {eta && <Typography variant="caption" color="text.secondary">{eta}</Typography>}
                    </Box>
                    <LinearProgress variant="determinate" value={pct} aria-label="Epochs" aria-valuetext={`${epochText(trial)}${eta ? `, ${eta}` : ''}`} sx={{ height: 3, borderRadius: 1 }} />
                </Box>
            )}
            <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(220px, 300px)', gap: 3, mt: 2, '@media (max-width: 1100px)': { gridTemplateColumns: 'minmax(0, 1fr)' } }}>
                <TrialCharts trial={trial} epochs={series.epochs} gpu={series.gpu} loading={loading} error={error} />
                <Box sx={{ minWidth: 0 }}>
                    <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.5 }}>
                        Parameters
                    </Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', columnGap: 1.5, fontFamily: MONO, fontSize: 12 }} data-testid="trial-params">
                        {Object.entries(trial.params ?? {}).map(([k, v]) => (
                            <Box key={k} sx={{ display: 'contents' }}>
                                <span style={{ color: agentColors.muted }}>{k}</span>
                                <span>{typeof v === 'string' ? v : typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v)}</span>
                            </Box>
                        ))}
                    </Box>
                    {fixed && (
                        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5, overflowWrap: 'anywhere' }}>
                            Fixed: {fixed}
                        </Typography>
                    )}
                    <Box sx={{ display: 'flex', columnGap: 0.75, mt: 1.5, alignItems: 'flex-start', color: 'text.secondary' }}>
                        <InfoOutlinedIcon sx={{ fontSize: 16, mt: '2px' }} />
                        <Typography variant="caption">{sourceText(trial, search)}</Typography>
                    </Box>
                    {trial.note && <AgentText label={AGENT_NOTE_LABEL} text={trial.note} testId="trial-note" />}
                </Box>
            </Box>
            <Box sx={{ mt: 2 }}>
                <LogTail text={log} />
            </Box>
        </Paper>
    );
}
