// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Subset of the agent gateway API types (agri-gaia-agent-gateway, API.md and web/src/api/types.ts),
// limited to what the platform UI shows.

export type VariantId = 'cli' | 'mcp' | 'api' | 'both';

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

export type Variant = { id: VariantId; label: string; tools: string[] };

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
    artifact_count: number;
    pending_approvals: number;
    resuming?: boolean;
    /** Queued messages not yet delivered. */
    queued?: number;
    /** Queued entries are not sent on their own (after an abort, for a dormant chat, above a turn limit). */
    queue_held?: boolean;
    /** Why the queue is held (only for an active chat with queue_held). */
    hold_reason?: HoldReason;
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
};

/** SSE event "queue": new state of the queue after a change. */
export type QueueEvent = {
    entries: QueueEntry[];
    change: 'queued' | 'removed' | 'delivered' | 'restored' | 'dropped';
    ids?: string[];
    text?: string;
};

export type TextContent = { type: 'text'; text: string };
/** Thinking of the model; redacted blocks carry no readable text. */
export type ThinkingContent = { type: 'thinking'; thinking: string; redacted?: boolean };
export type ToolCallContent = { type: 'toolCall'; id: string; name: string; arguments: unknown };
export type ImageContent = { type: 'image'; data?: string; mimeType?: string };
export type ContentBlock = TextContent | ThinkingContent | ToolCallContent | ImageContent;

export type PiMessage = {
    role: string;
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

export type ChatDetail = {
    chat: Chat;
    messages: StoredMessage[];
    approvals: Approval[];
    socket_calls: SocketCall[];
    /** Open entries of the queue. */
    queue?: QueueEntry[];
};

export type CreateChatRequest = {
    model?: string;
    variant?: VariantId;
    title?: string;
    message?: string;
    delegation?: Delegation;
    /** Preferred language of the browser (BCP 47, navigator.language); the agent uses it only when a message shows no clear language. */
    language?: string;
};

export type Me = { mode: 'token' | 'oidc'; sub?: string; username?: string; name?: string };

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
};

export type SendResult = { ok: boolean; resumed: boolean; queued?: boolean; queue_id?: string };

export type PiEvent = { type: string; [key: string]: unknown };

export type ServerEvent =
    | { kind: 'pi'; data: PiEvent }
    | { kind: 'chat'; data: Chat }
    | { kind: 'approval'; data: Approval }
    | { kind: 'socket_call'; data: SocketCall }
    | { kind: 'tool_execution'; data: ToolExecution }
    | { kind: 'queue'; data: QueueEvent }
    | { kind: 'resume'; data: ResumeStep }
    | { kind: 'auto_held'; data: { reason: 'wake_limit' | 'auto_turns'; limit: number; count: number } }
    | { kind: 'error'; data: { message: string } }
    | { kind: string; data: unknown };
