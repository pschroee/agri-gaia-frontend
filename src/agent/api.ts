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
    SubagentMessage,
    SubagentMessageMode,
    SubagentRunMeta,
    SubagentRunSummary,
    ToolExecution,
    TrashList,
    Variant,
} from './types';

import type { Plan } from './plan';
import type { Search, SearchBudget } from './experiments';
import type { WatchJob } from './jobs';
import type { UploadEntry } from './uploads';

import { AGENT_BASE } from './login';
import { type PageContext, pageOnly, wireContext } from './pageContext';

export { AGENT_BASE, interactiveLoginUrl } from './login';

const API = `${AGENT_BASE}/api`;

export const agentEnabled = import.meta.env.VITE_AGENT_ENABLED === 'true';

export class AgentApiError extends Error {
    readonly status: number;
    readonly code?: string;
    /** Machine-readable details, e.g. ContextTooLarge with code "context_too_large". */
    readonly details?: unknown;
    /**
     * 409 summary_changed (gateway issue L2/#119): the approval with the newly read summary and the one as proposed.
     * It stays pending, so the card shows both and the next click decides.
     */
    readonly approval?: Approval;
    constructor(status: number, message: string, code?: string, details?: unknown, approval?: Approval) {
        super(message);
        this.name = 'AgentApiError';
        this.status = status;
        this.code = code;
        this.details = details;
        this.approval = approval;
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
        let approval: Approval | undefined;
        try {
            const body = (await res.json()) as {
                error?: string;
                code?: string;
                details?: unknown;
                approval?: Approval;
            };
            if (body?.error) message = body.error;
            code = body?.code;
            details = body?.details;
            approval = body?.approval;
        } catch {
            // response without JSON body
        }
        throw new AgentApiError(res.status, message, code, details, approval);
    }
    // 204 No Content (delete) has no body
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
}

const post = <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

const enc = encodeURIComponent;

/**
 * Did a gateway before issue #45 refuse the list form of a page context? It decodes the context strictly and answers
 * 400 naming the unknown field `objects`.
 */
export function isOldGatewayRefusal(e: unknown, sent: PageContext): boolean {
    return (
        !!sent.objects?.length &&
        e instanceof AgentApiError &&
        e.status === 400 &&
        e.message.includes('unknown field "objects"')
    );
}

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
    /** The list of every file of an upload approval (gateway issue #164); not part of the approval itself. */
    approvalUploads: (chatId: string, approvalId: string) =>
        request<{ entries: UploadEntry[] }>(`chats/${enc(chatId)}/approvals/${enc(approvalId)}/uploads`),
    /** The list of every file of an upload step of a plan (gateway issue #172); not part of the plan itself. */
    planStepUploads: (chatId: string, planId: string, step: number) =>
        request<{ entries: UploadEntry[] }>(`chats/${enc(chatId)}/plans/${enc(planId)}/steps/${step}/uploads`),
    createChat: (req: CreateChatRequest) => post<Chat>('chats', req),
    /**
     * Sends a message; attachments: names of inputs uploaded before (400 for unknown names); context: the page the
     * user is on (pageContext.ts; the gateway refuses anything outside its lists with 400).
     */
    sendMessage: async (id: string, text: string, attachments: string[] = [], context?: PageContext) => {
        const send = (ctx?: PageContext) =>
            post<SendResult>(`chats/${enc(id)}/messages`, {
                text,
                ...(attachments.length > 0 ? { attachments } : {}),
                ...(ctx ? { context: ctx } : {}),
            });
        const wire = context && wireContext(context);
        try {
            return await send(wire);
        } catch (e) {
            // a gateway before issue #45 knows only one object: send the page alone rather than one of the selection
            if (wire && isOldGatewayRefusal(e, wire)) return send(pageOnly(wire));
            throw e;
        }
    },
    /** Uploads files for the agent (inputs, mirrored to /workspace/inputs/); limit artifact_max_mb per file. */
    uploadFiles: (id: string, files: File[]) => {
        const form = new FormData();
        for (const f of files) form.append('file', f, f.name);
        return request<Artifact[]>(`chats/${enc(id)}/files`, { method: 'POST', body: form });
    },
    /**
     * Uploads one file and reports the share sent so far (0 to 1) for its tile (issue #54). fetch cannot report
     * upload progress, so this goes through XMLHttpRequest; errors are the same AgentApiError as `request`'s.
     * `signal` cancels the upload (the cross on the tile, gateway issue L4/#121): the request is aborted and the
     * promise rejects with code "cancelled".
     */
    uploadFile: (id: string, file: File, onProgress: (share: number) => void, signal?: AbortSignal) =>
        new Promise<Artifact[]>((resolve, reject) => {
            if (signal?.aborted) {
                reject(new AgentApiError(0, 'Upload cancelled', 'cancelled'));
                return;
            }
            const form = new FormData();
            form.append('file', file, file.name);
            const xhr = new XMLHttpRequest();
            // the listener goes away with the request, so the signal does not pile up controllers
            const onAbort = () => xhr.abort();
            signal?.addEventListener('abort', onAbort);
            const done = <T,>(f: (v: T) => void) => (v: T) => {
                signal?.removeEventListener('abort', onAbort);
                f(v);
            };
            xhr.open('POST', `${API}/chats/${enc(id)}/files`);
            xhr.withCredentials = true;
            xhr.setRequestHeader('Accept', 'application/json');
            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable && e.total > 0) onProgress(e.loaded / e.total);
            };
            xhr.onerror = done(() => reject(new AgentApiError(0, 'Network error')));
            xhr.onabort = done(() => reject(new AgentApiError(0, 'Upload cancelled', 'cancelled')));
            xhr.onload = done(() => {
                let body: unknown;
                try {
                    body = JSON.parse(xhr.responseText);
                } catch {
                    // response without JSON body
                }
                if (xhr.status >= 200 && xhr.status < 300) {
                    onProgress(1);
                    resolve(Array.isArray(body) ? (body as Artifact[]) : []);
                    return;
                }
                const b = (body ?? {}) as { error?: string; code?: string; details?: unknown };
                reject(
                    new AgentApiError(xhr.status, b.error || `${xhr.status} ${xhr.statusText}`, b.code, b.details),
                );
            });
            xhr.send(form);
        }),
    /**
     * Takes back an input that was not sent with a message (gateway issue L4/#121): row, file and the mirror in the
     * sandbox go away, so the agent does not see a file the user discarded. 404 for an unknown name, 409
     * code "already_sent" for a file that went with a message (that one belongs to the history).
     */
    removeInput: (id: string, name: string) =>
        request<void>(`chats/${enc(id)}/inputs/${enc(name)}`, { method: 'DELETE' }),
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
    /** Model calls recorded at the LLM proxy (incl. subagents), for the tokens per subagent run. */
    llmCalls: (id: string) => request<LLMCall[]>(`chats/${enc(id)}/llm_calls`).then((l) => (Array.isArray(l) ? l : [])),
    /** Short list of a chat's subagent runs; reading it does not wake the chat (gateway issue #60). */
    subagentRuns: (id: string) =>
        request<SubagentRunSummary[]>(`chats/${enc(id)}/subagent-runs`).then((l) => (Array.isArray(l) ? l : [])),
    /**
     * Message from the user to a subagent (gateway issue #81). 202 with the recorded message and its mode: steer to a
     * running run, resume or restart for a finished one. 409 codes: foreground_run, message_pending, subagent_limit,
     * chat_in_trash, not_resumable, subagents_unavailable; 429 when there are too many messages in an hour.
     */
    sendSubagentMessage: (id: string, run: string, text: string) =>
        post<{ message: SubagentMessage; mode: SubagentMessageMode }>(
            `chats/${enc(id)}/subagent-runs/${enc(run)}/messages`,
            { text },
        ),
    /**
     * Stops one running subagent without stopping the chat (gateway issue #120). 202 with the run, which carries
     * `stopped_by: "user"` and goes out over SSE as well. 404 foreign, unknown or unsafe run; 409 with `code`
     * `not_running`, `chat_in_trash` or `subagents_unavailable` (or the code pi-subagents answered with).
     */
    stopSubagent: (id: string, run: string) =>
        post<{ run: SubagentRunMeta }>(`chats/${enc(id)}/subagent-runs/${enc(run)}/stop`),
    /** Moves a chat to the trash: stops its work, keeps its history (issue #76). Idempotent. */
    trashChat: (id: string) => post<Chat>(`chats/${enc(id)}/trash`),
    /** Takes a chat back out of the trash; it does not wake up. */
    restoreChat: (id: string) => post<Chat>(`chats/${enc(id)}/restore`),
    /** Deletes a chat for good; the gateway answers 409 unless it is in the trash. */
    deleteChat: (id: string) => request<void>(`chats/${enc(id)}`, { method: 'DELETE' }),
    /** The user's chats in the trash, newest first. */
    trash: () => request<TrashList>('trash'),
    /** Deletes every chat of the user in the trash for good. */
    emptyTrash: () => post<{ deleted: number }>('trash/empty'),
    /** The plans of a chat, oldest first (gateway issue #70); a gateway without the route answers 404. */
    plans: (id: string) => request<Plan[]>(`chats/${enc(id)}/plans`).then((l) => (Array.isArray(l) ? l : [])),
    /**
     * Autonomous plans: the user's own controls (gateway A-E1). The agent has no tool for any of them. 404 for an
     * unknown plan or a foreign chat, 409 when the plan is not in the state the control needs.
     */
    pausePlan: (id: string, plan: string) => post<Plan>(`chats/${enc(id)}/plans/${enc(plan)}/pause`),
    resumePlan: (id: string, plan: string) => post<Plan>(`chats/${enc(id)}/plans/${enc(plan)}/resume`),
    cancelPlan: (id: string, plan: string) => post<Plan>(`chats/${enc(id)}/plans/${enc(plan)}/cancel`),
    /**
     * Stops the platform job a waiting step of a plan observes (gateway A-E2, D2.9). 409 when the step does not
     * wait or its job cannot be stopped.
     */
    stopPlanStep: (id: string, plan: string, idx: number) =>
        post<Plan>(`chats/${enc(id)}/plans/${enc(plan)}/steps/${idx}/stop`),
    /** Observed platform jobs of a chat (gateway A-E2); 404 on gateways without the route. */
    jobs: (id: string) => request<WatchJob[]>(`chats/${enc(id)}/jobs`).then((l) => (Array.isArray(l) ? l : [])),
    /** Stops one observed job of a chat (gateway A-E2); 409 when it does not run or cannot be stopped. */
    stopJob: (id: string, job: string) => post<WatchJob>(`chats/${enc(id)}/jobs/${enc(job)}/stop`),
    /**
     * The user's own controls of a running training search (gateway issue #168). The agent has no tool for any of them.
     * 404 for a search of another chat, 409 when it is not running, 400 for a refused input; each answers the search.
     */
    stopSearch: (id: string, search: string, scope: 'trial' | 'search') =>
        post<Search>(`chats/${enc(id)}/searches/${enc(search)}/stop`, { scope }),
    searchBudget: (id: string, search: string, budget: SearchBudget) =>
        post<Search>(`chats/${enc(id)}/searches/${enc(search)}/budget`, budget),
    searchHint: (id: string, search: string, text: string) =>
        post<Search>(`chats/${enc(id)}/searches/${enc(search)}/hint`, { text }),
    adoptTrial: (id: string, search: string, trial: number) =>
        post<Search>(`chats/${enc(id)}/searches/${enc(search)}/adopt`, { trial }),
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

/** Export of a training search (gateway issue #168): the search, its trials, epochs and record as JSON, or one CSV row per trial. */
export const searchExportUrl = (chatId: string, search: string, format: 'json' | 'csv') =>
    `${API}/chats/${enc(chatId)}/searches/${enc(search)}/export?format=${format}`;

/** Stream of the approvals across all the user's chats (gateway issue #32; approvalFeed.ts). */
export const approvalEventsUrl = `${API}/events`;

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
