// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import type { PageContext } from './pageContext';
import type { NotebookApprovalData } from './notebook';
// Subset of the agent gateway API types (agri-gaia-agent-gateway, API.md and web/src/api/types.ts),
// limited to what the platform UI shows.

/**
 * Connection of a chat to the platform: a combination of cli, mcp and api as the gateway's canonical key ('cli',
 * 'cli,api', 'cli,mcp,api'), or 'both' (= cli,mcp) for chats from before gateway issue #29.
 */
export type VariantId = string;

/** Prices in US dollars per 1 M tokens (for DeepSeek the peak tariff, see Tariff). */
export type Pricing = {
    input: number;
    output: number;
    cache_read: number;
    cache_write: number;
    currency: 'USD';
    note?: string;
};

/** Tariff with peak hours (UTC); outside them offpeak_factor applies to the prices in Pricing. */
export type Tariff = {
    peak_windows_utc: { days: string; from: string; to: string }[];
    offpeak_factor: number;
    note?: string;
};

export type Model = {
    id: string;
    provider: string;
    model: string;
    name: string;
    default: boolean;
    pricing?: Pricing;
    tariff?: Tariff;
    /** Is the peak tariff in effect right now? */
    peak_now?: boolean;
    /** Context window in tokens (0 or missing: unknown). */
    context_window?: number;
};

/** Details of a refused model switch (409 "context_too_large"): limit = context window minus reserve. */
export type ContextTooLarge = { model: string; tokens: number; window: number; limit: number };

export type Variant = {
    id: VariantId;
    label: string;
    /** The bindings of the combination in the order cli, mcp, api (newer gateways). */
    bindings?: string[];
    tools: string[];
    /** The combination every new chat gets (AGW_TOOLSETS of the gateway). */
    active?: boolean;
};

export type Tokens = { input: number; output: number; cache_read: number; total: number };

/**
 * Context usage according to pi (gateway API.md). tokens and percent are null right after a compaction until the
 * next answer measures again. From threshold_tokens (window minus reserve_tokens) on, pi compacts automatically.
 */
export type ContextUsage = {
    tokens: number | null;
    window: number;
    percent: number | null;
    threshold_tokens: number;
    reserve_tokens: number;
    keep_recent_tokens: number;
    updated_at: string;
};

/** Token usage of an assistant message as pi stores it; cost.total is pi's flat price. */
export type Usage = {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    totalTokens?: number;
    cost?: { total?: number };
};

export type Chat = {
    id: string;
    title: string;
    model: string;
    variant: VariantId;
    state: 'active' | 'dormant';
    running: boolean;
    running_since?: string;
    internet: boolean;
    /** pi's thinking level (effort); missing until the gateway has read it. */
    thinking_level?: string;
    /** Thinking levels pi reports for the chat's model; missing or empty while unknown. */
    thinking_levels?: string[];
    /** Model the chat switches to after the running compaction. */
    pending_model?: string;
    owner?: string;
    /** Preferred language of the browser given at creation (BCP 47); absent without one. */
    language?: string;
    created_at: string;
    updated_at: string;
    tokens: Tokens;
    /** US dollars by tariff, from the calls recorded at the LLM proxy (incl. subagents and compactions). */
    cost: number;
    /** Share of cost outside the main session's answers (subagents, compaction, direct calls). */
    cost_other?: number;
    /** Model calls recorded at the LLM proxy. */
    llm_calls?: number;
    /** Last known context usage (also for a dormant chat). */
    context?: ContextUsage;
    /** Automatic compaction is on. */
    auto_compact?: boolean;
    /** Compactions so far. */
    compactions?: number;
    /** At most this many subagents at the same time; fixed in the gateway, the same for every chat. */
    max_subagents?: number;
    /** Subagent runs started so far. */
    subagents?: number;
    /** Subagents running right now according to the gateway's monitoring (gateway PR for issue #24). */
    subagents_running?: number;
    artifact_count: number;
    pending_approvals: number;
    /** Moved to the trash (issue #76): not in the history or the chat selector; read-only until restored. */
    trashed_at?: string;
    resuming?: boolean;
    /**
     * A new chat created with `async` waits for its first sandbox (gateway issue #30); `resuming` is set as well. A
     * message sent meanwhile goes out once the sandbox is there.
     */
    starting?: boolean;
    /** Queued messages not yet delivered. */
    queued?: number;
    /** Queued entries are not sent on their own (after an abort, for a dormant chat, above a turn limit). */
    queue_held?: boolean;
    /** Why the queue is held (only for an active chat with queue_held). */
    hold_reason?: HoldReason;
    /** Running background tasks. */
    background_running?: number;
};

export type HoldReason = 'abort' | 'wake_limit' | 'auto_turns';

/**
 * Whether the user can write to a subagent run now (gateway issue #82): ok (yes), starting (a run that has not
 * reported its pi-subagents ID yet), foreground (runs inside a step of the main agent), ended, unavailable.
 */
export type SubagentMessageState = 'ok' | 'starting' | 'foreground' | 'ended' | 'unavailable';

/**
 * Message queued by the gateway while the agent works. kind "system": a note of the gateway (note
 * "background" or "sandbox", refs the tasks concerned), not from the user.
 */
export type QueueEntry = {
    id: string;
    chat_id: string;
    text: string;
    attachments: string[];
    created_at: string;
    kind: 'user' | 'system';
    note?: string;
    refs?: string[];
    /** Note "subagent_user": readable part (issue #82); missing on entries from older gateways. */
    subagent?: { run_id: string; agent?: string; text_head: string };
    /** Page context the user sent the message with (user entries; gateway API.md, *Page context*). */
    context?: PageContext;
};

/** SSE event "queue": new state of the queue after a change. */
export type QueueEvent = {
    entries: QueueEntry[];
    change: 'queued' | 'removed' | 'delivered' | 'restored' | 'dropped';
    ids?: string[];
    text?: string;
};

/**
 * Queued entries the gateway handed to pi as one message whose user message pi has not reported yet (steered in
 * while a tool runs, or on their way while the chat resumes); `queue_delivered` of GET /chats/{id}, same content as
 * the SSE event "queue" with change "delivered" (gateway API.md, "Queue").
 */
export type QueueDelivery = {
    ids: string[];
    /** The entries as they were queued, in order. */
    entries: QueueEntry[];
    /** The message as it went to pi. */
    text: string;
    delivered_at: string;
    /** Steered into the running turn: pi reads it after its current step. */
    steered?: boolean;
};

export type TextContent = { type: 'text'; text: string };
/** Thinking of the model; redacted blocks carry no readable text. */
export type ThinkingContent = { type: 'thinking'; thinking: string; redacted?: boolean };
export type ToolCallContent = { type: 'toolCall'; id: string; name: string; arguments: unknown };
export type ImageContent = { type: 'image'; data?: string; mimeType?: string };
export type ContentBlock = TextContent | ThinkingContent | ToolCallContent | ImageContent;

export type PiMessage = {
    role: string;
    /** ID of the answer at the provider; keys the answer's display images (images.ts). */
    responseId?: string;
    content?: string | ContentBlock[];
    toolCallId?: string;
    toolName?: string;
    /** Tool result: pi's structured details (the todo tool carries the whole task list here). */
    details?: unknown;
    isError?: boolean;
    errorMessage?: string;
    stopReason?: string;
    timestamp?: number;
    usage?: Usage;
    model?: string;
    /** Compaction entries (role "compaction"): why, and the size before and after. */
    reason?: string;
    tokensBefore?: number;
    estimatedTokensAfter?: number;
};

export type StoredMessage = {
    seq: number;
    role: string;
    message: PiMessage;
    /** US dollars by tariff at the time of the answer (answers only); authoritative over usage.cost. */
    cost?: number;
    /** The answer fell into peak hours. */
    peak?: boolean;
    created_at: string;
    turn_id?: number;
    trigger?: 'user' | 'queue' | 'wake';
    origin?: 'user' | 'system' | 'mixed';
    /** Parts of a user message in order (gateway notes and user text); set with origin system or mixed. */
    sources?: MessageSource[];
    /**
     * Why the turn this message belongs to was aborted (gateway issue #120), on every message of that turn. Missing
     * on rows from before this change and for turns that were not aborted (see AbortReason in transcript.ts).
     */
    abort_reason?: 'user' | 'trash' | 'time_limit' | 'turn_limit' | 'subagent_limit';
};

/** Part of a user message: a note of the gateway (type background, sandbox, language) or user text. */
export type MessageSource = {
    kind: 'user' | 'system';
    type?: string;
    refs?: string[];
    queue_id?: string;
    /** Marker of the fence around sandbox data inside the note. */
    marker?: string;
    /** "agent": context for the model only (e.g. the preferred browser language); the chat does not show it. */
    audience?: 'agent';
    /** Type "page_context": the page context as structured data (not shown in the transcript); queue_id: its user entry. */
    context?: PageContext;
};

export type Approval = {
    id: string;
    chat_id: string;
    /** platform_write: name is "METHOD path", preview carries the JSON body. plan: name is "Plan with N steps" (older
     * gateways: "Plan: <title>"), size the number of steps, preview the plan (issue #70). */
    kind: 'artifact_upload' | 'internet_access' | 'platform_write' | 'plan';
    via: 'cli' | 'mcp';
    name: string;
    size: number;
    sha256: string;
    content_type: string;
    state: 'pending' | 'approved' | 'rejected' | 'expired';
    created_at: string;
    decided_at?: string;
    preview?: string;
    session?: string;
    tool_call_id?: string;
    /** platform_write: class of the call (gateway issue #63; missing on older entries). */
    effect?: 'read' | 'write' | 'compute' | 'irreversible';
    /**
     * platform_write and plan: what will happen, written by the gateway from the call and platform state, never by the
     * agent (gateway issue #72). First line the action, then one detail per line; missing on older entries.
     */
    summary?: string;
    /**
     * The same summary as it was proposed, and when a click on "Approve" found another platform state (gateway issue
     * L2/#119). The card shows the new summary with a hint and this one as "As proposed"; missing while nothing
     * changed. Only a pending approval can carry them.
     */
    summary_proposed?: string;
    summary_changed_at?: string;
    /**
     * platform_write of a run in the chat's notebook server (own code C-E4): the code of the run file by file, for
     * the card instead of the text of the preview. Everything in it comes from the gateway (the call and the files
     * the socket read), never from the agent's text; missing on older entries and on every other call.
     */
    notebook?: NotebookApprovalData;
};

/**
 * Entry of the socket log. For platform calls: op "platform", detail "METHOD path", result "ok 200",
 * "error 404", "rejected" (by the user), "violation blocked: …" (blocked by the delegation) or
 * "refused: …" (refused by the gateway).
 */
export type SocketCall = {
    id: number;
    chat_id?: string;
    slot_id: string;
    via: string;
    op: string;
    detail: string;
    result: string;
    created_at: string;
    session?: string;
    tool_call_id?: string;
    /** Platform calls: round trip to the platform in ms, without the approval's wait (missing: not measured). */
    duration_ms?: number;
    /** Platform calls: class of the call (gateway issue #63; missing on older entries). */
    effect?: 'read' | 'write' | 'compute' | 'irreversible';
};

/** Outcome of a platform call as the gateway classifies it (GET /activity). */
export type ActivityOutcome = 'ok' | 'error' | 'blocked' | 'logged' | 'rejected' | 'refused';

/** Kind of an entry of GET /activity; a gateway before issue #37 sends none (platform). */
export type ActivityKind = 'platform' | 'internet';

/**
 * Internet entry of GET /activity (gateway issue #37): the agent's request (with approval) or switch-off, or the
 * user's switch.
 */
export type ActivityInternet = {
    action: 'request' | 'off' | 'switch';
    origin: 'agent' | 'user';
    result: 'approved' | 'already_on' | 'rejected' | 'expired' | 'on' | 'off' | 'already_off' | 'error';
};

/**
 * Entry of GET /activity: a platform call with its outcome and the approval it waited for, or (kind internet) an
 * internet switch with the approval of a request.
 */
export type ActivityCall = SocketCall & {
    kind?: ActivityKind;
    /** Platform calls only. */
    outcome?: ActivityOutcome;
    /** Internet entries only. */
    internet?: ActivityInternet;
    approval?: { id: string; state: Approval['state']; created_at: string; decided_at?: string };
};

/** What the activity view gets of a chat. */
/** A chat as the activity table names it; `deleted` for a chat permanently deleted since (anonymised record, issue #76). */
export type ActivityChat = { id: string; title: string; model: string; variant: string; deleted?: boolean };

/** A chat in the trash (GET /api/trash, issue #76). `purge_at` only while a retention is configured. */
export type TrashEntry = {
    id: string;
    title: string;
    model: string;
    variant: VariantId;
    updated_at: string;
    trashed_at: string;
    messages: number;
    bytes: number;
    purge_at?: string;
};

/** The user's trash; `retention_days` 0 means chats stay until deleted by hand. */
export type TrashList = { retention_days: number; chats: TrashEntry[] };

/** Summary of all platform calls of the period (not limited by outcome or page; internet entries never count). */
export type ActivitySummary = {
    total: number;
    outcomes: Partial<Record<ActivityOutcome, number>>;
    /** Chats with at least one platform call. */
    chats: number;
    /** Requests to the agent in the same chats and period. */
    runs: number;
    duration: { count: number; avg_ms?: number; p95_ms?: number; max_ms?: number };
};

/** One page of GET /activity, newest first; next_before continues it. */
export type ActivityPage = {
    calls: ActivityCall[];
    chats: Record<string, ActivityChat>;
    next_before?: number;
    summary: ActivitySummary;
};

/** Operation the gateway ran for a tool in the execution sandbox. */
export type ToolExecution = {
    id: number;
    chat_id: string;
    session: string;
    tool_call_id: string;
    tool: string;
    op: string;
    args: Record<string, unknown>;
    exit_code?: number;
    error?: string;
    /** Beginning and end of the output, at most 4 KiB (NUL shows as "␀"). */
    output_excerpt?: string;
    /** SHA-256 of the whole output. */
    output_sha256?: string;
    output_bytes: number;
    started_at: string;
    duration_ms: number;
};

/**
 * File of a chat: `input` uploaded by the user (in the sandbox under /workspace/inputs/), `output` a result the agent
 * handed over (after approval). tool_call_id: the tool call that uploaded the result.
 */
export type Artifact = {
    chat_id: string;
    kind: ArtifactKind;
    name: string;
    size: number;
    sha256: string;
    content_type: string;
    created_at: string;
    via: 'cli' | 'mcp' | 'ui';
    tool_call_id?: string;
    /** How the file can be previewed, decided by the gateway from its bytes (issue #74); absent for older artifacts. */
    preview?: 'image' | 'pdf' | 'table' | 'text' | 'none';
    /**
     * Inputs only (gateway issue L4/#121): when the file went with a message; absent while it is only staged in the
     * field and can still be taken back (DELETE chats/{id}/inputs/{name}).
     */
    sent_at?: string;
};

export type ArtifactKind = 'input' | 'output';

export type ChatDetail = {
    chat: Chat;
    messages: StoredMessage[];
    /** Inputs and outputs of the chat. */
    artifacts?: Artifact[];
    approvals: Approval[];
    socket_calls: SocketCall[];
    /** Open entries of the queue. */
    queue?: QueueEntry[];
    /** Handed to pi but not read yet, oldest first; missing on gateways before issue #21. */
    queue_delivered?: QueueDelivery[];
    /** Background tasks of the chat by seq. */
    background?: BackgroundTask[];
    /** Entries from the session files of the subagents. */
    subagent_entries?: SubagentEntry[];
    /** Name and state of the subagent runs (status files of pi-subagents). */
    subagent_runs?: SubagentRunMeta[];
    /** Messages the user wrote to subagents of this chat (gateway issue #81), oldest first. */
    subagent_messages?: SubagentMessage[];
};

/**
 * Message the user wrote to a subagent (gateway issue #81, table subagent_messages): recorded by the gateway before it
 * is sent, so this is the only source of the "You" bubbles in a subagent's view. `steer`: to a running run, read after
 * its current step; `resume` or `restart`: a new run continues the earlier one (`target_run_id`).
 */
export type SubagentMessageMode = 'steer' | 'resume' | 'restart';
export type SubagentMessageStatus = 'sending' | 'sent' | 'delivered' | 'failed';
export type SubagentMessage = {
    id: number;
    /** The run the message was addressed to (the root of its thread or a continuation). */
    run_id: string;
    /** The new run of a resume or restart. */
    target_run_id?: string;
    ref: string;
    mode: SubagentMessageMode;
    text: string;
    status: SubagentMessageStatus;
    error?: string;
    created_at: string;
    delivered_at?: string;
};

/** State of a background task (gateway API.md, *Background tasks*). */
export type BackgroundState = 'running' | 'exited' | 'failed' | 'timeout' | 'stopped' | 'lost' | 'suspended' | 'closed';

/** Background task: a command the agent started with bash and run_in_background (or the user moved there). */
export type BackgroundTask = {
    /** "bg-<seq>", consecutive per chat. */
    id: string;
    seq: number;
    chat_id: string;
    /** "main" or the run of the subagent that started it. */
    session: string;
    tool_call_id: string;
    command: string;
    cwd?: string;
    log_path: string;
    state: BackgroundState;
    exit_code?: number;
    error?: string;
    stopped_by?: 'agent' | 'user' | string;
    started_at: string;
    ended_at?: string;
    output_bytes: number;
    output_lines: number;
    /** Latest output (at most 4 KiB). */
    tail?: string;
    notified_at?: string;
    woke?: boolean;
    notice_pending?: boolean;
};

/** SSE event "background": output at most every 2 s per task. */
export type BackgroundEvent = { change: 'started' | 'output' | 'ended'; task: BackgroundTask };

/**
 * `user_echo`: a user message of the subagent's session that carries a relay reference (issue #81); the view hides it and
 * shows the gateway's SubagentMessage instead.
 */
export type SubagentEntryKind = 'task' | 'tool_call' | 'tool_result' | 'text' | 'user_echo';

/**
 * Entry from a subagent's session file (sandbox, not tamper-proof); confirmed: its response is recorded at the
 * LLM proxy.
 */
export type SubagentEntry = {
    chat_id: string;
    run_id: string;
    entry_id: string;
    agent: string;
    kind: SubagentEntryKind;
    payload: {
        text?: string;
        name?: string;
        arguments?: string;
        is_error?: boolean;
        id?: string;
        tool_call_id?: string;
        /** Relay reference of a user_echo (issue #81). */
        relay_ref?: string;
    };
    response_id?: string;
    confirmed: boolean;
    created_at: string;
};

/** Name and state of a subagent run (status files of pi-subagents); label: the name in the workflow. */
export type SubagentRunMeta = {
    chat_id: string;
    run_id: string;
    agent: string;
    label?: string;
    /** State according to pi-subagents: running, complete, failed, cancelled … */
    state?: string;
    pi_run_id?: string;
    /** Whether the user can write to the run now (issue #82). */
    message_state?: SubagentMessageState;
    parent_run_id?: string;
    /** The run this one continues (a resume or restart after a message, issue #81); set by the gateway only. */
    continues_run_id?: string;
    /**
     * Who stopped the run (gateway issue #120): "user" over the stop route, "limit" when the orchestrator ended it
     * because too many subagents ran at the same time. Missing: not stopped, or no reason recorded.
     */
    stopped_by?: string;
    started_at?: string;
    ended_at?: string;
    updated_at: string;
};

/**
 * Short form of a subagent run from `GET /chats/{id}/subagent-runs` (gateway issue #60): enough for the title and the
 * state of a sub-entry in the chat selector without opening (and waking) the chat.
 */
export type SubagentRunSummary = {
    run_id: string;
    agent: string;
    label?: string;
    /** State according to pi-subagents; missing: estimated from last_kind and last_at. */
    state?: string;
    /** First lines of the run's first task (at most 8 lines, 500 bytes), for runTitle. */
    task_head?: string;
    started_at?: string;
    ended_at?: string;
    /** Newest entry (or the end) and its kind. */
    last_at?: string;
    last_kind?: SubagentEntry['kind'];
    entries: number;
    /** The run this one continues (issue #81); such a run is shown as part of its thread, not as a sub-entry. */
    continues_run_id?: string;
    /** Whether the user can write to the run now (issue #82). */
    message_state?: SubagentMessageState;
    /** Who stopped the run (gateway issue #120): "user" or "limit". The history tells "stopped" from "ended" by it. */
    stopped_by?: string;
};

/** Model call recorded at the LLM proxy (subset); main: the main session's answer, otherwise subagent or compaction. */
export type LLMCall = {
    id: number;
    model: string;
    response_id: string;
    input: number;
    output: number;
    cache_read: number;
    cost: number;
    peak: boolean;
    started_at: string;
    duration_ms: number;
    main: boolean;
    /** Tool calls the model asked for; `id` is the provider's tool_calls[].id (matches ActivityCall.tool_call_id). */
    tool_calls?: { id?: string; name: string; arguments?: string }[] | null;
    /** Size in bytes of the request body sent to the provider (gateway issue #69); missing on older entries. */
    request_bytes?: number;
};

export type CreateChatRequest = {
    model?: string;
    title?: string;
    message?: string;
    /** Preferred language of the browser (BCP 47, navigator.language); the agent uses it only when a message shows no clear language. */
    language?: string;
    /**
     * Return at once even when the pool has no free slot: the chat then comes back with `starting` and gets its
     * sandbox in the background (gateway issue #30). With a free slot the chat comes back ready.
     */
    async?: boolean;
};

/** Defaults and limits of the gateway (GET /config), the subset the platform UI uses. */
export type Config = {
    internet_default?: boolean;
    auto_compact_default?: boolean;
    /** Subagents at the same time per chat, fixed in the gateway (since the fix for issue #24). */
    max_subagents?: number;
    /** Older gateways: default and upper bound of the former per-chat setting; newer ones send max_subagents. */
    max_subagents_default?: number;
    max_subagents_limit?: number;
    /** Size limit per uploaded or handed-over file in MB (AGW_ARTIFACT_MAX_MB). */
    artifact_max_mb?: number;
    /** An approval expires after this many seconds. */
    approval_timeout_s?: number;
    /** An idle chat rests (releases its sandbox) after this many seconds. */
    idle_timeout_s?: number;
    /** Connection of every new chat, fixed by the gateway (AGW_TOOLSETS); missing from older gateways. */
    toolsets?: Variant;
};

export type Me = { mode: 'token' | 'oidc'; sub?: string; username?: string; name?: string };

/** What a slot's agent is doing right now (GET /pool). */
export type SlotActivity = {
    kind:
        | 'idle'
        | 'thinking'
        | 'writing'
        | 'tool'
        | 'waiting_approval'
        | 'starting'
        | 'preparing'
        | 'compacting'
        | string;
    tool?: string;
    since: string;
};

/** Slot of the warm pool: idle (free), assigned (busy) or starting; other users' chats show without chat_id. */
export type Slot = {
    id: string;
    variant: VariantId;
    state: 'starting' | 'idle' | 'assigned' | 'stopping';
    container_id?: string;
    container_name?: string;
    image: string;
    exec_image?: string;
    created_at: string;
    assigned_at?: string;
    chat_id?: string;
    chat_title?: string;
    activity?: SlotActivity;
    internet?: boolean;
};

/** Warm pool of the gateway (GET /pool): slots and the target size per variant. */
export type Pool = {
    slots: Slot[];
    targets: Partial<Record<VariantId, number>>;
    /** Key of the combination kept warm for new chats (AGW_TOOLSETS); missing from older gateways. */
    toolsets?: VariantId;
    totals?: { cost: number; tokens: Tokens; chats_active: number };
};

/** Binding of the gateway to the platform API (GET /platform). */
export type PlatformStatus = {
    configured: boolean;
    api_url?: string;
    /** user: every chat acts with its owner's login; account: one configured account. */
    login?: 'user' | 'account';
    account?: string;
    client_id?: string;
    token_exchange?: boolean;
    /** Unauthenticated request to the API base; any HTTP answer counts as reachable (cached 10 s). */
    probe?: { reachable: boolean; http_status?: number; latency_ms: number; error?: string; checked_at: string };
    /** Newest token exchange among the user's chats, also a failed one (in memory of the gateway only). */
    last_exchange?: { chat_id: string; at: string; ok: boolean; error?: string };
};

/** Phase of resuming a dormant chat in a fresh sandbox (SSE "resume", API.md), in this order. */
export type ResumePhase = 'acquire' | 'session' | 'settings' | 'workspace' | 'inputs' | 'ready' | 'failed';

/**
 * Step of resuming a dormant chat: per phase first status "running", then "done", "warning" (continued despite a
 * problem, detail names it) or "error". "ready" ends it (ms = total), "failed" too (detail = reason).
 */
export type ResumeStep = {
    /** ID of this resume. */
    id: string;
    phase: ResumePhase;
    status: 'running' | 'done' | 'warning' | 'error';
    detail?: string;
    size?: number;
    files?: number;
    at: string;
    ms?: number;
    /** The first sandbox of a new chat (created with `async`), not a resume of an idle chat. */
    start?: boolean;
};

export type SendResult = { ok: boolean; resumed: boolean; queued?: boolean; queue_id?: string };

/** Slash command (GET /chats/{id}/commands); `name` without the leading slash. */
export type Command = {
    name: string;
    description?: string;
    /** builtin: the gateway's own (/compact, /autocompact, /rename, /model, /effort); the others come from pi. */
    source: 'builtin' | 'extension' | 'prompt' | 'skill';
    /** Argument hint, e.g. "[instructions]" or "on|off". */
    args?: string;
    /** Possible arguments for completion (/model, /effort). */
    options?: CommandOption[];
};

export type CommandOption = { value: string; label?: string; current?: boolean };

export type PiEvent = { type: string; [key: string]: unknown };

export type ServerEvent =
    | { kind: 'pi'; data: PiEvent }
    | { kind: 'chat'; data: Chat }
    | { kind: 'approval'; data: Approval }
    | { kind: 'artifact'; data: Artifact }
    /** An input the user took back before sending it (gateway issue L4/#121); other views drop their card. */
    | { kind: 'artifact_removed'; data: { kind: ArtifactKind; name: string } }
    | { kind: 'socket_call'; data: SocketCall }
    | { kind: 'tool_execution'; data: ToolExecution }
    | { kind: 'queue'; data: QueueEvent }
    | { kind: 'background'; data: BackgroundEvent }
    | { kind: 'subagent'; data: SubagentEntry }
    | { kind: 'subagent_run'; data: SubagentRunMeta }
    | { kind: 'subagent_message'; data: SubagentMessage }
    | { kind: 'llm_call'; data: LLMCall }
    | { kind: 'resume'; data: ResumeStep }
    | { kind: 'auto_held'; data: { reason: 'wake_limit' | 'auto_turns'; limit: number; count: number } }
    | { kind: 'error'; data: { message: string } }
    | { kind: string; data: unknown };
