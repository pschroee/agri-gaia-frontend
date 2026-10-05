// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import type {
    Approval,
    Chat,
    ChatDetail,
    Command,
    CreateChatRequest,
    Me,
    Model,
    QueueEntry,
    SendResult,
    ToolExecution,
    Variant,
} from './types';

/** The agent gateway is served on the platform host under /agent/ (Traefik strips the prefix). */
export const AGENT_BASE = '/agent';
const API = `${AGENT_BASE}/api`;

export const agentEnabled = import.meta.env.VITE_AGENT_ENABLED === 'true';

export class AgentApiError extends Error {
    readonly status: number;
    readonly code?: string;
    /** Machine-readable details, e.g. ContextTooLarge with code "context_too_large". */
    readonly details?: unknown;
    constructor(status: number, message: string, code?: string, details?: unknown) {
        super(message);
        this.name = 'AgentApiError';
        this.status = status;
        this.code = code;
        this.details = details;
    }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${API}/${path}`, {
        ...init,
        credentials: 'same-origin',
        headers: {
            Accept: 'application/json',
            ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
            ...init?.headers,
        },
    });
    if (!res.ok) {
        let message = `${res.status} ${res.statusText}`;
        let code: string | undefined;
        let details: unknown;
        try {
            const body = (await res.json()) as { error?: string; code?: string; details?: unknown };
            if (body?.error) message = body.error;
            code = body?.code;
            details = body?.details;
        } catch {
            // response without JSON body
        }
        throw new AgentApiError(res.status, message, code, details);
    }
    return (await res.json()) as T;
}

const post = <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

const enc = encodeURIComponent;

export const agentApi = {
    me: () => request<Me>('me'),
    models: () => request<Model[]>('models'),
    variants: () => request<Variant[]>('variants'),
    chats: () => request<Chat[]>('chats'),
    chat: (id: string) => request<ChatDetail>(`chats/${enc(id)}`),
    createChat: (req: CreateChatRequest) => post<Chat>('chats', req),
    sendMessage: (id: string, text: string) => post<SendResult>(`chats/${enc(id)}/messages`, { text }),
    /** Slash commands: the gateway's built-in ones and pi's (extensions, prompt templates, skills). */
    commands: (id: string) => request<Command[]>(`chats/${enc(id)}/commands`),
    /**
     * Runs a slash command ("/compact focus on code"); 409 for /compact while the agent works. Commands that are
     * not built in go to pi as a message (pi expands skills and templates), queued while the agent works.
     */
    runCommand: (id: string, command: string) => post<SendResult>(`chats/${enc(id)}/commands`, { command }),
    /**
     * Switches the model (409 while the agent works; 409 code "context_too_large" when the context does not fit,
     * then compactFirst: compacts and switches afterwards, pending_model until then).
     */
    setModel: (id: string, model: string, compactFirst = false) =>
        post<Chat>(`chats/${enc(id)}/model`, compactFirst ? { model, compact_first: true } : { model }),
    /** Sets pi's thinking level; only levels the model reports (400 otherwise), 409 while the agent works. */
    setEffort: (id: string, level: string) => post<Chat>(`chats/${enc(id)}/effort`, { level }),
    abort: (id: string) => post<Chat>(`chats/${enc(id)}/abort`),
    /** Lets the chat rest: saves the session and releases the sandbox (409 with an open approval or while running). */
    suspend: (id: string) => post<Chat>(`chats/${enc(id)}/suspend`),
    queue: (id: string) => request<QueueEntry[]>(`chats/${enc(id)}/queue`),
    /** Removes an entry as long as it has not been delivered (409 afterwards, 404 when unknown). */
    unqueue: (id: string, queueId: string) =>
        request<{ ok: boolean }>(`chats/${enc(id)}/queue/${enc(queueId)}`, { method: 'DELETE' }),
    /** Delivers held entries now (409 while the agent works, 400 when nothing is queued). */
    flushQueue: (id: string) => post<SendResult>(`chats/${enc(id)}/queue/send`),
    toolExecutions: (id: string) =>
        request<{ executions: ToolExecution[] }>(`chats/${enc(id)}/tool_executions`).then((r) =>
            Array.isArray(r?.executions) ? r.executions : [],
        ),
    pendingApprovals: () => request<Approval[]>('approvals?state=pending'),
    decide: (id: string, approve: boolean) => post<Approval>(`approvals/${enc(id)}`, { approve }),
};

export const eventsUrl = (chatId: string) => `${API}/chats/${enc(chatId)}/events`;

/** Login at the gateway, used visibly when the silent login failed (the gateway returns to /agent/). */
export const interactiveLoginUrl = () => `${AGENT_BASE}/oidc/login?return=${enc(`${AGENT_BASE}/`)}`;

/**
 * Silent login: the gateway runs the authorization code flow against the platform's Keycloak with
 * prompt=none, which reuses the platform session. A hidden same-origin iframe carries the redirects;
 * the gateway sets its session cookie (path /agent/) and redirects back to /agent/, which fires `load`.
 */
export function silentLogin(timeoutMs = 10000): Promise<void> {
    return new Promise((resolve) => {
        const frame = document.createElement('iframe');
        frame.style.display = 'none';
        frame.setAttribute('aria-hidden', 'true');
        frame.title = 'Agent sign-in';
        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            frame.remove();
            resolve();
        };
        const timer = setTimeout(finish, timeoutMs);
        frame.addEventListener('load', finish);
        frame.src = `${AGENT_BASE}/oidc/login?prompt=none&return=${enc(`${AGENT_BASE}/`)}`;
        document.body.appendChild(frame);
    });
}
