// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import type {
    ActivityPage,
    Approval,
    Artifact,
    ArtifactKind,
    BackgroundTask,
    Chat,
    ChatDetail,
    Command,
    Config,
    CreateChatRequest,
    LLMCall,
    Me,
    Model,
    PlatformStatus,
    Pool,
    QueueEntry,
    SendResult,
    ToolExecution,
    Variant,
} from './types';

import { AGENT_BASE } from './login';
import type { PageContext } from './pageContext';

export { AGENT_BASE, interactiveLoginUrl } from './login';

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
            // FormData sets its own multipart content type with the boundary
            ...(typeof init?.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
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
    /** Defaults and limits (max_subagents …). */
    config: () => request<Config>('config'),
    models: () => request<Model[]>('models'),
    variants: () => request<Variant[]>('variants'),
    /** Warm pool: slots per variant; other users' chats come without id and title. */
    pool: () => request<Pool>('pool'),
    /** Binding to the platform API (probe, last token exchange); 404 on gateways without the endpoint. */
    platform: () => request<PlatformStatus>('platform'),
    chats: () => request<Chat[]>('chats'),
    chat: (id: string) => request<ChatDetail>(`chats/${enc(id)}`),
    createChat: (req: CreateChatRequest) => post<Chat>('chats', req),
    /**
     * Sends a message; attachments: names of inputs uploaded before (400 for unknown names); context: the page the
     * user is on (pageContext.ts; the gateway refuses anything outside its lists with 400).
     */
    sendMessage: (id: string, text: string, attachments: string[] = [], context?: PageContext) =>
        post<SendResult>(`chats/${enc(id)}/messages`, {
            text,
            ...(attachments.length > 0 ? { attachments } : {}),
            ...(context ? { context } : {}),
        }),
    /** Uploads files for the agent (inputs, mirrored to /workspace/inputs/); limit artifact_max_mb per file. */
    uploadFiles: (id: string, files: File[]) => {
        const form = new FormData();
        for (const f of files) form.append('file', f, f.name);
        return request<Artifact[]>(`chats/${enc(id)}/files`, { method: 'POST', body: form });
    },
    /** Inputs and outputs of the chat. */
    artifacts: (id: string) =>
        request<Artifact[]>(`chats/${enc(id)}/artifacts`).then((l) => (Array.isArray(l) ? l : [])),
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
    /** Internet access of the sandbox; immediate for an active chat, otherwise on the next resume. */
    setInternet: (id: string, enabled: boolean) => post<Chat>(`chats/${enc(id)}/internet`, { enabled }),
    /** Automatic compaction on or off. */
    setAutoCompact: (id: string, enabled: boolean) => post<Chat>(`chats/${enc(id)}/autocompact`, { enabled }),
    abort: (id: string) => post<Chat>(`chats/${enc(id)}/abort`),
    /**
     * Resumes a chat the gateway let idle, in the background (gateway issue #31); returns at once, steps via SSE
     * "resume". Harmless for an active, running, starting or resuming chat. 404 on a gateway without the route.
     */
    resume: (id: string) => post<Chat>(`chats/${enc(id)}/resume`),
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
    /** Running foreground commands (bash) that can be stopped or moved to the background. */
    runningTools: (id: string) =>
        request<{ tool_call_ids?: string[] | null }>(`chats/${enc(id)}/tools/running`).then((r) =>
            Array.isArray(r?.tool_call_ids) ? r.tool_call_ids : [],
        ),
    /** Stops a running bash command; the agent gets "Command stopped by the user" and continues (404: not running). */
    stopTool: (id: string, toolCallId: string) =>
        post<{ ok: boolean }>(`chats/${enc(id)}/tools/${enc(toolCallId)}/stop`),
    /** Turns a running bash command into a background task (404: no longer running, 409: at the limit). */
    backgroundTool: (id: string, toolCallId: string) =>
        post<BackgroundTask>(`chats/${enc(id)}/tools/${enc(toolCallId)}/background`),
    background: (id: string) =>
        request<BackgroundTask[]>(`chats/${enc(id)}/background`).then((l) => (Array.isArray(l) ? l : [])),
    /** Ends a running background task (409: not running, 404: unknown). */
    stopBackground: (id: string, bg: string) => post<BackgroundTask>(`chats/${enc(id)}/background/${enc(bg)}/stop`),
    /** Model calls recorded at the LLM proxy (incl. subagents), for the cost per subagent run. */
    llmCalls: (id: string) =>
        request<LLMCall[]>(`chats/${enc(id)}/llm_calls`).then((l) => (Array.isArray(l) ? l : [])),
    pendingApprovals: () => request<Approval[]>('approvals?state=pending'),
    /** Platform calls of the user's chats across all chats (query from activityQuery); 404 on older gateways. */
    activity: (query: string) => request<ActivityPage>(`activity${query}`),
    decide: (id: string, approve: boolean) => post<Approval>(`approvals/${enc(id)}`, { approve }),
};

/** Download address of an artifact (the gateway serves it as attachment). */
export const artifactUrl = (chatId: string, name: string, kind: ArtifactKind = 'output') =>
    `${API}/chats/${enc(chatId)}/artifacts/${enc(name)}?kind=${kind}`;

/** Display image of an answer: path in the sandbox and ID of the answer (images.ts). */
export const imageUrl = (chatId: string, path: string, msg: string) =>
    `${API}/chats/${enc(chatId)}/images?path=${enc(path)}&msg=${enc(msg)}`;

export const eventsUrl = (chatId: string) => `${API}/chats/${enc(chatId)}/events`;

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
