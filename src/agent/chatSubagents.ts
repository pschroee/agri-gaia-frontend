// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Subagents of chats that are not open (issue #60): the chat selector and the history load a chat's short list of
// runs (GET /chats/{id}/subagent-runs) when the user expands its "🤖 n" badge, without opening or waking the chat, and
// keep it afterwards. Titles and states follow the same rules as for the open chat (runTitle, runStatus). Pure logic;
// AgentContext holds the cache, useChatSubagentGroups the open state per chat.
import { isLiveStatus, subagentNav } from './subagents';
import type { SubagentNavItem, SubagentRun } from './subagents';
import type { Chat, SubagentRunSummary } from './types';

const ms = (iso: string | undefined) => {
    const v = iso ? Date.parse(iso) : NaN;
    return Number.isNaN(v) ? 0 : v;
};

/**
 * A short run as the SubagentRun the title and state rules read: the task head as the task, and the newest entry
 * (kind and time) as the only entry, which is all runStatus looks at when pi-subagents reported no state.
 */
export function summaryRun(s: SubagentRunSummary, chatId: string): SubagentRun {
    const start = ms(s.started_at);
    const end = Math.max(start, ms(s.last_at), ms(s.ended_at));
    return {
        runId: s.run_id,
        agent: s.agent,
        label: s.label || undefined,
        state: s.state || undefined,
        entries: s.last_kind
            ? [
                  {
                      chat_id: chatId,
                      run_id: s.run_id,
                      entry_id: 'last',
                      agent: s.agent,
                      kind: s.last_kind,
                      payload: {},
                      confirmed: false,
                      created_at: s.last_at ?? '',
                  },
              ]
            : [],
        start,
        end,
        task: s.task_head || undefined,
        toolCalls: 0,
        errors: 0,
    };
}

/** Sub-entries of a chat that is not open, from its short list: same titles and states as for the open chat. */
export function summaryNav(
    runs: SubagentRunSummary[],
    chatId: string,
    { chatRunning, now }: { chatRunning: boolean; now: number },
): SubagentNavItem[] {
    return subagentNav(
        runs.map((r) => summaryRun(r, chatId)),
        { chatRunning, now },
    );
}

/** A chat's short list in the cache: loading, loaded (with the chat's number of runs then) or failed. */
export type CachedRuns =
    | { status: 'loading'; previous?: SubagentRunSummary[] }
    | { status: 'loaded'; runs: SubagentRunSummary[]; count: number; live: boolean; at: number }
    | { status: 'error'; error: string; at: number };

export type RunsCache = Record<string, CachedRuns>;

export type RunsCacheAction =
    | { type: 'start'; chatId: string }
    | { type: 'loaded'; chatId: string; runs: SubagentRunSummary[]; count: number; live: boolean; at: number }
    | { type: 'failed'; chatId: string; error: string; at: number };

export function runsCacheReducer(state: RunsCache, a: RunsCacheAction): RunsCache {
    switch (a.type) {
        case 'start': {
            const cur = state[a.chatId];
            // a reload keeps showing the list it replaces
            return {
                ...state,
                [a.chatId]: { status: 'loading', previous: cur?.status === 'loaded' ? cur.runs : undefined },
            };
        }
        case 'loaded':
            return { ...state, [a.chatId]: { status: 'loaded', runs: a.runs, count: a.count, live: a.live, at: a.at } };
        case 'failed':
            return { ...state, [a.chatId]: { status: 'error', error: a.error, at: a.at } };
    }
}

/** A list with a live run is loaded again on expanding when it is older than this. */
export const RUNS_STALE_MS = 15_000;

/**
 * Whether expanding a chat must load its list: not while it loads; yes when it was never loaded or failed, when the
 * chat's number of runs changed since, or when a run was live then and the list is older than RUNS_STALE_MS.
 * Otherwise the cached list is shown.
 */
export function needsLoad(entry: CachedRuns | undefined, chat: Pick<Chat, 'subagents'>, now: number): boolean {
    if (!entry || entry.status === 'error') return true;
    if (entry.status === 'loading') return false;
    if (entry.count !== (chat.subagents ?? 0)) return true;
    return entry.live && now - entry.at > RUNS_STALE_MS;
}

/** The runs a cache entry can show: the loaded list, or the one a reload replaces. */
export function cachedRuns(entry: CachedRuns | undefined): SubagentRunSummary[] | undefined {
    if (entry?.status === 'loaded') return entry.runs;
    if (entry?.status === 'loading') return entry.previous;
    return undefined;
}

/**
 * Loads a chat's short list if needsLoad says so. Only `fetchRuns` (GET …/subagent-runs) is called, never anything
 * that opens or resumes the chat; `inflight` keeps two quick clicks from loading twice.
 */
export async function ensureChatRuns(
    chat: Pick<Chat, 'id' | 'subagents' | 'running'>,
    deps: {
        cache: RunsCache;
        inflight: Set<string>;
        fetchRuns: (chatId: string) => Promise<SubagentRunSummary[]>;
        dispatch: (a: RunsCacheAction) => void;
        now: () => number;
    },
): Promise<void> {
    const { cache, inflight, fetchRuns, dispatch, now } = deps;
    if (inflight.has(chat.id) || !needsLoad(cache[chat.id], chat, now())) return;
    inflight.add(chat.id);
    dispatch({ type: 'start', chatId: chat.id });
    try {
        const runs = await fetchRuns(chat.id);
        const at = now();
        const live = summaryNav(runs, chat.id, { chatRunning: !!chat.running, now: at }).some((i) =>
            isLiveStatus(i.status),
        );
        dispatch({ type: 'loaded', chatId: chat.id, runs, count: chat.subagents ?? 0, live, at });
    } catch (e) {
        dispatch({ type: 'failed', chatId: chat.id, error: e instanceof Error ? e.message : String(e), at: now() });
    } finally {
        inflight.delete(chat.id);
    }
}

/** The subagent selection after selecting a chat: with a run, that run of the chat opens; otherwise the chat itself. */
export function selectionFor(
    chatId: string | undefined,
    runId?: string,
): { chatId: string; runId: string } | undefined {
    return chatId && runId ? { chatId, runId } : undefined;
}

/**
 * Whether the open chat view drops a selected subagent it does not know (gone, or another chat's): only once the chat
 * has been loaded and is not loading again. A subagent picked under another chat is selected together with its chat,
 * before that chat's view has loaded its runs, and must survive until then.
 */
export function dropUnknownSubagent(v: {
    subagentId?: string;
    known: boolean;
    loaded: boolean;
    loading: boolean;
}): boolean {
    return !!v.subagentId && v.loaded && !v.loading && !v.known;
}
