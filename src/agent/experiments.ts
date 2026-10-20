// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The book of trials of a chat and its training searches (gateway issue #168, API.md "Training search with a budget"):
// every training or notebook run of the chat is a trial; the trials of a search carry its id. One source for the
// search card in the chat, the header chip and the tab "Experiments": `useExperiments` loads the list once and keeps
// it current from the chat's stream (the SSE events `search`, `trial` and `trial_progress`).
//
// The types follow the gateway (`internal/store/search.go`, `internal/chat/search_*.go`), not the design. The pure
// parts (fetchExperiments, applyExperimentEvent, mergeSeries) carry the logic a test can check.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AgentApiError, agentApi, eventsUrl } from './api';
import { AGENT_BASE } from './login';

const AGENT_API = `${AGENT_BASE}/api`;

export type SearchState = 'proposed' | 'running' | 'ended' | 'rejected' | 'expired';
export type TrialState = 'declared' | 'running' | 'done' | 'failed' | 'stopped' | 'refused';
/** The way of a search and of its trials: a platform training template or the chat's notebook server. */
export type SearchPath = 'template' | 'notebook';
export type MetricName = 'val_acc' | 'val_loss' | 'val_f1';

export type SearchObjective = { metric: MetricName; mode: 'max' | 'min' };

/** One searched parameter: a float or int range, a choice of values or a bool (gateway `search.ParamSpec`). */
export type ParamSpec = {
    type: 'float' | 'int' | 'choice' | 'bool';
    min?: number;
    max?: number;
    scale?: 'linear' | 'log';
    values?: unknown[];
};
export type SearchSpace = Record<string, ParamSpec>;

/** Every field may be missing or null: not set. */
export type SearchBudget = {
    max_runs?: number | null;
    max_compute_minutes?: number | null;
    target?: number | null;
    patience?: number | null;
};

/** What the search has used so far; `runs` counts the running trials too. */
export type SearchUsed = { runs: number; compute_minutes: number; since_improvement: number };

export type NamedObject = { id: number; name?: string; images?: number; classes?: number };

/** The template way's starting point (gateway `SearchBase`). */
export type SearchBase = {
    container_id: number;
    provider?: string;
    category?: string;
    architecture?: string;
    dataset?: NamedObject;
};

/** The test set the agent never sees (gateway `SearchHoldout`). */
export type SearchHoldout = {
    available: boolean;
    eval_dataset?: NamedObject;
    images?: number;
    /** '' not yet, pending (a winner and a held-back set), started (the final test runs), none (no test). */
    final_state?: '' | 'pending' | 'started' | 'none';
    /** The result check of the final test (assessments route). */
    check_id?: string;
    result?: unknown;
};

/** Ends of a search (gateway `end_reason`). */
export type EndReason =
    | 'target_reached'
    | 'budget_runs'
    | 'budget_time'
    | 'patience'
    | 'time_limit'
    | 'compute_limit'
    | 'start_failed'
    | 'stopped_by_user'
    | 'adopted'
    | 'ended_by_agent';

/** A training search as the API carries it (gateway `SearchView`). */
export type Search = {
    id: string;
    chat_id: string;
    title: string;
    state: SearchState;
    path: SearchPath;
    objective: SearchObjective;
    space: SearchSpace;
    budget: SearchBudget;
    base?: SearchBase;
    code?: { version?: number; entry?: string; files?: { name: string; sha256: string; size: number }[] };
    holdout?: SearchHoldout;
    /** The agent's own note; shown as not verified. */
    note?: string;
    end_reason?: EndReason | '';
    winner_idx?: number | null;
    tool_call_id?: string;
    approval_id?: string;
    created_at: string;
    started_at?: string | null;
    ends_by?: string | null;
    ended_at?: string | null;
    used: SearchUsed;
    best_idx?: number | null;
    /** The compute calls the chat has left now. */
    compute_left: number;
    /** The idx of the trial that is declared or running. */
    running_trial?: number | null;
};

export type GpuPoint = { at: string; util: number; mem_used_mb: number; mem_total_mb: number };

/** One trial of the book (gateway `TrialView`): a trial of a search, or a single run of the chat (`search_id` empty). */
export type Trial = {
    id: string;
    chat_id: string;
    search_id?: string;
    /** Numbers the trials of the chat from 1. */
    seq: number;
    /** Numbers the trials of a search from 1; 0 for a single run. */
    idx: number;
    path: SearchPath;
    state: TrialState;
    params: Record<string, unknown>;
    /** The agent's reason for the trial; not verified. */
    note?: string;
    ref?: string;
    job_id?: string;
    code_version?: number;
    source?: string;
    epoch?: number | null;
    epochs?: number | null;
    /** The target metric of the saved model (the last epoch, or the line marked saved). */
    score?: number | null;
    score_epoch?: number | null;
    gpu?: GpuPoint | null;
    /** '' unknown, none (the template writes no figures), ok. */
    figures?: '' | 'none' | 'ok';
    /** The run sampled a GPU; missing while unknown. */
    gpu_available?: boolean | null;
    error?: string;
    stopped_by?: string;
    declared_at: string;
    started_at?: string | null;
    ended_at?: string | null;
    duration_s?: number;
    /** The end the watcher expects, from epoch / epochs. */
    eta?: string | null;
};

/** The figures of one epoch by name (`train_loss`, `val_acc` …), plus `epoch` and `at`. */
export type EpochRow = { epoch: number; at?: string } & Record<string, number | string | undefined>;

export type TrialDetail = {
    trial: Trial;
    epochs: EpochRow[];
    gpu: GpuPoint[];
    log_tail: string;
};

/** What the stream reports since the detail was read. */
export type TrialProgress = { points: EpochRow[]; gpu: GpuPoint[] };

export type ExperimentsState = {
    searches: Search[];
    trials: Trial[];
    progress: Record<string, TrialProgress>;
    /** Trials the user asked to stop, until the gateway reports them stopped (no flicker, a second click is idle). */
    stopping: Record<string, true>;
    loaded: boolean;
    error?: string;
    /** The stream broke; the values stay as they were. */
    reconnecting: boolean;
    /** When the last event arrived. */
    lastAt?: string;
};

export const emptyExperiments: ExperimentsState = {
    searches: [],
    trials: [],
    progress: {},
    stopping: {},
    loaded: false,
    reconnecting: false,
};

/** Most points kept per trial in the browser (the gateway thins the older half beyond these). */
export const MAX_POINTS = 1000;
export const MAX_GPU = 2000;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

async function getJson<T>(path: string): Promise<{ status: number; body?: T }> {
    const res = await fetch(`${AGENT_API}/${path}`, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    if (res.status === 404) return { status: 404 };
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return { status: res.status, body: (await res.json()) as T };
}

/** The searches and trials of a chat; a gateway without the route (404) has none. */
export async function fetchExperiments(chatId: string): Promise<{ searches: Search[]; trials: Trial[] }> {
    const { body } = await getJson<{ searches?: Search[]; trials?: Trial[] }>(`chats/${encodeURIComponent(chatId)}/experiments`);
    return {
        searches: body && Array.isArray(body.searches) ? body.searches : [],
        trials: body && Array.isArray(body.trials) ? body.trials : [],
    };
}

/** One trial with its epochs, GPU samples and the end of its log; undefined for an unknown trial. */
export async function fetchTrialDetail(chatId: string, trialId: string): Promise<TrialDetail | undefined> {
    const { body } = await getJson<TrialDetail>(
        `chats/${encodeURIComponent(chatId)}/experiments/trials/${encodeURIComponent(trialId)}`,
    );
    if (!body) return undefined;
    return {
        trial: body.trial,
        epochs: Array.isArray(body.epochs) ? body.epochs : [],
        gpu: Array.isArray(body.gpu) ? body.gpu : [],
        log_tail: typeof body.log_tail === 'string' ? body.log_tail : '',
    };
}

// ---------------------------------------------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------------------------------------------

/** The SSE event `trial_progress` (gateway `TrialProgressEvent`). */
export type TrialProgressEvent = {
    trial_id: string;
    search_id?: string;
    epoch?: number | null;
    epochs?: number | null;
    eta?: string | null;
    score?: number | null;
    points?: EpochRow[];
    gpu?: GpuPoint | null;
};

export type ExperimentEvent =
    | { kind: 'search'; search: Search }
    | { kind: 'trial'; trial: Trial }
    | { kind: 'trial_progress'; progress: TrialProgressEvent };

/** The payload of an SSE data line when it is one of the three events of the book; anything else is ignored. */
export function experimentEvent(text: string): ExperimentEvent | undefined {
    let ev: unknown;
    try {
        ev = JSON.parse(text);
    } catch {
        return undefined;
    }
    if (!isObj(ev)) return undefined;
    const { kind, data } = ev;
    if (!isObj(data)) return undefined;
    if (kind === 'search' && typeof data.id === 'string') return { kind, search: data as unknown as Search };
    if (kind === 'trial' && typeof data.id === 'string') return { kind, trial: data as unknown as Trial };
    if (kind === 'trial_progress' && typeof data.trial_id === 'string')
        return { kind, progress: data as unknown as TrialProgressEvent };
    return undefined;
}

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
    const i = list.findIndex((x) => x.id === item.id);
    if (i < 0) return [...list, item];
    const next = list.slice();
    next[i] = item;
    return next;
}

/** Epoch rows with one more merged in: the same epoch is replaced, the list stays sorted and capped. */
export function mergePoints(points: EpochRow[], add: EpochRow[] | undefined): EpochRow[] {
    if (!add?.length) return points;
    const byEpoch = new Map<number, EpochRow>();
    for (const p of points) byEpoch.set(p.epoch, p);
    for (const p of add) if (typeof p?.epoch === 'number') byEpoch.set(p.epoch, p);
    const all = [...byEpoch.values()].sort((a, b) => a.epoch - b.epoch);
    return all.length > MAX_POINTS ? all.slice(all.length - MAX_POINTS) : all;
}

function mergeGpu(points: GpuPoint[], add: GpuPoint | GpuPoint[] | null | undefined): GpuPoint[] {
    const list = Array.isArray(add) ? add : add ? [add] : [];
    if (!list.length) return points;
    const seen = new Set(points.map((p) => p.at));
    const fresh = list.filter((p) => p?.at && !seen.has(p.at));
    if (!fresh.length) return points;
    const all = [...points, ...fresh].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    return all.length > MAX_GPU ? all.slice(all.length - MAX_GPU) : all;
}

/** The state with one event applied. Events of another chat are ignored. */
export function applyExperimentEvent(s: ExperimentsState, ev: ExperimentEvent, chatId?: string, now = ''): ExperimentsState {
    const at = now || new Date().toISOString();
    if (ev.kind === 'search') {
        if (chatId && ev.search.chat_id && ev.search.chat_id !== chatId) return s;
        return { ...s, searches: upsert(s.searches, ev.search), lastAt: at, reconnecting: false };
    }
    if (ev.kind === 'trial') {
        if (chatId && ev.trial.chat_id && ev.trial.chat_id !== chatId) return s;
        const stopping = { ...s.stopping };
        if (ev.trial.state !== 'declared' && ev.trial.state !== 'running') delete stopping[ev.trial.id];
        return { ...s, trials: upsert(s.trials, ev.trial), stopping, lastAt: at, reconnecting: false };
    }
    const p = ev.progress;
    const known = s.trials.find((t) => t.id === p.trial_id);
    if (!known) return s; // the `trial` event of a new trial comes first; an unknown one is ignored
    const trial: Trial = {
        ...known,
        epoch: p.epoch ?? known.epoch,
        epochs: p.epochs ?? known.epochs,
        eta: p.eta ?? known.eta,
        score: p.score ?? known.score,
        gpu: p.gpu ?? known.gpu,
    };
    const prev = s.progress[p.trial_id] ?? { points: [], gpu: [] };
    return {
        ...s,
        trials: upsert(s.trials, trial),
        progress: { ...s.progress, [p.trial_id]: { points: mergePoints(prev.points, p.points), gpu: mergeGpu(prev.gpu, p.gpu) } },
        lastAt: at,
        reconnecting: false,
    };
}

/** The detail with what the stream reported since it was read; the same epoch is taken from the newer source. */
export function mergeSeries(detail: TrialDetail | undefined, progress: TrialProgress | undefined): { epochs: EpochRow[]; gpu: GpuPoint[] } {
    return {
        epochs: mergePoints(detail?.epochs ?? [], progress?.points),
        gpu: mergeGpu(detail?.gpu ?? [], progress?.gpu),
    };
}

// ---------------------------------------------------------------------------------------------------------------
// The hook
// ---------------------------------------------------------------------------------------------------------------

/** The part of EventSource the hook uses (replaceable in tests). */
export type ExperimentsSource = {
    onmessage: ((ev: MessageEvent<string>) => void) | null;
    onerror: ((ev: Event) => void) | null;
    onopen: ((ev: Event) => void) | null;
    close: () => void;
};

export type ExperimentsHooks = {
    openStream: (chatId: string) => ExperimentsSource;
    load: (chatId: string) => Promise<{ searches: Search[]; trials: Trial[] }>;
};

const defaultHooks: ExperimentsHooks = {
    openStream: (chatId) => new EventSource(eventsUrl(chatId), { withCredentials: true }) as unknown as ExperimentsSource,
    load: fetchExperiments,
};

/** The controls of a running search, bound to the chat. Each answers with the search and puts it into the state. */
export type ExperimentsActions = {
    stopTrial: (searchId: string, trialId: string) => Promise<void>;
    stopSearch: (searchId: string) => Promise<void>;
    changeBudget: (searchId: string, budget: SearchBudget) => Promise<void>;
    giveHint: (searchId: string, text: string) => Promise<void>;
    adoptTrial: (searchId: string, idx: number) => Promise<void>;
    reload: () => Promise<void>;
};

export type ExperimentsHandle = { state: ExperimentsState; actions: ExperimentsActions };

/** The text of a failed control for the dialog that called it. */
export function controlError(e: unknown): string {
    if (e instanceof AgentApiError) return e.message;
    return e instanceof Error ? e.message : 'The request failed.';
}

/**
 * The searches and trials of a chat, loaded once and kept current from the chat's stream. Without a chat or when
 * `enabled` is false there is nothing. A failed load keeps what is known; the stream reconnects by itself, the state
 * says so (`reconnecting`) and keeps the last values.
 */
export function useExperiments(chatId: string | undefined, enabled = true, hooks: ExperimentsHooks = defaultHooks): ExperimentsHandle {
    const [state, setState] = useState<ExperimentsState>(emptyExperiments);
    const chatRef = useRef(chatId);
    chatRef.current = chatId;
    const stopRequested = useRef(new Set<string>());

    const reload = useCallback(async () => {
        const id = chatRef.current;
        if (!id) return;
        try {
            const list = await hooks.load(id);
            if (chatRef.current !== id) return;
            setState((s) => ({ ...s, ...list, loaded: true, error: undefined }));
        } catch (e) {
            if (chatRef.current !== id) return;
            setState((s) => ({ ...s, loaded: true, error: controlError(e) }));
        }
    }, [hooks]);

    useEffect(() => {
        setState(emptyExperiments);
        if (!chatId || !enabled) return undefined;
        let alive = true;
        void reload();
        const src = hooks.openStream(chatId);
        src.onmessage = (msg) => {
            const ev = experimentEvent(msg.data);
            if (ev && alive) setState((s) => applyExperimentEvent(s, ev, chatId));
        };
        src.onerror = () => {
            if (alive) setState((s) => (s.reconnecting ? s : { ...s, reconnecting: true }));
        };
        src.onopen = () => {
            if (!alive) return;
            // a stream that came back may have missed events: read the state again
            setState((s) => (s.reconnecting ? { ...s, reconnecting: false } : s));
            if (alive) void reload();
        };
        return () => {
            alive = false;
            src.close();
        };
    }, [chatId, enabled, hooks, reload]);

    const actions = useMemo<ExperimentsActions>(() => {
        const put = (search: Search | undefined) => {
            if (search?.id) setState((s) => ({ ...s, searches: upsert(s.searches, search) }));
        };
        const id = () => chatRef.current ?? '';
        return {
            stopTrial: async (searchId, trialId) => {
                // idempotent: a second click while the stop is on its way sends nothing
                if (stopRequested.current.has(trialId)) return;
                stopRequested.current.add(trialId);
                setState((s) => ({ ...s, stopping: { ...s.stopping, [trialId]: true } }));
                try {
                    put(await agentApi.stopSearch(id(), searchId, 'trial'));
                } catch (e) {
                    stopRequested.current.delete(trialId);
                    setState((s) => {
                        const stopping = { ...s.stopping };
                        delete stopping[trialId];
                        return { ...s, stopping };
                    });
                    throw e;
                }
            },
            stopSearch: async (searchId) => put(await agentApi.stopSearch(id(), searchId, 'search')),
            changeBudget: async (searchId, budget) => put(await agentApi.searchBudget(id(), searchId, budget)),
            giveHint: async (searchId, text) => put(await agentApi.searchHint(id(), searchId, text)),
            adoptTrial: async (searchId, idx) => put(await agentApi.adoptTrial(id(), searchId, idx)),
            reload,
        };
    }, [reload]);

    return { state, actions };
}

/**
 * One trial's detail (epochs, GPU samples, log end), read when the trial changes its state and when `refreshKey`
 * changes (a finished trial's log end). The caller merges the stream's points with `mergeSeries`.
 */
export function useTrialDetail(chatId: string | undefined, trial: Trial | undefined, refreshKey = ''): {
    detail?: TrialDetail;
    loading: boolean;
    error?: string;
} {
    const [res, setRes] = useState<{ id: string; detail?: TrialDetail; error?: string; done: boolean }>();
    const id = trial?.id;
    useEffect(() => {
        if (!chatId || !id) {
            setRes(undefined);
            return undefined;
        }
        let alive = true;
        fetchTrialDetail(chatId, id)
            .then((detail) => alive && setRes({ id, detail, done: true }))
            .catch((e: unknown) => alive && setRes((r) => ({ id, detail: r?.id === id ? r.detail : undefined, error: controlError(e), done: true })));
        return () => {
            alive = false;
        };
    }, [chatId, id, trial?.state, refreshKey]);
    const mine = res?.id === id ? res : undefined;
    return { detail: mine?.detail, loading: !!id && !mine?.done, error: mine?.error };
}
