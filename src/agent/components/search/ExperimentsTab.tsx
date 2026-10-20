// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The tab "Experiments" of /ai-agent (gateway issue #168, design c1-c3, g1, g2, g8): the training searches and runs
// of a chat. Choice of the chat and of the search ("All runs of this chat" lists every run), the head with the
// budget and the controls, the comparison, the table of the trials and the detail of the selected one; once a search
// ended, the final result. Data and stream come from `useExperiments`; the words from `searchView`/`experimentsTab`.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';

import { useAgent } from '../../AgentContext';
import { useChecks } from '../../assess';
import { controlError, useExperiments } from '../../experiments';
import type { Search, Trial } from '../../experiments';
import { ALL_RUNS, groupRows, proposedCount, resolveShow, rowsOf, showOptions, tableFooter } from '../../experimentsTab';
import { chatTitle, formatClock } from '../../format';
import { bestTrialOf, openTrialOf, trialsOf, winnerOf } from '../../searchView';
import { ReconnectingHint } from './TrialChartEmpty';
import CompareChart from './CompareChart';
import { FinalResult, SearchHeader } from './SearchSummary';
import TrialDetail from './TrialDetail';
import TrialTable from './TrialTable';

/** The trial the detail shows when the user chose none: the open one, else the winner or best, else the last. */
export function defaultTrial(search: Search, list: Trial[]): Trial | undefined {
    return openTrialOf(list) ?? winnerOf(search, list) ?? bestTrialOf(search, list) ?? list[list.length - 1];
}

function Loading() {
    return (
        <Box sx={{ display: 'grid', gap: 2 }} data-testid="experiments-loading" aria-busy="true">
            <Skeleton variant="rounded" height={110} />
            <Skeleton variant="rounded" height={230} />
            <Skeleton variant="rounded" height={200} />
        </Box>
    );
}

function Empty({ onOpenChat, chatId }: { onOpenChat?: (id: string) => void; chatId?: string }) {
    return (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }} data-testid="experiments-empty">
            <ScienceOutlinedIcon sx={{ fontSize: 36, color: 'text.disabled' }} />
            <Typography sx={{ fontWeight: 500, mt: 1 }}>No training runs in this chat yet</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
                Ask the agent to train a model or to search for good settings. Its runs and trials appear here with their curves.
            </Typography>
            {chatId && onOpenChat && (
                <Button variant="outlined" size="small" onClick={() => onOpenChat(chatId)}>
                    Open chat
                </Button>
            )}
        </Paper>
    );
}

export default function ExperimentsTab({ onOpenChat }: { onOpenChat?: (chatId: string) => void }) {
    const { chats, selectedChatId } = useAgent();
    const [params] = useSearchParams();
    const [chatId, setChatId] = useState<string | undefined>(selectedChatId ?? chats[0]?.id);
    useEffect(() => {
        if (!chatId && (selectedChatId ?? chats[0]?.id)) setChatId(selectedChatId ?? chats[0]?.id);
    }, [chatId, selectedChatId, chats]);
    const { state, actions } = useExperiments(chatId);
    const [want, setWant] = useState<string | undefined>(params.get('search') ?? undefined);
    const [selectedId, setSelectedId] = useState<string>();
    const [error, setError] = useState<string>();
    // Another chat clears the choice; the first render keeps what ?search= asked for.
    const shownChat = useRef(chatId);
    useEffect(() => {
        if (shownChat.current === chatId) return;
        shownChat.current = chatId;
        setWant(undefined);
        setSelectedId(undefined);
    }, [chatId]);

    const show = resolveShow(want, state.searches);
    const options = showOptions(state.searches, state.trials);
    const search = show === ALL_RUNS ? undefined : state.searches.find((s) => s.id === show);
    const checks = useChecks(chatId, [search?.holdout?.final_state, search?.holdout?.check_id, search?.state]);
    const check = search?.holdout?.check_id ? checks.find((c) => c.check_id === search.holdout?.check_id) : undefined;

    const list = useMemo(() => (search ? trialsOf(state.trials, search.id) : []), [search, state.trials]);
    const best = search ? bestTrialOf(search, list) : undefined;
    const selected = (selectedId && list.find((t) => t.id === selectedId)) || (search ? defaultTrial(search, list) : undefined);
    const waiting = proposedCount(state.searches);
    const stop = (s: Search, t: Trial) => {
        setError(undefined);
        actions.stopTrial(s.id, t.id).catch((e: unknown) => setError(controlError(e)));
    };

    const chatSelect = (
        <TextField select size="small" label="Chat" value={chatId ?? ''} onChange={(e) => setChatId(e.target.value)} sx={{ minWidth: 260 }} disabled={chats.length === 0}>
            {chats.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                    {chatTitle(c)}
                </MenuItem>
            ))}
        </TextField>
    );
    const showSelect = (
        <TextField select size="small" label="Show" value={options.some((o) => o.value === show) ? show : ''} onChange={(e) => { setWant(e.target.value); setSelectedId(undefined); }} sx={{ minWidth: 300 }} disabled={options.length === 0}>
            {options.map((o) => (
                <MenuItem key={o.value} value={o.value}>
                    {o.label}
                </MenuItem>
            ))}
        </TextField>
    );

    let body;
    if (!chatId) body = <Empty />;
    else if (!state.loaded) body = <Loading />;
    else if (state.error && state.searches.length === 0 && state.trials.length === 0)
        body = (
            <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => void actions.reload()}>Retry</Button>}>
                Could not load the experiments: {state.error}
            </Alert>
        );
    else if (state.searches.length === 0 && state.trials.length === 0) body = <Empty chatId={chatId} onOpenChat={onOpenChat} />;
    else if (!search) {
        const groups = groupRows(state.searches, state.trials, bestTrialOf);
        body = (
            <Box sx={{ display: 'grid', gap: 3 }} data-testid="experiments-all">
                {groups.map((g) => (
                    <Paper key={g.key} variant="outlined" sx={{ p: 2, minWidth: 0 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 500, mb: 1 }}>
                            {g.title}
                        </Typography>
                        <TrialTable
                            search={g.search}
                            group={g}
                            stopping={state.stopping}
                            showWay
                            onSelect={(t) => {
                                // a trial of a search opens that search with the trial chosen; a single run has no detail
                                if (!g.search) return;
                                setWant(g.search.id);
                                setSelectedId(t.id);
                            }}
                            onStop={stop}
                        />
                    </Paper>
                ))}
            </Box>
        );
    } else {
        const rows = rowsOf(search, state.trials, best);
        const ended = search.state === 'ended';
        body = (
            <Box sx={{ display: 'grid', gap: 2 }} data-testid="experiments-search">
                <SearchHeader chatId={chatId} search={search} trials={list} stopping={state.stopping} trial={selected && search.state === 'running' ? selected : undefined} actions={actions} />
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
                            <TrialTable search={search} group={{ key: search.id, title: search.title, search, rows }} selectedId={selected?.id} stopping={state.stopping} showWay={false} onSelect={(t) => setSelectedId(t.id)} onStop={stop} />
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

    return (
        <Box data-testid="experiments-tab" sx={{ display: 'grid', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                {chatSelect}
                {showSelect}
                {waiting > 0 && <Chip size="small" variant="outlined" color="warning" label={`${waiting} search${waiting > 1 ? 'es' : ''} waiting for your approval`} />}
                <Box sx={{ flex: 1 }} />
                {state.reconnecting && <ReconnectingHint since={state.lastAt ? formatClock(state.lastAt, true) : undefined} />}
            </Box>
            {error && (
                <Alert severity="error" onClose={() => setError(undefined)}>
                    {error}
                </Alert>
            )}
            {body}
        </Box>
    );
}
