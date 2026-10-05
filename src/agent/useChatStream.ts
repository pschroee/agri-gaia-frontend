// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import { AgentApiError, agentApi, eventsUrl } from './api';
import { emptyQueue, expectQueued, lastSeq, queueReducer, queueRows, removeErrorText } from './queue';
import type { QueueRow } from './queue';
import type { Approval, Chat, QueueEvent, ServerEvent, SocketCall, StoredMessage, ToolExecution } from './types';

export type ChatStream = {
    chat?: Chat;
    messages: StoredMessage[];
    approvals: Approval[];
    socketCalls: SocketCall[];
    executions: ToolExecution[];
    /** Queued messages (gateway entries, then the ones still being sent). */
    queue: QueueRow[];
    /** Last failure of a queue action (removing, sending now); cleared by the next one. */
    queueError?: string;
    /** Text of the answer that is being streamed right now (not yet stored). */
    liveText: string;
    loading: boolean;
    error?: string;
    connected: boolean;
    reload: () => Promise<void>;
    /** Sends a message; while the agent works the gateway queues it. */
    send: (text: string) => Promise<void>;
    /** Removes a queued entry that has not been delivered yet. */
    unqueue: (id: string) => Promise<void>;
    /** Delivers held entries now (after an abort or with an idle chat). */
    sendQueueNow: () => Promise<void>;
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
    const [queueState, dispatchQueue] = useReducer(queueReducer, emptyQueue);
    const [queueError, setQueueError] = useState<string>();
    const reloadTimer = useRef<ReturnType<typeof setTimeout>>();
    const chatRef = useRef<Chat>();
    chatRef.current = chat;
    const messagesRef = useRef<StoredMessage[]>([]);
    messagesRef.current = messages;

    const load = useCallback(async () => {
        if (!chatId) return;
        try {
            const d = await agentApi.chat(chatId);
            setChat(d.chat);
            setMessages(d.messages ?? []);
            messagesRef.current = d.messages ?? [];
            setApprovals(d.approvals ?? []);
            setSocketCalls(d.socket_calls ?? []);
            dispatchQueue({ type: 'loaded', entries: d.queue ?? [] });
            // delivered entries stay visible until their user message is stored
            dispatchQueue({ type: 'messages', messages: d.messages ?? [] });
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
        dispatchQueue({ type: 'reset' });
        setQueueError(undefined);
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
                    case 'queue': {
                        const q = ev.data as QueueEvent;
                        dispatchQueue({ type: 'event', event: q, lastSeq: lastSeq(messagesRef.current) });
                        // delivered: handed to pi; the user message is stored once pi reads it (message_end
                        // triggers the reload that settles the entries)
                        if (q.change === 'delivered') scheduleReload();
                        break;
                    }
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
            const guessQueued = expectQueued(chatRef.current);
            const key = `send-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            if (guessQueued) dispatchQueue({ type: 'local_add', item: { key, text } });
            try {
                const r = await agentApi.sendMessage(chatId, text);
                if (r.queued) {
                    // the SSE event "queue" carries the entry; fetch anyway in case the stream is reconnecting,
                    // and keep the optimistic row until then so it does not flicker
                    try {
                        dispatchQueue({ type: 'loaded', entries: await agentApi.queue(chatId) });
                    } catch {
                        // the SSE event or the next reload brings the entry
                    }
                }
            } finally {
                dispatchQueue({ type: 'local_drop', key });
            }
            scheduleReload();
        },
        [chatId, scheduleReload],
    );

    const unqueue = useCallback(
        async (id: string) => {
            if (!chatId) return;
            setQueueError(undefined);
            dispatchQueue({ type: 'remove_start', id });
            try {
                await agentApi.unqueue(chatId, id);
                dispatchQueue({ type: 'remove_done', id, ok: true });
            } catch (e) {
                const status = e instanceof AgentApiError ? e.status : undefined;
                // 404: the entry is gone anyway
                dispatchQueue({ type: 'remove_done', id, ok: status === 404 });
                setQueueError(removeErrorText(status, e instanceof Error ? e.message : String(e)));
            }
        },
        [chatId],
    );

    const sendQueueNow = useCallback(async () => {
        if (!chatId) return;
        setQueueError(undefined);
        try {
            await agentApi.flushQueue(chatId);
        } catch (e) {
            setQueueError(`Sending failed: ${e instanceof Error ? e.message : String(e)}`);
        }
        scheduleReload();
    }, [chatId, scheduleReload]);

    const queue = useMemo(() => queueRows(queueState, chat), [queueState, chat]);

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
        queue,
        queueError,
        liveText,
        loading,
        error,
        connected,
        reload: load,
        send,
        unqueue,
        sendQueueNow,
        abort,
        decide,
    };
}
