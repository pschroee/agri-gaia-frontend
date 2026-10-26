// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The detail of a training search (moved out of the tab "Experiments" for issue #222): the head with the budget and
// the controls, the comparison, the table of the trials, the detail of the selected one, and once the search ended,
// the final result. State and actions come from `useExperiments` of the caller (one stream for the whole detail).

import { useMemo, useState } from 'react';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';

import { useChecks } from '../../assess';
import { controlError } from '../../experiments';
import type { ExperimentsActions, ExperimentsState, Search, Trial } from '../../experiments';
import { rowsOf, tableFooter } from '../../experimentsTab';
import { bestTrialOf, openTrialOf, trialsOf, winnerOf } from '../../searchView';
import CompareChart from './CompareChart';
import { FinalResult, SearchHeader } from './SearchSummary';
import TrialDetail from './TrialDetail';
import TrialTable from './TrialTable';

/** The trial the detail shows when the user chose none: the open one, else the winner or best, else the last. */
export function defaultTrial(search: Search, list: Trial[]): Trial | undefined {
    return openTrialOf(list) ?? winnerOf(search, list) ?? bestTrialOf(search, list) ?? list[list.length - 1];
}

type Props = {
    chatId: string;
    search: Search;
    state: ExperimentsState;
    actions: ExperimentsActions;
    /** The trial the address names; the default trial when it is missing or unknown. */
    trialId?: string;
    onSelectTrial: (trialId: string) => void;
};

export default function SearchDetail({ chatId, search, state, actions, trialId, onSelectTrial }: Props) {
    const [error, setError] = useState<string>();
    const checks = useChecks(chatId, [search.holdout?.final_state, search.holdout?.check_id, search.state]);
    const check = search.holdout?.check_id ? checks.find((c) => c.check_id === search.holdout?.check_id) : undefined;
    const list = useMemo(() => trialsOf(state.trials, search.id), [search.id, state.trials]);
    const best = bestTrialOf(search, list);
    const selected = (trialId && list.find((t) => t.id === trialId)) || defaultTrial(search, list);
    const rows = rowsOf(search, state.trials, best);
    const ended = search.state === 'ended';
    const stop = (s: Search, t: Trial) => {
        setError(undefined);
        actions.stopTrial(s.id, t.id).catch((e: unknown) => setError(controlError(e)));
    };
    return (
        <Box sx={{ display: 'grid', gap: 2 }} data-testid="experiments-search">
            {error && (
                <Alert severity="error" onClose={() => setError(undefined)}>
                    {error}
                </Alert>
            )}
            <SearchHeader chatId={chatId} search={search} trials={list} stopping={state.stopping} bestIdx={best?.idx} trial={selected && search.state === 'running' ? selected : undefined} actions={actions} />
            {list.length > 0 && (
                <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: ended ? 'minmax(260px, 5fr) minmax(0, 7fr)' : 'minmax(0, 1fr)', '@media (max-width: 1100px)': { gridTemplateColumns: 'minmax(0, 1fr)' } }}>
                    {ended && <FinalResult chatId={chatId} search={search} trials={list} check={check} />}
                    <CompareChart search={search} trials={list} />
                </Box>
            )}
            {list.length === 0 && ended && <FinalResult chatId={chatId} search={search} trials={list} check={check} />}
            <Paper variant="outlined" sx={{ p: 2, minWidth: 0 }}>
                {list.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                        {search.state === 'running' ? 'The agent is choosing the first trial.' : 'This search ran no trials.'}
                    </Typography>
                ) : (
                    <>
                        <TrialTable search={search} group={{ key: search.id, title: search.title, search, rows }} selectedId={selected?.id} stopping={state.stopping} showWay={false} onSelect={(t) => onSelectTrial(t.id)} onStop={stop} />
                        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }} data-testid="trial-table-footer">
                            {tableFooter(search, rows, 0)}
                        </Typography>
                    </>
                )}
            </Paper>
            {selected && <TrialDetail key={selected.id} chatId={chatId} trial={selected} search={search} state={state} />}
        </Box>
    );
}
