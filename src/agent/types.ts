// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import type { PageContext } from './pageContext';
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

/** Rule of a delegation: action on resource; without ids only for calls without an object. */
export type DelegationRule = { action: string; resource: string; ids?: string[] };

/** Rights handed to the agent for one chat. */
export type Delegation = {
    rules: DelegationRule[];
    expires_at?: string;
    /** false: violations are only logged. */
    enforce?: boolean;
    confirm?: 'writes' | 'none';
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
    delegation?: Delegation;
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
    /** Type "page_context": the page context as structured data (shown as "Refers to …"); queue_id: its user entry. */
    context?: PageContext;
};

export type Approval = {
    id: string;
    chat_id: string;
    /** platform_write: name is "METHOD path", preview carries the JSON body. */
    kind: 'artifact_upload' | 'internet_access' | 'platform_write';
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
};

/** Outcome of a platform call as the gateway classifies it (GET /activity). */
export type ActivityOutcome = 'ok' | 'error' | 'blocked' | 'logged' | 'rejected' | 'refused';

/** Platform call of GET /activity, with its outcome and the approval it waited for. */
export type ActivityCall = SocketCall & {
    outcome: ActivityOutcome;
    approval?: { id: string; state: Approval['state']; created_at: string; decided_at?: string };
};

/** What the activity view gets of a chat. */
export type ActivityChat = { id: string; title: string; model: string; variant: string; delegation?: Delegation };

/** Summary of all calls of the period (not limited by outcome or page). */
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

export type SubagentEntryKind = 'task' | 'tool_call' | 'tool_result' | 'text';

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
    parent_run_id?: string;
    started_at?: string;
    ended_at?: string;
    updated_at: string;
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
};

export type CreateChatRequest = {
    model?: string;
    title?: string;
    message?: string;
    delegation?: Delegation;
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
    | { kind: 'socket_call'; data: SocketCall }
    | { kind: 'tool_execution'; data: ToolExecution }
    | { kind: 'queue'; data: QueueEvent }
    | { kind: 'background'; data: BackgroundEvent }
    | { kind: 'subagent'; data: SubagentEntry }
    | { kind: 'subagent_run'; data: SubagentRunMeta }
    | { kind: 'llm_call'; data: LLMCall }
    | { kind: 'resume'; data: ResumeStep }
    | { kind: 'auto_held'; data: { reason: 'wake_limit' | 'auto_turns'; limit: number; count: number } }
    | { kind: 'error'; data: { message: string } }
    | { kind: string; data: unknown };
