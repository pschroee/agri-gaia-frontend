// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import { AgentApiError, agentApi, eventsUrl } from './api';
import { emptyLive, liveReducer, liveTextOf } from './live';
import type { LiveMessage, ThinkingTime } from './live';
import { emptyQueue, expectQueued, lastSeq, queueReducer, queueRows, removeErrorText } from './queue';
import type { QueueRow } from './queue';
import { applyResumeStep, closeResumes } from './resume';
import type { ResumeView } from './resume';
import { pendingSettled } from './runState';
import type { PendingSend } from './runState';
import type {
    Approval,
    Chat,
    QueueEvent,
    ResumeStep,
    ServerEvent,
    SocketCall,
    StoredMessage,
    ToolExecution,
} from './types';

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
    /** The answer that is being streamed right now: text, thinking and tool calls in order (not yet stored). */
    live?: LiveMessage;
    /** Thinking blocks measured while streaming, by thinkingKey (pi stores no timing). */
    thinkingTimes: Record<string, ThinkingTime>;
    /** Resumes of a dormant chat seen live in this view (SSE "resume"), in order. */
    resumes: ResumeView[];
    /** Sent outside the queue, not stored yet (e.g. while a dormant chat resumes). */
    pending?: PendingSend;
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
    /** Stops the running turn; queued entries are held afterwards. Throws AgentApiError. */
    abort: () => Promise<void>;
    /** Lets the chat rest (409 with an open approval or while running). Throws AgentApiError. */
    suspend: () => Promise<void>;
    decide: (approval: Approval, approve: boolean) => Promise<void>;
    /** Switches the model; with compactFirst after a compaction (pending_model until then). Throws AgentApiError. */
    setModel: (model: string, compactFirst?: boolean) => Promise<void>;
    /** Sets the thinking level. Throws AgentApiError. */
    setEffort: (level: string) => Promise<void>;
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
    const [liveState, dispatchLive] = useReducer(liveReducer, emptyLive);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string>();
    const [connected, setConnected] = useState(false);
    const [queueState, dispatchQueue] = useReducer(queueReducer, emptyQueue);
    const [queueError, setQueueError] = useState<string>();
    const [resumes, setResumes] = useState<ResumeView[]>([]);
    const [pending, setPending] = useState<PendingSend>();
    const reloadTimer = useRef<ReturnType<typeof setTimeout>>();
    const pendingClear = useRef<'ended' | 'all'>();
    const chatRef = useRef<Chat>();
    chatRef.current = chat;
    const messagesRef = useRef<StoredMessage[]>([]);
    messagesRef.current = messages;

    const load = useCallback(async (clearLive?: 'ended' | 'all') => {
        if (!chatId) return;
        try {
            const d = await agentApi.chat(chatId);
            setChat(d.chat);
            setMessages(d.messages ?? []);
            // in the same render as the stored messages, so the answer is not shown twice
            if (clearLive) dispatchLive({ type: 'clear', onlyEnded: clearLive === 'ended' });
            messagesRef.current = d.messages ?? [];
            setPending((p) => (p && pendingSettled(p, d.messages ?? []) ? undefined : p));
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
        (clearLive?: 'ended' | 'all') => {
            if (reloadTimer.current) clearTimeout(reloadTimer.current);
            // a later reload without clearing must not drop the clearing of an earlier one
            if (clearLive === 'all' || (clearLive === 'ended' && !pendingClear.current)) pendingClear.current = clearLive;
            reloadTimer.current = setTimeout(() => {
                const clear = pendingClear.current;
                pendingClear.current = undefined;
                void load(clear);
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
        dispatchLive({ type: 'reset' });
        pendingClear.current = undefined;
        setError(undefined);
        dispatchQueue({ type: 'reset' });
        setQueueError(undefined);
        setResumes([]);
        setPending(undefined);
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
                        dispatchLive({ type: 'pi', event: d, now: Date.now() });
                        setResumes(closeResumes);
                        if (d.type === 'message_end') scheduleReload(d.message?.role === 'assistant' ? 'ended' : undefined);
                        if (
                            d.type === 'tool_execution_start' ||
                            d.type === 'tool_execution_end' ||
                            d.type === 'agent_settled'
                        ) {
                            scheduleReload(d.type === 'agent_settled' ? 'all' : undefined);
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
                    case 'resume': {
                        const step = ev.data as ResumeStep;
                        setResumes((l) => applyResumeStep(l, step, lastSeq(messagesRef.current)));
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
            // shown greyed in the transcript until its user message is stored; resuming a dormant chat takes seconds
            else setPending({ key, text, afterSeq: lastSeq(messagesRef.current) });
            const dropPending = () => setPending((p) => (p?.key === key ? undefined : p));
            try {
                const r = await agentApi.sendMessage(chatId, text);
                if (r.queued) dropPending();
                if (r.queued) {
                    // the SSE event "queue" carries the entry; fetch anyway in case the stream is reconnecting,
                    // and keep the optimistic row until then so it does not flicker
                    try {
                        dispatchQueue({ type: 'loaded', entries: await agentApi.queue(chatId) });
                    } catch {
                        // the SSE event or the next reload brings the entry
                    }
                }
            } catch (e) {
                // the input field gets the text back
                dropPending();
                throw e;
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

    const reload = useCallback(() => load(), [load]);

    const queue = useMemo(() => queueRows(queueState, chat), [queueState, chat]);
    const liveText = useMemo(() => liveTextOf(liveState.message), [liveState.message]);

    const abort = useCallback(async () => {
        if (!chatId) return;
        setChat(await agentApi.abort(chatId));
        // the queue is held now (queue_held); the reload brings the aborted answer
        scheduleReload('all');
    }, [chatId, scheduleReload]);

    const suspend = useCallback(async () => {
        if (!chatId) return;
        setChat(await agentApi.suspend(chatId));
    }, [chatId]);

    const setModel = useCallback(
        async (model: string, compactFirst = false) => {
            if (!chatId) return;
            setChat(await agentApi.setModel(chatId, model, compactFirst));
        },
        [chatId],
    );

    const setEffort = useCallback(
        async (level: string) => {
            if (!chatId) return;
            setChat(await agentApi.setEffort(chatId, level));
        },
        [chatId],
    );

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
        live: liveState.message,
        thinkingTimes: liveState.times,
        resumes,
        pending,
        loading,
        error,
        connected,
        reload,
        send,
        unqueue,
        sendQueueNow,
        abort,
        suspend,
        decide,
        setModel,
        setEffort,
    };
}
