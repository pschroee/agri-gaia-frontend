// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The detail of one run of the tab "Experiments" (issue #222): head with "Back to overview" and "Open chat", then the
// body of its kind: a training search (the view the tab always had), a single training run (`TrialDetail`) or a
// notebook run without figures. The data come from the chat's own hooks, so the detail is live; the row of the
// overview only fills in what the hooks do not carry (the entry file of a notebook run).

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';

import { activityLinkOf } from '../../activity';
import { useAgent } from '../../AgentContext';
import { agentApi } from '../../api';
import type { Plan } from '../../plan';
import type { RunRow, RunState } from '../../experimentRuns';
import { fetchExperimentRuns, jobRunState, KIND_LABEL, liveDuration, runKindOf, searchRunState, trialRunState } from '../../experimentRuns';
import { useExperiments } from '../../experiments';
import { trialTitle, trialLink } from '../../experimentsTab';
import { chatTitle, formatClock } from '../../format';
import { useJobs } from '../../jobs';
import { durationText } from '../../searchView';
import { useNow } from '../../useNow';
import DetailHeader from '../overview/DetailHeader';
import PlanDialog from '../plan/PlanDialog';
import NotebookRunDetail from './NotebookRunDetail';
import RunStateCell from './RunStateCell';
import SearchDetail from './SearchDetail';
import { ReconnectingHint } from './TrialChartEmpty';
import TrialDetail from './TrialDetail';

type Props = {
    chatId: string;
    runId: string;
    trialId?: string;
    /** The row of the overview this detail was opened from. */
    row?: RunRow;
    onBack: () => void;
    onOpenChat: (chatId: string) => void;
    onSelectTrial: (trialId: string) => void;
    /** "All runs of this chat": back to the overview, filtered to the chat. */
    onAllRuns: (chatId: string) => void;
};

/** True once `on` has held for `ms`: a quick load shows no message about a run that is not there yet. */
function useDelayedFlag(on: boolean, ms: number): boolean {
    const [flag, setFlag] = useState(false);
    useEffect(() => {
        if (!on) {
            setFlag(false);
            return undefined;
        }
        const timer = setTimeout(() => setFlag(true), ms);
        return () => clearTimeout(timer);
    }, [on, ms]);
    return flag;
}

function NotFound({ onBack }: { onBack: () => void }) {
    return (
        <Alert severity="info" data-testid="detail-not-found" action={<Button color="inherit" size="small" onClick={onBack}>Back to overview</Button>}>
            This run was not found. It may belong to a chat in the trash.
        </Alert>
    );
}

export default function ExperimentDetail({ chatId, runId, trialId, row, onBack, onOpenChat, onSelectTrial, onAllRuns }: Props) {
    const kind = runKindOf(runId);
    const navigate = useNavigate();
    const { chats } = useAgent();
    const book = kind === 'training_search' || kind === 'training_run';
    const { state, actions } = useExperiments(book ? chatId : undefined);
    const jobs = useJobs(kind === 'notebook_run' ? chatId : undefined);
    const jobsSettled = useDelayedFlag(kind === 'notebook_run', 1200);

    // A notebook run opened by its address knows no entry file; the overview of its chat does.
    const [found, setFound] = useState<RunRow>();
    useEffect(() => {
        if (kind !== 'notebook_run' || row) return undefined;
        const c = new AbortController();
        fetchExperimentRuns(`?chat=${encodeURIComponent(chatId)}&kind=notebook_run&limit=100`, c.signal)
            .then((p) => setFound(p.runs.find((r) => r.id === runId)))
            .catch(() => undefined);
        return () => c.abort();
    }, [kind, row, chatId, runId]);
    const known = row ?? found;

    const search = kind === 'training_search' ? state.searches.find((s) => s.id === runId) : undefined;
    const trial = kind === 'training_run' ? state.trials.find((t) => t.id === runId) : undefined;
    const trialSearch = trial?.search_id ? state.searches.find((s) => s.id === trial.search_id) : undefined;
    const job = kind === 'notebook_run' ? jobs.find((j) => j.id === runId) ?? known?.job : undefined;

    let runState: RunState | undefined;
    let title = known?.title ?? '';
    let started: string | null | undefined;
    let ended: string | null | undefined;
    let durationS: number | undefined;
    let callId = known?.tool_call_id;
    let link: string | undefined;
    if (search) {
        runState = searchRunState(search);
        title = search.title;
        started = search.started_at ?? search.created_at;
        ended = search.ended_at;
        callId = search.tool_call_id ?? callId;
    } else if (trial) {
        runState = trialRunState(trial);
        title = known?.title ?? trialTitle(trial);
        started = trial.started_at ?? trial.declared_at;
        ended = trial.ended_at;
        durationS = trial.duration_s;
        link = trialLink(trial);
    } else if (job) {
        runState = jobRunState(job);
        title = known?.title ?? 'Notebook run';
        started = job.run_started_at ?? job.started_at;
        ended = job.run_ended_at ?? job.ended_at;
        callId = job.tool_call_id ?? callId;
        link = trialLink({ link: job.link });
    }
    if (durationS === undefined && started && ended) durationS = (Date.parse(ended) - Date.parse(started)) / 1000;
    const now = useNow(runState === 'running', 1000);
    const seconds = runState ? liveDuration({ state: runState, duration_s: durationS, started_at: started }, undefined, now) : undefined;

    const chat = known?.chat_title ?? chats.find((c) => c.id === chatId)?.title;
    // A run a plan started: "Plan step 4 · Show plan" opens the plan dialog of #221 with the plans of the chat.
    const planId = known?.plan_id || job?.plan_id;
    const planStep = known?.plan_step || job?.step_idx;
    const [planList, setPlanList] = useState<Plan[]>();
    const openPlan = () => {
        agentApi
            .plans(chatId)
            .then((l) => setPlanList(l))
            .catch(() => setPlanList([]));
    };
    const links = [
        ...(planId ? [{ label: `${planStep ? `Plan step ${planStep}` : 'Plan'} · Show plan`, onClick: openPlan }] : []),
        { label: 'All runs of this chat', onClick: () => onAllRuns(chatId) },
        ...(callId ? [{ label: 'Platform calls in Activity', onClick: () => navigate(activityLinkOf(chatId, callId)) }] : []),
        ...(link ? [{ label: 'Open in JupyterHub', href: link }] : []),
    ];

    const header = (
        <DetailHeader
            onBack={onBack}
            title={title || (kind ? KIND_LABEL[kind] : 'Run')}
            kind={kind ? KIND_LABEL[kind] : undefined}
            state={
                runState && (
                    <>
                        <RunStateCell state={runState} />
                        {seconds !== undefined && <Box component="span" sx={{ ml: 0.5 }}>· {durationText(seconds)}</Box>}
                    </>
                )
            }
            chatTitle={chatTitle({ title: chat })}
            onOpenChat={() => onOpenChat(chatId)}
            links={runState ? links : undefined}
        />
    );

    const bookLoaded = state.loaded && state.chatId === chatId;
    let body;
    if (!kind) body = <NotFound onBack={onBack} />;
    else if (book && !bookLoaded)
        body = <Skeleton variant="rounded" height={220} data-testid="detail-loading" />;
    else if (book && state.error && state.searches.length === 0 && state.trials.length === 0)
        body = (
            <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => void actions.reload()}>Retry</Button>}>
                Could not load the experiments: {state.error}
            </Alert>
        );
    else if (search) body = <SearchDetail chatId={chatId} search={search} state={state} actions={actions} trialId={trialId} onSelectTrial={onSelectTrial} />;
    else if (trial) body = <TrialDetail key={trial.id} chatId={chatId} trial={trial} search={trialSearch} state={state} />;
    else if (kind === 'notebook_run') body = <NotebookRunDetail job={job} row={known} now={now} settled={jobsSettled} />;
    else body = <NotFound onBack={onBack} />;

    const showHeader = !(!kind || (book && bookLoaded && !search && !trial));
    return (
        <Box data-testid="experiment-detail" data-kind={kind ?? ''} sx={{ display: 'grid' }}>
            {showHeader ? header : null}
            {book && state.reconnecting && (
                <Box sx={{ mb: 1 }}>
                    <ReconnectingHint since={state.lastAt ? formatClock(state.lastAt, true) : undefined} />
                </Box>
            )}
            {body}
            {planId && planList && (
                <PlanDialog
                    open
                    onClose={() => setPlanList(undefined)}
                    chatId={chatId}
                    plans={planList}
                    planId={planId}
                    chatTitle={chat}
                    onOpenChat={() => onOpenChat(chatId)}
                />
            )}
        </Box>
    );
}
