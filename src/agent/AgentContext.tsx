// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { AgentApiError, agentApi, silentLogin } from './api';
import type { Chat, Me, Model } from './types';
import type { Compacting } from './usage';

export type SessionStatus = 'checking' | 'ready' | 'signed-out' | 'error';

type AgentState = {
    status: SessionStatus;
    me?: Me;
    error?: string;
    /** Runs the silent login again (button in the sign-in notice). */
    retrySignIn: () => void;
    chats: Chat[];
    chatsLoaded: boolean;
    /** Selectable models of the gateway (loaded once after sign-in; empty until then or on failure). */
    models: Model[];
    refreshChats: () => Promise<void>;
    selectedChatId?: string;
    selectChat: (id: string | undefined) => void;
    /** Adds a newly created chat and selects it. */
    addChat: (chat: Chat) => void;
    /** Replaces a known chat with a newer state (from the open chat's stream), so lists and header follow live. */
    updateChat: (chat: Chat) => void;
    /** Compactions the open chat views see running right now, by chat id (for the panel header). */
    compacting: Record<string, Compacting>;
    setCompacting: (chatId: string, c: Compacting | undefined) => void;
    panelOpen: boolean;
    setPanelOpen: (open: boolean) => void;
};

const AgentContext = createContext<AgentState | undefined>(undefined);

const PANEL_KEY = 'agentPanelOpen';
const CHAT_KEY = 'agentSelectedChat';

function load(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function store(key: string, value: string | undefined) {
    try {
        if (value === undefined) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
    } catch {
        // storage unavailable, the state is then not remembered
    }
}

/**
 * Session at the agent gateway, the user's chats and the selected chat, shared by the context panel and
 * the agent page. The session is checked once; on 401 a silent login runs, then the check is repeated.
 */
export function AgentProvider({ children }: { children: ReactNode }) {
    const [status, setStatus] = useState<SessionStatus>('checking');
    const [me, setMe] = useState<Me>();
    const [error, setError] = useState<string>();
    const [chats, setChats] = useState<Chat[]>([]);
    const [chatsLoaded, setChatsLoaded] = useState(false);
    const [models, setModels] = useState<Model[]>([]);
    const [selectedChatId, setSelectedChatId] = useState<string | undefined>(() => load(CHAT_KEY) ?? undefined);
    const [panelOpen, setPanelOpenState] = useState(() => load(PANEL_KEY) === 'true');
    const [compacting, setCompactingState] = useState<Record<string, Compacting>>({});
    const checking = useRef(false);

    const check = useCallback(async (allowSilent: boolean) => {
        if (checking.current) return;
        checking.current = true;
        setStatus('checking');
        try {
            try {
                setMe(await agentApi.me());
            } catch (e) {
                if (!(e instanceof AgentApiError && e.status === 401) || !allowSilent) throw e;
                await silentLogin();
                setMe(await agentApi.me());
            }
            setError(undefined);
            setStatus('ready');
        } catch (e) {
            if (e instanceof AgentApiError && e.status === 401) {
                setStatus('signed-out');
            } else {
                setError(e instanceof Error ? e.message : String(e));
                setStatus('error');
            }
        } finally {
            checking.current = false;
        }
    }, []);

    useEffect(() => {
        void check(true);
    }, [check]);

    const refreshChats = useCallback(async () => {
        try {
            const list = await agentApi.chats();
            setChats(Array.isArray(list) ? list : []);
            setChatsLoaded(true);
        } catch (e) {
            if (e instanceof AgentApiError && e.status === 401) setStatus('signed-out');
        }
    }, []);

    useEffect(() => {
        if (status !== 'ready') return;
        void refreshChats();
        const t = setInterval(() => void refreshChats(), 15000);
        return () => clearInterval(t);
    }, [status, refreshChats]);

    useEffect(() => {
        if (status !== 'ready') return;
        agentApi
            .models()
            .then((m) => setModels(Array.isArray(m) ? m : []))
            .catch(() => {
                // without the list the pickers show model ids
            });
    }, [status]);

    // Fall back to the newest chat when the remembered one is gone.
    useEffect(() => {
        if (!chatsLoaded) return;
        if (!selectedChatId || !chats.some((c) => c.id === selectedChatId)) {
            const next = chats[0]?.id;
            setSelectedChatId(next);
            store(CHAT_KEY, next);
        }
    }, [chats, chatsLoaded, selectedChatId]);

    const selectChat = useCallback((id: string | undefined) => {
        setSelectedChatId(id);
        store(CHAT_KEY, id);
    }, []);

    const addChat = useCallback(
        (chat: Chat) => {
            setChats((list) => [chat, ...list.filter((c) => c.id !== chat.id)]);
            selectChat(chat.id);
        },
        [selectChat],
    );

    const updateChat = useCallback((chat: Chat) => {
        setChats((list) => {
            const i = list.findIndex((c) => c.id === chat.id);
            if (i < 0 || list[i] === chat) return list;
            const next = list.slice();
            next[i] = chat;
            return next;
        });
    }, []);

    const setCompacting = useCallback((chatId: string, c: Compacting | undefined) => {
        setCompactingState((m) => {
            if (m[chatId] === c) return m;
            const next = { ...m };
            if (c) next[chatId] = c;
            else delete next[chatId];
            return next;
        });
    }, []);

    const setPanelOpen = useCallback((open: boolean) => {
        setPanelOpenState(open);
        store(PANEL_KEY, String(open));
    }, []);

    const value = useMemo<AgentState>(
        () => ({
            status,
            me,
            error,
            retrySignIn: () => void check(true),
            chats,
            chatsLoaded,
            models,
            refreshChats,
            selectedChatId,
            selectChat,
            addChat,
            updateChat,
            compacting,
            setCompacting,
            panelOpen,
            setPanelOpen,
        }),
        [
            status,
            me,
            error,
            check,
            chats,
            chatsLoaded,
            models,
            refreshChats,
            selectedChatId,
            selectChat,
            addChat,
            updateChat,
            compacting,
            setCompacting,
            panelOpen,
            setPanelOpen,
        ],
    );

    return <AgentContext.Provider value={value}>{children}</AgentContext.Provider>;
}

export function useAgent(): AgentState {
    const ctx = useContext(AgentContext);
    if (!ctx) throw new Error('useAgent outside of AgentProvider');
    return ctx;
}

/** Agent state, or undefined when the feature is disabled (no provider). */
export function useAgentOptional(): AgentState | undefined {
    return useContext(AgentContext);
}
