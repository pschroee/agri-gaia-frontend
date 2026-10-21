// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Head of a search in the tab "Experiments" and its final result (gateway issue #168, design c1/c2): state, the four
// meters of the budget, the export (also while the search runs, G5), and, once it ended, the winner, the validation
// value, the test result (measured once, by the gateway) and why the search ended.

import { ReactNode, useState } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import DownloadIcon from '@mui/icons-material/Download';
import StarIcon from '@mui/icons-material/Star';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';

import { searchExportUrl } from '../../api';
import type { Search, SearchObjective, Trial } from '../../experiments';
import { formatClock } from '../../format';
import {
    bestTrialOf,
    budgetMeters,
    directionText,
    endText,
    metricWords,
    paramsLine,
    scoreText,
    searchView,
    testView,
    winnerOf,
} from '../../searchView';
import type { ChipKind, Meter, TestView } from '../../searchView';
import type { AssessCheck } from '../../types';
import { agentColors, MONO } from '../tokens';
import SearchControls from './SearchControls';
import { AgentNote } from './SearchParts';
import { pathWord } from '../../experimentsTab';

const CHIP_COLOR: Record<ChipKind, 'primary' | 'success' | 'default' | 'error' | 'warning'> = {
    live: 'primary',
    wait: 'warning',
    ok: 'success',
    neutral: 'default',
    error: 'error',
};

/** The line under the title: the goal and the way. "Validation accuracy · higher is better · platform template, base
 *  training #63 · started 08:46". */
export function searchSubline(search: Search): string {
    const o: SearchObjective = search.objective;
    const way =
        search.path === 'notebook'
            ? 'notebook'
            : `platform ${pathWord(search.path)}${search.base?.container_id ? `, base training #${search.base.container_id}` : ''}`;
    const started = search.started_at ? ` · started ${formatClock(search.started_at)}` : '';
    return `${metricWords(o).label} · ${directionText(o)} · ${way}${started}`;
}

/** One of the four meters: label, value, and a thin bar. The bar has `aria-valuetext`; the target has no fill (G20). */
export function BudgetMeter({ meter }: { meter: Meter }) {
    return (
        <Box data-testid={`search-meter-${meter.key}`} sx={{ minWidth: 0 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', columnGap: 1 }}>
                <Typography variant="caption" color="text.secondary">
                    {meter.label}
                </Typography>
                {meter.reached && (
                    <Typography variant="caption" sx={{ color: agentColors.amberText, fontWeight: 500 }}>
                        reached
                    </Typography>
                )}
            </Box>
            <Typography sx={{ fontSize: 13, color: meter.set ? 'text.primary' : 'text.secondary' }} noWrap title={meter.value}>
                {meter.value}
            </Typography>
            <LinearProgress
                variant="determinate"
                value={meter.pct ?? 0}
                aria-label={meter.label}
                aria-valuetext={meter.valueText}
                color={meter.reached ? 'warning' : 'primary'}
                sx={{ height: 3, mt: 0.5, borderRadius: 1, bgcolor: 'action.hover', opacity: meter.set ? 1 : 0.5 }}
            />
        </Box>
    );
}

/** Export of the search: JSON or CSV, offered while it runs too. */
export function ExportButton({ chatId, search }: { chatId: string; search: Search }) {
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    return (
        <>
            <Button
                size="small"
                variant="outlined"
                startIcon={<DownloadIcon />}
                onClick={(e) => setAnchor(e.currentTarget)}
                aria-haspopup="menu"
                data-testid="search-export"
            >
                Export (JSON/CSV)
            </Button>
            <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
                {(['json', 'csv'] as const).map((f) => (
                    <MenuItem
                        key={f}
                        component="a"
                        href={searchExportUrl(chatId, search.id, f)}
                        download
                        onClick={() => setAnchor(null)}
                        data-testid={`search-export-${f}`}
                    >
                        {f.toUpperCase()}
                    </MenuItem>
                ))}
            </Menu>
        </>
    );
}

type HeaderProps = {
    chatId: string;
    search: Search;
    trials: Trial[];
    stopping: Record<string, true>;
    /** The trial selected in the table: the controls then offer to stop or adopt it as well. */
    trial?: Trial;
    bestIdx?: number;
    actions: Parameters<typeof SearchControls>[0]['actions'];
};

/** Title, state chip, controls, line and the four meters of one search. */
export function SearchHeader({ chatId, search, trials, stopping, trial, bestIdx, actions }: HeaderProps) {
    const view = searchView(search, trials);
    const meters = budgetMeters(search, trials, stopping);
    return (
        <Paper variant="outlined" sx={{ p: 2 }} data-testid="search-header">
            <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 1.5, rowGap: 0.5 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 500, minWidth: 0 }}>
                    Training search · {search.title}
                </Typography>
                <Chip size="small" variant="outlined" label={view.chip} color={CHIP_COLOR[view.kind]} data-testid="search-state" />
                <Box sx={{ flex: 1 }} />
                {search.state === 'running' && <ExportButton chatId={chatId} search={search} />}
                <SearchControls chatId={chatId} search={search} trial={trial} bestIdx={bestIdx} variant="page" actions={actions} />
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }} data-testid="search-subline">
                {searchSubline(search)}
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 3, mt: 1.5 }}>
                {meters.map((m) => (
                    <BudgetMeter key={m.key} meter={m} />
                ))}
            </Box>
        </Paper>
    );
}

function ResultRow({ label, children }: { label: string; children: ReactNode }) {
    return (
        <Box sx={{ display: 'grid', gridTemplateColumns: '130px minmax(0, 1fr)', columnGap: 1.5, alignItems: 'baseline', mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
                {label}
            </Typography>
            <Box sx={{ minWidth: 0 }}>{children}</Box>
        </Box>
    );
}

/** The test line: the measured value once, or why there is none. */
export function TestLine({ view, search }: { view: TestView; search: Search }) {
    if (view.kind === 'measured') {
        const set = search.holdout?.eval_dataset;
        const images = view.images ?? search.holdout?.images ?? set?.images;
        return (
            <Box data-testid="search-test-result" sx={{ display: 'flex', alignItems: 'baseline', columnGap: 0.75, flexWrap: 'wrap' }}>
                <VerifiedOutlinedIcon fontSize="small" color="success" sx={{ alignSelf: 'center' }} />
                <Typography component="span" sx={{ fontWeight: 600 }}>
                    {typeof view.accuracy === 'number' ? view.accuracy.toFixed(2) : '–'}
                </Typography>
                <Typography component="span" variant="body2" color="text.secondary">
                    · measured once{images ? ` on ${images} held-back images` : ''}
                    {set?.name ? ` of ${set.name}${set.id ? ` (#${set.id})` : ''}` : ''} · measured by the gateway
                </Typography>
            </Box>
        );
    }
    return (
        <Typography variant="body2" color="text.secondary" data-testid="search-test-text">
            {view.text}
            {view.kind === 'running' && search.holdout?.check_id ? ' – see the result check in the chat' : ''}
        </Typography>
    );
}

type FinalProps = {
    chatId: string;
    search: Search;
    trials: Trial[];
    /** The result check of the final test, found by `holdout.check_id`; undefined while it is not loaded. */
    check?: AssessCheck;
};

/** The block "Final result" of an ended search. */
export function FinalResult({ chatId, search, trials, check }: FinalProps) {
    const o = search.objective;
    const words = metricWords(o);
    const winner = winnerOf(search, trials);
    const shown = winner ?? bestTrialOf(search, trials);
    const test = testView(search, trials, check);
    const verdict = test?.kind === 'measured' ? test.verdict : undefined;
    return (
        <Paper variant="outlined" sx={{ p: 2, minWidth: 0 }} data-testid="search-final">
            <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.5 }}>
                Final result
            </Typography>
            {shown ? (
                <>
                    <Box sx={{ display: 'flex', alignItems: 'center', columnGap: 1, flexWrap: 'wrap' }}>
                        <StarIcon fontSize="small" color="primary" />
                        <Typography sx={{ fontWeight: 500 }}>
                            {winner ? `Trial ${shown.idx}` : `Best finished trial: trial ${shown.idx}`}
                        </Typography>
                        {winner && <Chip size="small" color="primary" label="Winner" />}
                    </Box>
                    <Typography sx={{ fontFamily: MONO, fontSize: 12, mt: 0.5, overflowWrap: 'anywhere' }}>
                        {paramsLine(shown.params, Object.keys(search.space ?? {}))}
                    </Typography>
                    <ResultRow label={words.label}>
                        <Typography component="span" sx={{ fontWeight: 600 }}>
                            {scoreText(shown.score, o)}
                        </Typography>
                        <Typography component="span" variant="body2" color="text.secondary">
                            {' '}
                            · {winner ? 'chose the winner' : 'best of the finished trials'}
                        </Typography>
                    </ResultRow>
                    {test && (
                        <ResultRow label={test.kind === 'measured' ? 'Test accuracy' : 'Final test'}>
                            <TestLine view={test} search={search} />
                        </ResultRow>
                    )}
                    {verdict && (
                        <ResultRow label="Verdict">
                            <Chip size="small" variant="outlined" color="success" label={verdict.replace(/_/g, ' ')} />
                        </ResultRow>
                    )}
                </>
            ) : (
                <Typography sx={{ mt: 0.5 }}>No finished trial – no final test.</Typography>
            )}
            <ResultRow label="Ended because">
                <Typography variant="body2" data-testid="search-end-text">
                    {endText(search, trials).replace(/^Ended: /, '')}
                </Typography>
            </ResultRow>
            {search.end_reason === 'ended_by_agent' && search.end_note && (
                <Box sx={{ mt: 1 }}>
                    <AgentNote text={search.end_note} collapsible={false} testId="search-end-note" />
                </Box>
            )}
            <Box sx={{ mt: 1.5 }}>
                <ExportButton chatId={chatId} search={search} />
            </Box>
        </Paper>
    );
}
