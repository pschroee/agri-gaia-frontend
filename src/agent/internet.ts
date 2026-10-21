// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Internet grants of a chat (gateway issue #175, API.md "Internet grants of the agent"): the types of the gateway's
// answers, the clean-up of what the gateway sends, the stream events `internet_grant` and `internet_blocked`, and the
// hooks the views share. `useInternet` opens ONE stream per chat and serves the indicator, the popover, the snackbar
// and the blocked lines; `useInternetGrants` and `useBlocked` are the two halves of it for a view that needs only one.
// `useConnections` reads the connections across the user's chats for the Activity view.
//
// The types follow the gateway (`internal/store/internet_grants.go`, `internal/store/store.go`, `internal/chat/grants.go`),
// not the design. The texts live in `internetView.ts`.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AgentApiError, agentApi, eventsUrl } from './api';
import type { ActivityChat } from './types';

export type InternetKind = 'search' | 'domains' | 'packages' | 'full';
export type GrantState = 'pending' | 'active' | 'ended' | 'rejected' | 'expired';
export type GrantOrigin = 'agent' | 'user' | 'default';
export type EndedReason = 'time' | 'bytes' | 'installed' | 'user' | 'agent' | 'error';
export type PackageState = 'waiting' | 'downloaded' | 'installed';

/** One package of a packages grant: the roots first (no `parent`), then the dependencies the gate found. */
export type PackageEntry = {
    ecosystem: 'pip' | 'npm';
    name: string;
    /** The pin of a root; missing: any version. */
    version?: string;
    /** The package that declared this one; missing for a package the agent asked for. */
    parent?: string;
    state: PackageState;
    installed_version?: string;
    installed_at?: string;
};

/** `approval.internet`: what the user approves, built by the gateway from the normalised request. */
export type InternetApproval = {
    grant_id: number;
    kind: InternetKind;
    domains: string[];
    /** Canonical strings: `pip:torch[a,b]==2.5.1`, `npm:@scope/name@1.2.3`; roots only. */
    packages: string[];
    minutes: number;
    megabytes: number;
    ends_when_installed: boolean;
    /** The agent itself or one of its helpers (a subagent). */
    by: 'agent' | 'helper';
    /** When the request lapses undecided (RFC 3339). */
    expires_at?: string;
};

/** One internet grant (Chat.internet_grants, GET /chats/{id}/internet/grants, SSE `internet_grant`). */
export type InternetGrant = {
    id: number;
    chat_id: string;
    approval_id?: string;
    kind: InternetKind;
    origin: GrantOrigin;
    via?: string;
    session?: string;
    tool_call_id?: string;
    /** The agent's note, never verified. */
    reason?: string;
    domains: string[];
    /** Packages grants only; `[]` for the other kinds. */
    packages: PackageEntry[];
    state: GrantState;
    max_minutes: number;
    max_bytes: number;
    bytes: number;
    blocked: number;
    created_at: string;
    started_at?: string;
    expires_at?: string;
    ended_at?: string;
    ended_reason?: EndedReason;
};

/** One refused connection in the counter's list. */
export type InternetBlockedEntry = {
    host: string;
    origin: 'pi' | 'exec' | 'pkg';
    reason?: string;
    denied: string;
    package?: string;
    service?: 'search' | 'index';
    at: string;
};

/** `Chat.internet_blocked` and the stream event `internet_blocked`: the refusals of the chat. */
export type InternetBlocked = { count: number; since: string; last: InternetBlockedEntry[] };

/** One connection through the web proxy (`web_requests`); a collapsed row has `method: "*"` and `count` > 1. */
export type WebRequest = {
    id: number;
    chat_id: string;
    slot_id?: string;
    method: string;
    host: string;
    port: number;
    path?: string;
    status: number;
    bytes_up: number;
    bytes_down: number;
    /** The text of a refusal; empty for an allowed connection. */
    denied?: string;
    /** The code of a refusal (`not_listed`, `https_only`, …); the set grows, so unknown codes must be handled. */
    reason?: string;
    /** `search` (the gateway's search) or `index` (index and metadata calls of the package gate). */
    service?: 'search' | 'index';
    started_at: string;
    duration_ms: number;
    /** 0 or missing: no grant covers the row (a refusal counted at the chat). */
    grant_id?: number;
    origin: 'pi' | 'exec' | 'pkg';
    package?: string;
    version?: string;
    parent?: string;
    tool_call_id?: string;
    count: number;
};
export type Connection = WebRequest;

export type ConnectionsSummary = { count: number; bytes_down: number; bytes_up: number; blocked: number };
/** What a connection's Approval chip needs of its grant. */
export type GrantBrief = { kind: InternetKind; domains: string[]; packages: string[] };
/** Data a full grant moved that no listed connection accounts for. */
export type UnlistedBytes = { grant_id: number; chat_id: string; bytes: number };

/** One page of GET /activity/connections, newest first. */
export type ConnectionsPage = {
    connections: Connection[];
    chats: Record<string, ActivityChat>;
    /** 0 or missing: the last page. */
    next_before?: number;
    /** Over the whole filter, not the page. */
    summary: ConnectionsSummary;
    /** Rows of the whole filter (for "Show N more"). */
    total: number;
    grants: Record<string, GrantBrief>;
    unlisted: UnlistedBytes[];
};

/** `grant` of an Activity entry of kind internet. */
export type ActivityGrant = {
    id: number;
    kind: InternetKind;
    domains: string[];
    /** The roots as canonical strings. */
    packages: string[];
    bytes: number;
    max_bytes: number;
    state: GrantState;
    origin: GrantOrigin;
    started_at?: string;
    expires_at?: string;
    ended_at?: string;
    ended_reason?: EndedReason;
};

// ---------------------------------------------------------------------------------------------------------------
// Cleaning what the gateway sends
// ---------------------------------------------------------------------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A grant as the UI uses it: lists are lists (also for `null`), `packages` holds objects only. */
export function normalizeGrant(raw: unknown): InternetGrant | undefined {
    if (!isObj(raw) || typeof raw.id !== 'number' || typeof raw.kind !== 'string') return undefined;
    const packages = Array.isArray(raw.packages) ? raw.packages.filter(isObj) : [];
    return {
        ...(raw as unknown as InternetGrant),
        domains: Array.isArray(raw.domains) ? (raw.domains as string[]) : [],
        packages: packages as unknown as PackageEntry[],
        bytes: typeof raw.bytes === 'number' ? raw.bytes : 0,
        max_bytes: typeof raw.max_bytes === 'number' ? raw.max_bytes : 0,
        blocked: typeof raw.blocked === 'number' ? raw.blocked : 0,
    };
}

const sortGrants = (list: InternetGrant[]): InternetGrant[] => [...list].sort((a, b) => b.id - a.id);

/** The grants of a list answer; newest first (highest id first). */
export function normalizeGrants(raw: unknown): InternetGrant[] {
    const list = Array.isArray(raw) ? raw : [];
    return sortGrants(list.map(normalizeGrant).filter((g): g is InternetGrant => !!g));
}

/** Replaces the grant with the same id or adds it; newest first. */
export function upsertGrant(list: InternetGrant[], grant: InternetGrant): InternetGrant[] {
    const i = list.findIndex((g) => g.id === grant.id);
    if (i < 0) return sortGrants([...list, grant]);
    const next = list.slice();
    next[i] = grant;
    return next;
}

/** The grants that are running now. */
export const activeGrants = (list: InternetGrant[]): InternetGrant[] => list.filter((g) => g.state === 'active');

/** A cleaned `Chat.internet_blocked`; undefined when there is nothing or it is malformed. */
export function normalizeBlocked(raw: unknown): InternetBlocked | undefined {
    if (!isObj(raw) || typeof raw.count !== 'number' || raw.count <= 0) return undefined;
    return {
        count: raw.count,
        since: typeof raw.since === 'string' ? raw.since : '',
        last: Array.isArray(raw.last) ? (raw.last.filter(isObj) as unknown as InternetBlockedEntry[]) : [],
    };
}

// ---------------------------------------------------------------------------------------------------------------
// Stream events
// ---------------------------------------------------------------------------------------------------------------

export type InternetEvent = { kind: 'grant'; grant: InternetGrant } | { kind: 'blocked'; blocked: InternetBlocked };

/** Reads one SSE message of the chat's stream; undefined for everything but `internet_grant` and `internet_blocked`. */
export function internetEvent(text: string): InternetEvent | undefined {
    let ev: unknown;
    try {
        ev = JSON.parse(text);
    } catch {
        return undefined;
    }
    if (!isObj(ev)) return undefined;
    if (ev.kind === 'internet_grant') {
        const grant = normalizeGrant(ev.data);
        return grant ? { kind: 'grant', grant } : undefined;
    }
    if (ev.kind === 'internet_blocked') {
        const blocked = normalizeBlocked(ev.data);
        return blocked ? { kind: 'blocked', blocked } : undefined;
    }
    return undefined;
}

/** A grant that ended by itself or by the agent; the snackbar tells it (`endedNotice` in `internetView.ts`). */
export type GrantEnd = {
    grant: InternetGrant;
    /** Other grants that were active when it ended. */
    others: number;
};

/** The end a new state of a grant means, if any: it was active in `before` and is ended now (not by the user). */
export function endedTransition(before: InternetGrant[], next: InternetGrant): GrantEnd | undefined {
    if (next.state !== 'ended' || next.ended_reason === 'user') return undefined;
    const was = before.find((g) => g.id === next.id);
    if (!was || was.state !== 'active') return undefined;
    return { grant: next, others: before.filter((g) => g.state === 'active' && g.id !== next.id).length };
}

// ---------------------------------------------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------------------------------------------

/** All grants of a chat, newest first (an older gateway without the route gives an empty list). */
export async function fetchGrants(chatId: string): Promise<InternetGrant[]> {
    try {
        return normalizeGrants(await agentApi.internetGrants(chatId));
    } catch (e) {
        if (e instanceof AgentApiError && e.status === 404) return [];
        throw e;
    }
}

export type ConnectionFilter = {
    /** RFC 3339 start of the period (see `periodSince` in `activity.ts`). */
    since?: string;
    until?: string;
    chat?: string;
    grant?: number;
    result?: 'allowed' | 'blocked';
    origin?: 'pi' | 'exec' | 'pkg';
    limit?: number;
};

/** Page size of the connection table. */
export const CONNECTIONS_PAGE = 50;

/** Query string of GET /activity/connections ("?since=…&result=blocked&limit=50"). */
export function connectionsQuery(f: ConnectionFilter, before?: number): string {
    const q = new URLSearchParams();
    if (f.since) q.set('since', f.since);
    if (f.until) q.set('until', f.until);
    if (f.chat) q.set('chat', f.chat);
    if (f.grant) q.set('grant', String(f.grant));
    if (f.result) q.set('result', f.result);
    if (f.origin) q.set('origin', f.origin);
    if (before) q.set('before', String(before));
    q.set('limit', String(f.limit ?? CONNECTIONS_PAGE));
    return `?${q.toString()}`;
}

/** An empty page; the answer of a gateway without the route. */
export const emptyConnectionsPage: ConnectionsPage = {
    connections: [],
    chats: {},
    summary: { count: 0, bytes_down: 0, bytes_up: 0, blocked: 0 },
    total: 0,
    grants: {},
    unlisted: [],
};

/** Fills what a page may leave out (`null` lists, missing `summary`). */
export function normalizeConnectionsPage(raw: Partial<ConnectionsPage> | undefined): ConnectionsPage {
    const rows = raw && Array.isArray(raw.connections) ? raw.connections : [];
    return {
        connections: rows,
        chats: raw?.chats ?? {},
        next_before: raw?.next_before || undefined,
        summary: raw?.summary ?? emptyConnectionsPage.summary,
        total: raw?.total ?? rows.length,
        grants: raw?.grants ?? {},
        unlisted: raw && Array.isArray(raw.unlisted) ? raw.unlisted : [],
    };
}

/** Appends a further page to the rows already shown; summary, total, grants and unlisted come from the newest page. */
export function appendConnections(shown: ConnectionsPage, more: ConnectionsPage): ConnectionsPage {
    const seen = new Set(shown.connections.map((c) => c.id));
    return {
        ...more,
        connections: [...shown.connections, ...more.connections.filter((c) => !seen.has(c.id))],
        chats: { ...shown.chats, ...more.chats },
        grants: { ...shown.grants, ...more.grants },
    };
}

// ---------------------------------------------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------------------------------------------

/** The part of EventSource the hooks use (replaceable in tests). */
export type InternetSource = {
    onmessage: ((ev: MessageEvent<string>) => void) | null;
    onerror: ((ev: Event) => void) | null;
    onopen: ((ev: Event) => void) | null;
    close: () => void;
};

export type InternetHooks = {
    openStream: (chatId: string) => InternetSource;
    load: (chatId: string) => Promise<InternetGrant[]>;
    end: (chatId: string, grantId: number) => Promise<InternetGrant>;
    endAll: (chatId: string) => Promise<void>;
};

const defaultHooks: InternetHooks = {
    openStream: (chatId) => new EventSource(eventsUrl(chatId), { withCredentials: true }) as unknown as InternetSource,
    load: fetchGrants,
    end: async (chatId, grantId) => normalizeGrant(await agentApi.endInternetGrant(chatId, grantId)) as InternetGrant,
    // the user's switch: off ends all grants (ended_reason user)
    endAll: async (chatId) => {
        await agentApi.setInternet(chatId, false);
    },
};

export type InternetState = {
    /** All grants of the chat, newest first (also the ended ones). */
    grants: InternetGrant[];
    /** The running ones. */
    active: InternetGrant[];
    /** The refusal counter the stream sent last; the hook returns it merged with the caller's initial value. */
    blocked?: InternetBlocked;
    loaded: boolean;
    error?: string;
    /** The stream broke; the last values stay and the state is read again when it is back. */
    reconnecting: boolean;
    /** The grant that ended last by itself or by the agent (for the snackbar); cleared by `clearEnded`. */
    lastEnded?: GrantEnd;
};

export type InternetHandle = InternetState & {
    /** Ends one grant (the user's button); a grant that already ended is read again instead of failing. */
    endGrant: (grantId: number) => Promise<void>;
    /** Ends all grants (SWITCH ALL OFF). */
    endAll: () => Promise<void>;
    /** Reads the grants again. */
    reload: () => Promise<void>;
    /** Dismisses the snackbar. */
    clearEnded: () => void;
};

const emptyInternet: InternetState = { grants: [], active: [], loaded: false, reconnecting: false };

/** The text of a failed call for the view. */
export function internetError(e: unknown): string {
    if (e instanceof AgentApiError) return e.message;
    return e instanceof Error ? e.message : 'The request failed.';
}

/**
 * Grants, refusal counter and ended-notice of a chat, loaded once and kept current from the chat's stream. Without a chat
 * or when `enabled` is false there is nothing. `initialBlocked` is `chat.internet_blocked` of the chat view: it shows
 * until the stream sends its own value. Use it ONCE per chat and pass the handle down: every call opens a stream.
 */
export function useInternet(
    chatId: string | undefined,
    initialBlocked?: InternetBlocked,
    enabled = true,
    hooks: InternetHooks = defaultHooks,
): InternetHandle {
    const [state, setState] = useState<InternetState>(emptyInternet);
    const chatRef = useRef(chatId);
    chatRef.current = chatId;

    const reload = useCallback(async () => {
        const id = chatRef.current;
        if (!id) return;
        try {
            const grants = await hooks.load(id);
            if (chatRef.current !== id) return;
            setState((s) => ({ ...s, grants, active: activeGrants(grants), loaded: true, error: undefined }));
        } catch (e) {
            if (chatRef.current !== id) return;
            setState((s) => ({ ...s, loaded: true, error: internetError(e) }));
        }
    }, [hooks]);

    useEffect(() => {
        setState(emptyInternet);
        if (!chatId || !enabled) return undefined;
        let alive = true;
        void reload();
        const src = hooks.openStream(chatId);
        src.onmessage = (msg) => {
            const ev = internetEvent(msg.data);
            if (!ev || !alive) return;
            setState((s) => {
                if (ev.kind === 'blocked') return { ...s, blocked: ev.blocked };
                if (ev.grant.chat_id && ev.grant.chat_id !== chatId) return s;
                const end = endedTransition(s.grants, ev.grant);
                const grants = upsertGrant(s.grants, ev.grant);
                return { ...s, grants, active: activeGrants(grants), lastEnded: end ?? s.lastEnded };
            });
        };
        src.onerror = () => {
            if (alive) setState((s) => (s.reconnecting ? s : { ...s, reconnecting: true }));
        };
        src.onopen = () => {
            if (!alive) return;
            // a stream that came back may have missed events: read the state again
            setState((s) => (s.reconnecting ? { ...s, reconnecting: false } : s));
            void reload();
        };
        return () => {
            alive = false;
            src.close();
        };
    }, [chatId, enabled, hooks, reload]);

    const endGrant = useCallback(
        async (grantId: number) => {
            const id = chatRef.current;
            if (!id) return;
            try {
                const grant = await hooks.end(id, grantId);
                if (chatRef.current !== id) return;
                setState((s) => {
                    const grants = upsertGrant(s.grants, grant);
                    return { ...s, grants, active: activeGrants(grants) };
                });
            } catch (e) {
                // 409: it ended in the meantime; read the state instead of showing an error
                if (e instanceof AgentApiError && e.status === 409) return reload();
                throw e;
            }
        },
        [hooks, reload],
    );

    const endAll = useCallback(async () => {
        const id = chatRef.current;
        if (!id) return;
        await hooks.endAll(id);
        await reload();
    }, [hooks, reload]);

    const clearEnded = useCallback(() => setState((s) => (s.lastEnded ? { ...s, lastEnded: undefined } : s)), []);

    return useMemo(
        () => ({ ...state, blocked: state.blocked ?? initialBlocked, endGrant, endAll, reload, clearEnded }),
        [state, initialBlocked, endGrant, endAll, reload, clearEnded],
    );
}

/** The grants half of `useInternet`: the list, SSE updates, `endGrant(id)` and `endAll()`. Opens its own stream. */
export function useInternetGrants(
    chatId: string | undefined,
    enabled = true,
    hooks: InternetHooks = defaultHooks,
): InternetHandle {
    return useInternet(chatId, undefined, enabled, hooks);
}

/** The refusal counter of a chat: `initial` (`chat.internet_blocked`) until the stream sends its own. Opens its own stream. */
export function useBlocked(
    chatId: string | undefined,
    initial?: InternetBlocked,
    enabled = true,
    hooks: InternetHooks = defaultHooks,
): InternetBlocked | undefined {
    return useInternet(chatId, initial, enabled, hooks).blocked;
}

// ---------------------------------------------------------------------------------------------------------------
// Connections across chats (Activity)
// ---------------------------------------------------------------------------------------------------------------

export type ConnectionsState = {
    /** The rows shown so far, with summary, total, grants and unlisted of the newest page. */
    page: ConnectionsPage;
    loading: boolean;
    error?: string;
    /** More rows exist beyond the ones shown. */
    hasMore: boolean;
};

export type ConnectionsHandle = ConnectionsState & {
    /** Reads the next page (`before` = `next_before`); does nothing while loading or on the last page. */
    loadMore: () => Promise<void>;
    /** Reads the first page again. */
    reload: () => Promise<void>;
};

/**
 * The connections of the user's chats for a filter, newest first. A new filter starts again from the first page; an
 * older gateway without the route (404) gives an empty page. `fetchPage` is replaceable for tests.
 */
export function useConnections(
    filter: ConnectionFilter,
    enabled = true,
    fetchPage: (query: string) => Promise<ConnectionsPage> = agentApi.connections,
): ConnectionsHandle {
    const [state, setState] = useState<ConnectionsState>({ page: emptyConnectionsPage, loading: enabled, hasMore: false });
    const key = connectionsQuery(filter);
    const keyRef = useRef(key);
    keyRef.current = key;
    const filterRef = useRef(filter);
    filterRef.current = filter;
    const nextRef = useRef<number | undefined>(undefined);
    const busy = useRef(false);

    const read = useCallback(
        async (before?: number) => {
            const k = keyRef.current;
            busy.current = true;
            setState((s) => ({ ...s, loading: true, error: undefined }));
            try {
                const page = normalizeConnectionsPage(await fetchPage(connectionsQuery(filterRef.current, before)));
                if (keyRef.current !== k) return;
                nextRef.current = page.next_before;
                setState((s) => ({
                    page: before ? appendConnections(s.page, page) : page,
                    loading: false,
                    hasMore: !!page.next_before,
                }));
            } catch (e) {
                if (keyRef.current !== k) return;
                if (e instanceof AgentApiError && e.status === 404) {
                    nextRef.current = undefined;
                    setState({ page: emptyConnectionsPage, loading: false, hasMore: false });
                } else {
                    setState((s) => ({ ...s, loading: false, error: internetError(e) }));
                }
            } finally {
                busy.current = false;
            }
        },
        [fetchPage],
    );

    useEffect(() => {
        nextRef.current = undefined;
        if (!enabled) {
            setState({ page: emptyConnectionsPage, loading: false, hasMore: false });
            return;
        }
        setState({ page: emptyConnectionsPage, loading: true, hasMore: false });
        void read();
    }, [key, enabled, read]);

    const loadMore = useCallback(async () => {
        if (busy.current || !nextRef.current) return;
        await read(nextRef.current);
    }, [read]);
    const reload = useCallback(() => read(), [read]);

    return { ...state, loadMore, reload };
}
