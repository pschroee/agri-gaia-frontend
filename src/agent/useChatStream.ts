// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { useCallback, useEffect, useRef, useState } from 'react';

import { agentApi, eventsUrl } from './api';
import type { Approval, Chat, ServerEvent, SocketCall, StoredMessage, ToolExecution } from './types';

export type ChatStream = {
    chat?: Chat;
    messages: StoredMessage[];
    approvals: Approval[];
    socketCalls: SocketCall[];
    executions: ToolExecution[];
    /** Text of the answer that is being streamed right now (not yet stored). */
    liveText: string;
    loading: boolean;
    error?: string;
    connected: boolean;
    reload: () => Promise<void>;
    send: (text: string) => Promise<void>;
    abort: () => Promise<void>;
    decide: (approval: Approval, approve: boolean) => Promise<void>;
};

function upsert<T>(list: T[], item: T, key: (x: T) => string | number): T[] {
    const k = key(item);
    const i = list.findIndex((x) => key(x) === k);
    if (i < 0) return [...list, item];
    const next = list.slice();
    next[i] = item;
    return next;
}

/**
 * Loads a chat and keeps it current over the gateway's SSE stream. Stored messages are the source of
 * truth: after every finished message or tool execution the chat is reloaded (debounced); in between,
 * text deltas are shown as live text.
 */
export function useChatStream(chatId: string | undefined): ChatStream {
    const [chat, setChat] = useState<Chat>();
    const [messages, setMessages] = useState<StoredMessage[]>([]);
    const [approvals, setApprovals] = useState<Approval[]>([]);
    const [socketCalls, setSocketCalls] = useState<SocketCall[]>([]);
    const [executions, setExecutions] = useState<ToolExecution[]>([]);
    const [liveText, setLiveText] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string>();
    const [connected, setConnected] = useState(false);
    const reloadTimer = useRef<ReturnType<typeof setTimeout>>();

    const load = useCallback(async () => {
        if (!chatId) return;
        try {
            const d = await agentApi.chat(chatId);
            setChat(d.chat);
            setMessages(d.messages ?? []);
            setApprovals(d.approvals ?? []);
            setSocketCalls(d.socket_calls ?? []);
            setError(undefined);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
        try {
            setExecutions(await agentApi.toolExecutions(chatId));
        } catch {
            // without the execution log only the durations are missing
        }
    }, [chatId]);

    const scheduleReload = useCallback(
        (clearLive = false) => {
            if (reloadTimer.current) clearTimeout(reloadTimer.current);
            reloadTimer.current = setTimeout(() => {
                void load().then(() => {
                    if (clearLive) setLiveText('');
                });
            }, 250);
        },
        [load],
    );

    useEffect(() => {
        setChat(undefined);
        setMessages([]);
        setApprovals([]);
        setSocketCalls([]);
        setExecutions([]);
        setLiveText('');
        setError(undefined);
        if (!chatId) return;

        let stopped = false;
        let es: EventSource | null = null;
        let retry: ReturnType<typeof setTimeout> | undefined;
        let attempt = 0;

        setLoading(true);
        void load().finally(() => !stopped && setLoading(false));

        const connect = () => {
            if (stopped) return;
            es = new EventSource(eventsUrl(chatId), { withCredentials: true });
            es.onopen = () => {
                if (attempt > 0) void load();
                attempt = 0;
                setConnected(true);
            };
            es.onmessage = (msg: MessageEvent<string>) => {
                let ev: ServerEvent;
                try {
                    ev = JSON.parse(msg.data) as ServerEvent;
                } catch {
                    return;
                }
                switch (ev.kind) {
                    case 'pi': {
                        const d = ev.data as { type: string; message?: { role?: string }; [k: string]: unknown };
                        if (d.type === 'message_start' && d.message?.role === 'assistant') setLiveText('');
                        if (d.type === 'message_update') {
                            const a = d.assistantMessageEvent as { type?: string; delta?: string } | undefined;
                            if (a?.type === 'text_delta' && a.delta) setLiveText((t) => t + a.delta);
                        }
                        if (d.type === 'message_end') scheduleReload(d.message?.role === 'assistant');
                        if (
                            d.type === 'tool_execution_start' ||
                            d.type === 'tool_execution_end' ||
                            d.type === 'agent_settled'
                        ) {
                            scheduleReload(d.type === 'agent_settled');
                        }
                        break;
                    }
                    case 'chat': {
                        const c = ev.data as Chat;
                        if (c.id === chatId) setChat(c);
                        break;
                    }
                    case 'approval':
                        setApprovals((l) => upsert(l, ev.data as Approval, (a) => a.id));
                        break;
                    case 'socket_call':
                        setSocketCalls((l) => upsert(l, ev.data as SocketCall, (c) => c.id));
                        break;
                    case 'tool_execution':
                        setExecutions((l) => upsert(l, ev.data as ToolExecution, (e) => e.id));
                        break;
                    case 'error':
                        setError((ev.data as { message?: string })?.message);
                        break;
                    default:
                        break;
                }
            };
            es.onerror = () => {
                es?.close();
                es = null;
                setConnected(false);
                if (stopped) return;
                retry = setTimeout(connect, Math.min(30000, 1000 * 2 ** attempt++));
            };
        };
        connect();

        return () => {
            stopped = true;
            if (retry) clearTimeout(retry);
            if (reloadTimer.current) clearTimeout(reloadTimer.current);
            es?.close();
        };
    }, [chatId, load, scheduleReload]);

    const send = useCallback(
        async (text: string) => {
            if (!chatId) return;
            await agentApi.sendMessage(chatId, text);
            scheduleReload();
        },
        [chatId, scheduleReload],
    );

    const abort = useCallback(async () => {
        if (!chatId) return;
        setChat(await agentApi.abort(chatId));
    }, [chatId]);

    const decide = useCallback(async (approval: Approval, approve: boolean) => {
        const a = await agentApi.decide(approval.id, approve);
        setApprovals((l) => upsert(l, a, (x) => x.id));
    }, []);

    return {
        chat,
        messages,
        approvals,
        socketCalls,
        executions,
        liveText,
        loading,
        error,
        connected,
        reload: load,
        send,
        abort,
        decide,
    };
}
