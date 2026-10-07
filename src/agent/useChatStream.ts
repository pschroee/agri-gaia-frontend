// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import type { PageContext } from './pageContext';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import { AgentApiError, agentApi, eventsUrl } from './api';
import {
    applyBackgroundEvent,
    backgroundStopErrorText,
    controllableTools,
    emptyRunning,
    runningReducer,
    toolActionErrorText,
    upsertBackground,
} from './background';
import { mergeArtifacts } from './files';
import { commandErrorText, commandProblem, commandResultText, isBuiltinCommand } from './commands';
import type { CommandNotice } from './commands';
import { switchFailure } from './modelChoice';
import { emptyLive, liveReducer, liveTextOf } from './live';
import type { LiveMessage, ThinkingTime } from './live';
import { emptyQueue, expectQueued, lastSeq, queueReducer, queueRows, removeErrorText } from './queue';
import type { QueueRow } from './queue';
import { applyResumeStep, closeResumes, resumeOnOpen } from './resume';
import type { ResumeView } from './resume';
import { pendingSettled } from './runState';
import type { PendingSend } from './runState';
import { mergeLLMCalls, mergeRunMeta, mergeSubagentEntries } from './subagents';
import { compactingAfter } from './usage';
import type { Compacting } from './usage';
import type {
    Approval,
    Artifact,
    BackgroundEvent,
    BackgroundTask,
    Chat,
    Command,
    ContextTooLarge,
    LLMCall,
    QueueEvent,
    ResumeStep,
    ServerEvent,
    SocketCall,
    StoredMessage,
    SubagentEntry,
    SubagentRunMeta,
    ToolExecution,
} from './types';

export type ChatStream = {
    chat?: Chat;
    messages: StoredMessage[];
    approvals: Approval[];
    socketCalls: SocketCall[];
    executions: ToolExecution[];
    /** Inputs and outputs of the chat (from the chat, GET …/artifacts, uploads and the SSE event "artifact"). */
    artifacts: Artifact[];
    /** Loads the artifact list again (GET …/artifacts). */
    refreshArtifacts: () => Promise<void>;
    /** Uploads files for the agent; returns the stored inputs. Throws AgentApiError. */
    uploadFiles: (files: File[]) => Promise<Artifact[]>;
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
    /** Resumes (and starts) of the chat seen live in this view (SSE "resume"), in order. */
    resumes: ResumeView[];
    /** Sent outside the queue, not stored yet (e.g. while the chat is being resumed). */
    pending?: PendingSend;
    /** Compaction running right now (SSE compaction_start until compaction_end), seen live in this view. */
    compacting?: Compacting;
    loading: boolean;
    error?: string;
    connected: boolean;
    reload: () => Promise<void>;
    /** Takes a newer chat state from an answer of the gateway (e.g. after switching a setting). */
    applyChat: (chat: Chat) => void;
    /** Sends a message with the names of uploaded attachments; while the agent works the gateway queues it. */
    /** context: page context sent with the message (pageContext.ts). */
    send: (text: string, attachments?: string[], context?: PageContext) => Promise<void>;
    /** Removes a queued entry that has not been delivered yet. */
    unqueue: (id: string) => Promise<void>;
    /** Delivers held entries now (after an abort or with an idle chat). */
    sendQueueNow: () => Promise<void>;
    /** Stops the running turn; queued entries are held afterwards. Throws AgentApiError. */
    abort: () => Promise<void>;
    /** Resumes the chat again after a failed resume or start (POST …/resume); a failure lands in `error`. */
    retryResume: () => Promise<void>;
    decide: (approval: Approval, approve: boolean) => Promise<void>;
    /** Switches the model; with compactFirst after a compaction (pending_model until then). Throws AgentApiError. */
    setModel: (model: string, compactFirst?: boolean) => Promise<void>;
    /** Sets the thinking level. Throws AgentApiError. */
    setEffort: (level: string) => Promise<void>;
    /** Slash commands of the chat (built-in ones and pi's), last loaded list. */
    commands: Command[];
    /** Loads the command list again (pi's skills and templates are known once the chat has a sandbox). */
    refreshCommands: () => void;
    /**
     * Runs a slash command. Built-in ones leave a note in the transcript; false means it failed (the note explains,
     * the input gets the text back). Others go to pi like a message (pending bubble or queue) and throw on failure.
     */
    runCommand: (text: string, modelName?: (id: string) => string) => Promise<boolean>;
    /** Notes of built-in commands run in this view. */
    commandNotices: CommandNotice[];
    /** "/model x" did not fit the context: the model picker offers to compact first (new object per attempt). */
    commandTooLarge?: { details: ContextTooLarge };
    /** Background tasks of the chat (GET chat, SSE "background"). */
    background: BackgroundTask[];
    /** Ends a running background task. Throws an Error with an explaining text. */
    stopBackground: (id: string) => Promise<void>;
    /** Running foreground commands (bash) that can be stopped or moved to the background, by tool call ID. */
    runningTools: Set<string>;
    /** Stops a running foreground command; the agent learns about it and continues. Throws with an explaining text. */
    stopTool: (toolCallId: string) => Promise<void>;
    /** Moves a running foreground command to the background; returns the new task. Throws with an explaining text. */
    backgroundTool: (toolCallId: string) => Promise<BackgroundTask>;
    /** Entries from the subagents' session files (GET chat, SSE "subagent"). */
    subagentEntries: SubagentEntry[];
    /** Name and state of the subagent runs (GET chat, SSE "subagent_run"). */
    subagentRuns: SubagentRunMeta[];
    /** Model calls at the LLM proxy, for the cost per subagent run (loaded once subagents exist, SSE "llm_call"). */
    llmCalls: LLMCall[];
};

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const errStatus = (e: unknown) => (e instanceof AgentApiError ? e.status : undefined);

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
    const [artifacts, setArtifacts] = useState<Artifact[]>([]);
    const [liveState, dispatchLive] = useReducer(liveReducer, emptyLive);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string>();
    const [connected, setConnected] = useState(false);
    // the stream has been open once for this chat (or did not open within a moment): resume steps can be shown
    const [streamReady, setStreamReady] = useState(false);
    // the chat and its messages have been loaded once for this view
    const [loaded, setLoaded] = useState(false);
    const [queueState, dispatchQueue] = useReducer(queueReducer, emptyQueue);
    const [queueError, setQueueError] = useState<string>();
    const [resumes, setResumes] = useState<ResumeView[]>([]);
    const [pending, setPending] = useState<PendingSend>();
    const [compacting, setCompacting] = useState<Compacting>();
    const [commands, setCommands] = useState<Command[]>([]);
    const [commandNotices, setCommandNotices] = useState<CommandNotice[]>([]);
    const [commandTooLarge, setCommandTooLarge] = useState<{ details: ContextTooLarge }>();
    const [background, setBackground] = useState<BackgroundTask[]>([]);
    const [running, dispatchRunning] = useReducer(runningReducer, emptyRunning);
    const [subagentEntries, setSubagentEntries] = useState<SubagentEntry[]>([]);
    const [subagentRuns, setSubagentRuns] = useState<SubagentRunMeta[]>([]);
    const [llmCalls, setLLMCalls] = useState<LLMCall[]>([]);
    const runningTimer = useRef<ReturnType<typeof setTimeout>>();
    const reloadTimer = useRef<ReturnType<typeof setTimeout>>();
    const pendingClear = useRef<'ended' | 'all'>();
    const chatRef = useRef<Chat>();
    chatRef.current = chat;
    const messagesRef = useRef<StoredMessage[]>([]);
    messagesRef.current = messages;
    // resume on opening (issue #31): decided once per opened chat; `resumeAsked` holds the last stored seq when this
    // view asked for a resume (opening or retrying), so the next resume over SSE sits there, before a message typed
    // meanwhile
    const resumeDecided = useRef(false);
    const resumeAsked = useRef<number>();

    const load = useCallback(async (clearLive?: 'ended' | 'all') => {
        if (!chatId) return;
        try {
            const d = await agentApi.chat(chatId);
            setChat(d.chat);
            setMessages(d.messages ?? []);
            setLoaded(true);
            // in the same render as the stored messages, so the answer is not shown twice
            if (clearLive) dispatchLive({ type: 'clear', onlyEnded: clearLive === 'ended' });
            messagesRef.current = d.messages ?? [];
            setPending((p) => (p && pendingSettled(p, d.messages ?? []) ? undefined : p));
            setApprovals(d.approvals ?? []);
            setSocketCalls(d.socket_calls ?? []);
            if (Array.isArray(d.artifacts)) setArtifacts(d.artifacts);
            dispatchQueue({ type: 'loaded', entries: d.queue ?? [] });
            // handed to pi but not read yet: shown as before a page reload (gateway issue #21)
            if (Array.isArray(d.queue_delivered))
                dispatchQueue({ type: 'delivered_loaded', deliveries: d.queue_delivered, lastSeq: lastSeq(d.messages ?? []) });
            // delivered entries stay visible until their user message is stored
            dispatchQueue({ type: 'messages', messages: d.messages ?? [] });
            if (Array.isArray(d.background)) setBackground(d.background);
            if (Array.isArray(d.subagent_entries))
                setSubagentEntries((l) => mergeSubagentEntries(l, d.subagent_entries ?? []));
            if (Array.isArray(d.subagent_runs)) setSubagentRuns((l) => mergeRunMeta(l, d.subagent_runs ?? []));
            setError(undefined);
            // commands started before this view was opened; without a run nothing can be running
            if (d.chat?.running) {
                agentApi.runningTools(chatId).then(
                    (ids) => dispatchRunning({ type: 'server', ids }),
                    () => undefined,
                );
            } else dispatchRunning({ type: 'server', ids: [] });
            // cost per subagent run comes from the LLM proxy; only needed once there are subagents
            if ((d.subagent_entries?.length ?? 0) > 0 || (d.subagent_runs?.length ?? 0) > 0 || (d.chat?.subagents ?? 0) > 0) {
                agentApi.llmCalls(chatId).then(
                    (l) => setLLMCalls((old) => mergeLLMCalls(old, l)),
                    () => undefined,
                );
            }
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
        setArtifacts([]);
        dispatchLive({ type: 'reset' });
        pendingClear.current = undefined;
        setError(undefined);
        dispatchQueue({ type: 'reset' });
        setQueueError(undefined);
        setResumes([]);
        setPending(undefined);
        setCompacting(undefined);
        setCommands([]);
        setCommandNotices([]);
        setCommandTooLarge(undefined);
        setBackground([]);
        dispatchRunning({ type: 'reset' });
        setSubagentEntries([]);
        setSubagentRuns([]);
        setLLMCalls([]);
        resumeDecided.current = false;
        resumeAsked.current = undefined;
        setStreamReady(false);
        setLoaded(false);
        if (!chatId) return;

        let stopped = false;
        let es: EventSource | null = null;
        let retry: ReturnType<typeof setTimeout> | undefined;
        let attempt = 0;

        setLoading(true);
        void load().finally(() => !stopped && setLoading(false));
        agentApi.commands(chatId).then(
            (l) => !stopped && setCommands(Array.isArray(l) ? l : []),
            () => undefined, // without the list only the suggestions are missing; typing a command still works
        );

        // without a stream the chat is resumed anyway, only its steps are not shown live
        const readyTimer = setTimeout(() => !stopped && setStreamReady(true), 2000);

        const connect = () => {
            if (stopped) return;
            es = new EventSource(eventsUrl(chatId), { withCredentials: true });
            es.onopen = () => {
                if (attempt > 0) void load();
                attempt = 0;
                setConnected(true);
                setStreamReady(true);
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
                        dispatchRunning({ type: 'pi', event: d });
                        // the gateway registers a foreground command a moment after pi reports it
                        if (d.type === 'tool_execution_start' && d.toolName === 'bash') {
                            if (runningTimer.current) clearTimeout(runningTimer.current);
                            runningTimer.current = setTimeout(() => {
                                agentApi.runningTools(chatId).then(
                                    (ids) => !stopped && dispatchRunning({ type: 'server', ids }),
                                    () => undefined,
                                );
                            }, 400);
                        }
                        setResumes(closeResumes);
                        setCompacting((c) => compactingAfter(c, d, Date.now()));
                        // the compaction entry, its cost and the new context exist only in the stored chat
                        if (d.type === 'compaction_end') scheduleReload();
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
                    case 'artifact': {
                        const a = ev.data as Artifact;
                        if (a?.name) setArtifacts((l) => mergeArtifacts(l, [a]));
                        break;
                    }
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
                        const asked = step.start ? undefined : resumeAsked.current;
                        const opened = asked !== undefined;
                        if (opened) resumeAsked.current = undefined;
                        setResumes((l) => applyResumeStep(l, step, asked ?? lastSeq(messagesRef.current), opened));
                        break;
                    }
                    case 'tool_execution':
                        setExecutions((l) => upsert(l, ev.data as ToolExecution, (e) => e.id));
                        break;
                    case 'background':
                        setBackground((l) => applyBackgroundEvent(l, ev.data as BackgroundEvent));
                        break;
                    case 'subagent': {
                        const e = ev.data as SubagentEntry;
                        if (e?.run_id) setSubagentEntries((l) => mergeSubagentEntries(l, [e]));
                        break;
                    }
                    case 'subagent_run': {
                        const r = ev.data as SubagentRunMeta;
                        if (r?.run_id) setSubagentRuns((l) => mergeRunMeta(l, [r]));
                        break;
                    }
                    case 'llm_call': {
                        const c = ev.data as LLMCall;
                        if (c?.id !== undefined) setLLMCalls((l) => mergeLLMCalls(l, [c]));
                        break;
                    }
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
            clearTimeout(readyTimer);
            if (retry) clearTimeout(retry);
            if (reloadTimer.current) clearTimeout(reloadTimer.current);
            if (runningTimer.current) clearTimeout(runningTimer.current);
            es?.close();
        };
    }, [chatId, load, scheduleReload]);

    const deliver = useCallback(
        async (text: string, asCommand: boolean, attachments: string[] = [], context?: PageContext) => {
            if (!chatId) return;
            const guessQueued = expectQueued(chatRef.current);
            const key = `send-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const files = attachments.length ? attachments : undefined;
            if (guessQueued) dispatchQueue({ type: 'local_add', item: { key, text, attachments: files, context } });
            // shown greyed in the transcript until its user message is stored; resuming a dormant chat takes seconds
            else setPending({ key, text, afterSeq: lastSeq(messagesRef.current), files, context });
            const dropPending = () => setPending((p) => (p?.key === key ? undefined : p));
            try {
                const r = asCommand
                    ? await agentApi.runCommand(chatId, text)
                    : await agentApi.sendMessage(chatId, text, attachments, context);
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

    const send = useCallback(
        (text: string, attachments?: string[], context?: PageContext) => deliver(text, false, attachments, context),
        [deliver],
    );

    const refreshArtifacts = useCallback(async () => {
        if (!chatId) return;
        try {
            setArtifacts(await agentApi.artifacts(chatId));
        } catch {
            // the list from the chat stays
        }
    }, [chatId]);

    const uploadFiles = useCallback(
        async (files: File[]) => {
            if (!chatId || files.length === 0) return [];
            const list = await agentApi.uploadFiles(chatId, files);
            const stored = Array.isArray(list) ? list : [];
            setArtifacts((l) => mergeArtifacts(l, stored));
            return stored;
        },
        [chatId],
    );

    const refreshCommands = useCallback(() => {
        if (!chatId) return;
        agentApi.commands(chatId).then(
            (l) => setCommands(Array.isArray(l) ? l : []),
            () => undefined,
        );
    }, [chatId]);

    const runCommand = useCallback(
        async (text: string, modelName?: (id: string) => string) => {
            if (!chatId) return false;
            const t = text.trim();
            // skills, prompt templates and extensions: pi expands them into a user message
            if (!isBuiltinCommand(t)) {
                await deliver(t, true);
                return true;
            }
            const note = (n: Pick<CommandNotice, 'text' | 'tone'>) =>
                setCommandNotices((l) => [
                    ...l,
                    {
                        key: `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                        command: t,
                        afterSeq: lastSeq(messagesRef.current),
                        ...n,
                    },
                ]);
            const problem = commandProblem(t);
            if (problem) {
                note({ text: problem, tone: 'error' });
                return false;
            }
            try {
                await agentApi.runCommand(chatId, t);
            } catch (e) {
                const f = /^\/model\s/i.test(t) ? switchFailure(e) : undefined;
                if (f?.kind === 'too_large') {
                    // the picker's dialog takes over: compact first, then switch
                    setCommandTooLarge({ details: f.details });
                    return true;
                }
                note({ text: commandErrorText(t, e), tone: 'error' });
                return false;
            }
            note({ text: commandResultText(t, modelName), tone: 'done' });
            // the new title, model, level or auto-compaction come with the chat
            await load();
            return true;
        },
        [chatId, deliver, load],
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

    const applyChat = useCallback(
        (c: Chat) => {
            if (c.id === chatId) setChat(c);
        },
        [chatId],
    );

    const queue = useMemo(() => queueRows(queueState, chat), [queueState, chat]);
    const liveText = useMemo(() => liveTextOf(liveState.message), [liveState.message]);

    const abort = useCallback(async () => {
        if (!chatId) return;
        setChat(await agentApi.abort(chatId));
        // the queue is held now (queue_held); the reload brings the aborted answer
        scheduleReload('all');
    }, [chatId, scheduleReload]);

    const requestResume = useCallback(async () => {
        if (!chatId) return;
        resumeAsked.current = lastSeq(messagesRef.current);
        try {
            // the state comes over SSE ("chat" when the resume begins and ends); the answer may already be older
            await agentApi.resume(chatId);
        } catch (e) {
            resumeAsked.current = undefined;
            // an older gateway without the route: the next message resumes the chat as before
            if (errStatus(e) !== 404) setError(`Loading the chat failed: ${errText(e)}`);
        }
    }, [chatId]);

    // a chat the gateway let idle is resumed as soon as it is opened, once it is loaded and the stream is there
    useEffect(() => {
        const d = resumeOnOpen({ chat, loaded, streamReady, decided: resumeDecided.current });
        if (d === 'wait') return;
        resumeDecided.current = true;
        if (d === 'resume') void requestResume();
    }, [chat, loaded, streamReady, requestResume]);

    const retryResume = useCallback(async () => {
        resumeDecided.current = true;
        await requestResume();
    }, [requestResume]);

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

    const stopTool = useCallback(
        async (toolCallId: string) => {
            if (!chatId) return;
            try {
                await agentApi.stopTool(chatId, toolCallId);
                dispatchRunning({ type: 'done', id: toolCallId });
            } catch (e) {
                if (errStatus(e) === 404) dispatchRunning({ type: 'done', id: toolCallId });
                throw new Error(toolActionErrorText('stop', errStatus(e), errText(e)));
            }
        },
        [chatId],
    );

    const backgroundTool = useCallback(
        async (toolCallId: string) => {
            if (!chatId) throw new Error('No chat');
            try {
                const t = await agentApi.backgroundTool(chatId, toolCallId);
                dispatchRunning({ type: 'done', id: toolCallId });
                setBackground((l) => upsertBackground(l, [t]));
                return t;
            } catch (e) {
                if (errStatus(e) === 404) dispatchRunning({ type: 'done', id: toolCallId });
                throw new Error(toolActionErrorText('background', errStatus(e), errText(e)));
            }
        },
        [chatId],
    );

    const stopBackground = useCallback(
        async (id: string) => {
            if (!chatId) return;
            try {
                const t = await agentApi.stopBackground(chatId, id);
                setBackground((l) => upsertBackground(l, [t]));
            } catch (e) {
                // 409: it ended meanwhile; the list shows the current state
                if (errStatus(e) === 409) {
                    agentApi.background(chatId).then(
                        (l) => setBackground((old) => upsertBackground(old, l)),
                        () => undefined,
                    );
                }
                throw new Error(backgroundStopErrorText(errStatus(e), errText(e)));
            }
        },
        [chatId],
    );

    const runningTools = useMemo(() => controllableTools(running), [running]);

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
        artifacts,
        refreshArtifacts,
        uploadFiles,
        queue,
        queueError,
        liveText,
        live: liveState.message,
        thinkingTimes: liveState.times,
        resumes,
        pending,
        compacting,
        loading,
        error,
        connected,
        reload,
        applyChat,
        send,
        unqueue,
        sendQueueNow,
        abort,
        retryResume,
        decide,
        setModel,
        setEffort,
        commands,
        refreshCommands,
        runCommand,
        commandNotices,
        commandTooLarge,
        background,
        stopBackground,
        runningTools,
        stopTool,
        backgroundTool,
        subagentEntries,
        subagentRuns,
        llmCalls,
    };
}
