// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import type { ActivityGrant, InternetApproval, InternetBlocked, InternetGrant } from './internet';
import type { PageContext } from './pageContext';
import type { NotebookApprovalData } from './notebook';
import type { SearchApproval } from './searchApproval';
import type { UploadManifest } from './uploads';
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
    /** The active internet grants with their counters (gateway issue #175); missing on an older gateway. */
    internet_grants?: InternetGrant[];
    /** Refusals of the chat since the oldest active grant (15 min back without one); missing when there are none. */
    internet_blocked?: InternetBlocked;
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

export type HoldReason = 'abort' | 'wake_limit' | 'auto_turns' | 'failed_calls';

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
    abort_reason?: 'user' | 'trash' | 'time_limit' | 'turn_limit' | 'subagent_limit' | 'failed_calls';
    /** What exactly stopped the turn, in a sentence (gateway issue #217, abort_reason failed_calls); missing otherwise. */
    abort_detail?: string;
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
    /** The user's hint for a training search (gateway issue #168): the message is shown with a "Hint" label. */
    search_hint?: { search_id: string };
};

export type Approval = {
    id: string;
    chat_id: string;
    /** platform_write: name is "METHOD path", preview carries the JSON body. plan: name is "Plan with N steps" (older
     * gateways: "Plan: <title>"), size the number of steps, preview the plan (issue #70). */
    kind: 'artifact_upload' | 'internet_access' | 'platform_write' | 'plan' | 'search';
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
    /** internet_access (gateway issue #175): what the user approves, built by the gateway; `preview` has it as text. */
    internet?: InternetApproval;
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
    /**
     * A training search (gateway issue #168), written by the gateway: on an approval of kind `search` the proposal (space,
     * budget, base or code, test set); on a `platform_write` approval of a notebook run of a search the code change (versions,
     * changed files, diffs). Missing on every other approval.
     */
    search?: SearchApproval;
    /**
     * platform_write that uploads files (gateway issue #164): number, size, folders, file types, the annotation file
     * and the SHA-256 over the list of every file. The list itself is not part of the approval — the card fetches it
     * (agentApi.approvalUploads) when the user opens it; missing on older entries and on every other call.
     */
    uploads?: UploadManifest;
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
    /** `end`: a grant ended (issue #175); `request` also covers requests the gateway refused. */
    action: 'request' | 'off' | 'switch' | 'end';
    /** `system`: a grant ended by itself (time, data limit, packages installed). */
    origin: 'agent' | 'user' | 'system';
    /** An end reason (`time`, `bytes`, `installed`, `user`, `agent`, `error`) for action `end`. */
    result:
        | 'approved'
        | 'already_on'
        | 'rejected'
        | 'expired'
        | 'refused'
        | 'on'
        | 'off'
        | 'already_off'
        | 'error'
        | 'time'
        | 'bytes'
        | 'installed'
        | 'user'
        | 'agent';
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
    /** Internet entries: the grant the entry belongs to (absent for a refused request). */
    grant?: ActivityGrant;
    /** The user's switch-off: the grants it ended (issue #185); their single end entries are not listed. */
    ended?: ActivityGrant[];
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

/** SSE failed_calls_limit (gateway issue #217): the gateway stopped the chat after too many failed tool calls in a row. */
export type FailedCallsStop = {
    scope: 'tool' | 'total';
    tool: string;
    count: number;
    limit: number;
    last_error: string;
    detail: string;
};

/** Defaults and limits of the gateway (GET /config), the subset the platform UI uses. */
export type Config = {
    internet_default?: boolean;
    auto_compact_default?: boolean;
    /** Subagents at the same time per chat, fixed in the gateway (since the fix for issue #24). */
    max_subagents?: number;
    /** Failed tool calls in a row after which the gateway stops the chat: all tools, and one tool; 0 = off (#217). */
    max_failed_tool_calls?: number;
    max_failed_same_tool?: number;
    /** Older gateways: default and upper bound of the former per-chat setting; newer ones send max_subagents. */
    max_subagents_default?: number;
    max_subagents_limit?: number;
    /** Size limit per uploaded or handed-over file in MB (AGW_ARTIFACT_MAX_MB). */
    artifact_max_mb?: number;
    /** An approval expires after this many seconds. */
    approval_timeout_s?: number;
    /** The longest a training search runs, in hours (the approval names it). */
    search_max_hours?: number;
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

// --- pre-annotation of a chat (gateway V1/V3, issue #112) ------------------------------------------------------
// The answer of GET /api/chats/{id}/annotation (`internal/api/annotation.go`): the runs and the jobs of a chat,
// each oldest first. The route reads the gateway's own tables and never calls CVAT, so it carries no count per
// class and no frame numbers (the agent's `annotation_summary` stays the source of the counts).

/** The answer of the annotation route; `cvat_url` is the base every link of the cards starts with. */
export type AnnotationAnswer = {
    /** Public address of CVAT (AGW_CVAT_PUBLIC_URL); empty when the setup runs no pre-annotation. */
    cvat_url: string;
    runs: AnnotationRun[];
    jobs: AnnotationJob[];
};

/** The states of a run (`store.AnnotationRun*`); `expired` means CVAT no longer has it. */
export type AnnotationRunState = 'queued' | 'running' | 'finished' | 'failed' | 'expired';

/** One pre-annotation run of a chat, as the route answers it. */
export type AnnotationRun = {
    run_id: string;
    /** The dataset whose task the run works on; the gateway stores the id, not the name. */
    dataset_id: number;
    task_id: number;
    /** Id of the pre-annotation function, which is its name (V2). */
    function: string;
    min_confidence: number;
    mapping: Record<string, string>;
    /** keep or replace; a run with replace wipes every annotation of the task (irreversible). */
    existing: string;
    state: AnnotationRunState;
    error?: string;
    /** The percent the watcher last wrote; absent while none was reported (a queued run). */
    progress?: number;
    message?: string;
    /** The tool call that started the run; empty when the watcher did not see it. */
    tool_call_id?: string;
    created_at: string;
    ended_at?: string;
    /** The task's address in CVAT; empty without a public address. */
    cvat_url?: string;
};

/** The kinds of an annotation job (`internal/annotation/job.go`). */
export type AnnotationJobKind = 'calibrate' | 'uncertain' | 'fill' | 'verify';

/** The states of an annotation job (`store.AnnotationJob*`); a job has no `expired`. */
export type AnnotationJobState = 'queued' | 'running' | 'finished' | 'failed';

/** One check or fill job of a chat, as the route answers it. */
export type AnnotationJob = {
    job_id: string;
    kind: AnnotationJobKind;
    dataset_id: number;
    task_id: number;
    function: string;
    state: AnnotationJobState;
    done: number;
    total: number;
    /** The call the agent made (limit, mapping, uncertain_below, min_confidence, source_id, final). */
    params?: AnnotationJobParams;
    /** The result a finished job wrote; its shape depends on `kind`. */
    result?: unknown;
    error?: string;
    /** The tool call that started the job; empty when the watcher did not see it. */
    tool_call_id?: string;
    created_at: string;
    ended_at?: string;
    cvat_url?: string;
};

/** The parameters a job was started with (`annotation.jobSpec`). */
export type AnnotationJobParams = {
    limit?: number;
    mapping?: Record<string, string>;
    /** The threshold of an uncertainty check, in whole percent. */
    uncertain_below?: number;
    /** The threshold a fill or a run used, in whole percent. */
    min_confidence?: number;
    /** The run or fill a verification judges. */
    source_id?: string;
    final?: boolean;
};

/** The answer of a finished calibrate job (`annotation.Calibration`). */
export type CalibrationResult = {
    /** How many manually annotated images were measured. */
    images: number;
    /** The proposed mapping of the function's labels onto the classes of the dataset. */
    mapping: Record<string, string>;
    /** Per label the function answered: how often which manual class stood on the same image. */
    confusion: Record<string, Record<string, number>>;
    /** Share of answered images the function gets right; null for a detector. */
    accuracy: number | null;
    /** The figures at the proposed threshold; null for a classification. */
    precision: number | null;
    recall: number | null;
    f1: number | null;
    /** The proposed threshold, in whole percent. */
    proposed_min_confidence: number;
    /** Share of the measured images the function answers at the proposed threshold. */
    coverage: number;
    note?: string;
};

/** One image a check was unsure about (`annotation.UncertainImage`). */
export type UncertainImage = {
    frame: number;
    /** The file name in CVAT; absent when CVAT did not give one. */
    file?: string;
    top_label: string;
    confidence: number;
    boxes: number;
    cvat_url?: string;
};

/** The answer of a finished uncertainty check (`annotation.uncertainAnswer`). */
export type UncertainResult = {
    /** How many images the check asked the function about. */
    checked: number;
    uncertain: UncertainImage[];
};

/** The answer of a finished fill (`annotation.fillAnswer`). */
export type FillResult = {
    /** Images the job wrote annotations on. */
    filled: number;
    /** Images it left alone because they carry an annotation. */
    skipped_annotated: number;
    /** Images the function answered nothing usable on. */
    empty_results: number;
};

/** One image worth a look (`annotation.SuspiciousImage`; V3b). */
export type SuspiciousImage = {
    frame: number;
    file?: string;
    /** Why the image stands there, in the gateway's words. */
    reason: string;
    cvat_url?: string;
};

/** What the automatic annotations look like against the manual ones (`annotation.Plausibility`). */
export type Plausibility = {
    filled_images: number;
    manual_images: number;
    class_share_auto: Record<string, number>;
    class_share_manual: Record<string, number>;
    /** How far the two distributions stand apart (half the sum of the absolute differences). */
    tvd: number;
    empty_share_auto: number;
    empty_share_manual: number;
    boxes_per_image_auto: number;
    boxes_per_image_manual: number;
    median_rel_area_ratio: number;
    /** The plausibility rests on the annotations of the whole task; false: none of them was registered. */
    measured: boolean;
};

/** The check a report compares itself with (`annotation.RoundComparison`, `assess.CheckComparison`). */
export type RoundComparison = {
    source_id: string;
    /** The correction round that figure belongs to; 0 is the initial pre-annotation. */
    round: number;
    verdict: string;
    accuracy?: number;
    macro_f1?: number;
    score: number;
};

/** The change against the round before (`annotation.RoundDelta`; V3c). */
export type RoundDelta = {
    score: number;
    accuracy?: number;
    macro_f1?: number;
    per_class_f1?: Record<string, number>;
};

/** The answer of a finished verify job (V3b/V3c); its shell is the report of `assess.Report`. */
export type VerifyResult = AssessReport & {
    /** The run or the fill this measurement judged. */
    source_id: string;
    calibration_images: number;
    per_class: Record<string, ClassFigures>;
    overall: Overall;
    plausibility: Plausibility;
    suspicious: SuspiciousImage[];
    /** The correction round (V3c); 0 or missing: the initial pre-annotation. */
    round?: number;
    previous?: RoundComparison;
    delta?: RoundDelta;
};

// --- result checks of a chat (gateway R0-R3, issue #112) ------------------------------------------------------

/** What a check measured (`assess.Kind*`). */
export type AssessKind = 'annotation' | 'training_model' | 'own_model' | 'deployment';

/**
 * The states of a check. `queued`, `running`, `finished` and `failed` are the gateway's own (`store.Assess*`);
 * `expired` is the card's: a tool call named a check that neither the route nor `assess_status` still knows, so
 * the card stands there without a report (issue #112, D16).
 */
export type AssessState = 'queued' | 'running' | 'finished' | 'failed' | 'expired';

/** What the gateway thinks of a result (`assess.Verdict`); empty in a partial report of a failed check. */
export type AssessVerdict = 'usable' | 'questionable' | 'not_measured' | '';

/** The one line the agent starts its reply with (`assess.Header`). */
export type AssessReport = {
    kind: string;
    verdict: AssessVerdict;
    /** The check measured at the hold-out set; false: it compared rounds (validation set). */
    final: boolean;
    /** What was measured: holdout, validation or synthetic. */
    set: string;
    /** The number of images or test requests behind the figures. */
    measured_images: number;
    image_review: ImageReview;
    /** Why the verdict is what it is, in the gateway's words; the first one stands in the header of a not measured
     * report and does not appear again under "Reasons". */
    reasons?: string[];
    hints?: string[];
    suggestions?: SuggestionText[];
    /** What was measured, per kind (`TrainingFigures`, `OwnModelFigures` or `DeploymentFigures`). */
    figures?: unknown;
    note?: string;
    header: string;
};

/** Whether a model looked at the pictures behind the measured task (`assess.ImageReview`). */
export type ImageReview = {
    done: boolean;
    model?: string;
    /** How many misclassified validation images the review should look at (R4); 0 otherwise. */
    of?: number;
    /** How many images the review gave a verdict for; 0 when no model looked at any. */
    checked?: number;
    /** How many checked images look mislabelled (R4); it never changes the verdict of the check. */
    flagged?: number;
    /** The share of the checked images the review complained about. */
    flagged_share?: number;
    /** Why no model looked at the images; empty when one did. */
    reason?: string;
};

/** What the agent may do about a questionable result (`assess.Suggestion`). */
export type SuggestionText = { id: string; text: string };

/** One step of a running check (`assess.ProgressStep`, R4): what it has counted and how long it ran. */
export type AssessProgressStep = {
    name: string;
    done: boolean;
    /** How long the step has run so far. */
    seconds?: number;
    /** The counted part ("image 3 of 12"). */
    k?: number;
    m?: number;
};

/** What a running check reports about itself (`assess.Progress`). */
export type AssessProgress = {
    /** The set it measures (holdout, validation, synthetic). */
    set?: string;
    images?: number;
    note?: string;
    /** The model of the image review while it runs (R4); empty: no image review runs. */
    review_model?: string;
    /** The steps of the check card, in order (R4); empty: the card shows an indeterminate bar. */
    steps?: AssessProgressStep[];
};

/** One line of GET /api/chats/{id}/assessments (`internal/api/assess.go`). */
export type AssessCheck = {
    check_id: string;
    kind: AssessKind;
    /** What was checked: model:<id>, sha:<hex> or deployment:<name>. */
    subject: string;
    final: boolean;
    state: AssessState;
    /** The whole report of the check; null while it runs or after it failed without a partial one. */
    report: AssessReport | null;
    /** Only while the check runs (a finished check's progress is stale). */
    progress?: AssessProgress;
    error?: string;
    /** The call that started the check, so the card can be placed in the history. */
    tool_call_id?: string;
    created_at: string;
    started_at?: string;
    ended_at?: string;
    /** For a check of a file (subject sha:<hex>): the model this file was uploaded as, once that happened. */
    uploaded_model?: { id: number; name?: string };
};

/** The answer of the check route. */
export type AssessAnswer = { checks: AssessCheck[] };

/** Figures of one class (`assess.ClassFigures`); precision is null when the class was never predicted. */
export type ClassFigures = {
    precision: number | null;
    recall: number;
    f1: number;
    /** Images (or objects) of this class in the measured set. */
    support: number;
    /** The figures of this class under their limit ("recall"); the card paints exactly these red. */
    below?: string[];
};

/** Confusion counts as the gateway sends them: true class, then predicted class, then the number of images. Zero cells may be left out. */
export type ConfusionCounts = Record<string, Record<string, number>>;

/** The figures over the whole measured set, with both values present (`assess.OverallFigures`). */
export type OverallFigures = { accuracy: number; macro_f1: number };

/** The same two values as the pre-annotation's report carries them (`assess.Overall`); either may be missing. */
export type Overall = { accuracy?: number; macro_f1?: number };

/** What the majority class reaches on the measured set (`assess.BaselineFigures`). */
export type BaselineFigures = {
    kind: string;
    class: string;
    accuracy: number;
    macro_f1: number;
    /** The tail probability of the one-sided binomial test "better than this baseline". */
    p_value: number;
};

/** What the model reaches on the images it saw (`assess.SeenSample`). */
export type SeenSample = { images: number; accuracy: number };

/** A structure of an id and a name (`assess.SubjectRef`, `assess.DatasetRef`, `assess.DeploymentRef`). */
export type NamedRef = { id: number; name: string };

/** What the training template measured itself (`assess.PlatformFigure`). */
export type PlatformFigure = { name: string; value: number; source: string; note: string };

/** The previous check a report compares itself with (`assess.CheckComparison`). */
export type CheckComparison = {
    check_id: string;
    model: NamedRef;
    verdict: string;
    accuracy: number;
    macro_f1: number;
};

/** Figures of a training check (R1, `assess.TrainingFigures`). */
export type TrainingFigures = {
    model: NamedRef;
    eval_dataset: NamedRef;
    seen_datasets?: NamedRef[];
    measured_images: number;
    per_class: Record<string, ClassFigures>;
    /** Confusion counts: true class -> predicted class -> images. Missing in reports from before the gateway sent it. */
    confusion?: ConfusionCounts;
    overall: OverallFigures;
    baseline: BaselineFigures;
    seen_sample: SeenSample;
    mapping?: Record<string, string>;
    /** The template's own figure; missing when the log was not read, null when it was read and carries none. */
    platform_figure?: PlatformFigure | null;
    log_nan?: boolean;
    previous?: CheckComparison;
    delta?: Record<string, number>;
};

/** The file an own-model check measured (`assess.FileRef`). */
export type FileRef = {
    name: string;
    sha256: string;
    /** The notebook run the file came out of; null without one. */
    run_id?: string | null;
    path?: string;
};

/** The preprocessing the check fed the model (`assess.PreprocessFigures`). */
export type PreprocessFigures = {
    color: string;
    size?: number[];
    scale: number;
    mean?: number[];
    std?: number[];
    layout: string;
    /** The agent named this preprocessing; false: it is the default of the platform templates. */
    declared: boolean;
};

/** One tensor the file declares (`assess.TensorInfo`). */
export type TensorInfo = { name: string; shape: number[]; type: string };

/** What the check found out about the file itself (`assess.BasicFigures`). */
export type BasicFigures = {
    loads: boolean;
    load_error?: string;
    inputs: TensorInfo[];
    outputs: TensorInfo[];
    /** The number of outputs the model shows (0: it is no classification). */
    classes: number;
    /** Different images gave different answers; null when fewer than two probe images could be run. */
    varied?: boolean | null;
    /** The derived class order is the one the agent declared; null without declared class names. */
    class_order?: boolean | null;
};

/** Figures of an own-model check (R2, `assess.OwnModelFigures`). */
export type OwnModelFigures = {
    file: FileRef;
    /** The model the file was uploaded as; null before the upload. */
    model?: NamedRef | null;
    eval_dataset: NamedRef;
    seen_datasets?: NamedRef[];
    measured_images: number;
    per_class: Record<string, ClassFigures>;
    confusion?: ConfusionCounts;
    overall: OverallFigures;
    baseline: BaselineFigures;
    seen_sample: SeenSample;
    mapping?: Record<string, string>;
    preprocess: PreprocessFigures;
    basic?: BasicFigures | null;
    previous?: CheckComparison;
    delta?: Record<string, number>;
};

/** The device a deployment runs on (`assess.DeviceRef`). */
export type DeviceRef = { name: string; simulated: boolean };

/** What one source says about the inputs and outputs of the model (`assess.SourceIO`). */
export type SourceIO = { inputs: TensorInfo[]; outputs: TensorInfo[] };

/** The comparison of the three sources (`assess.DeploymentIO`). */
export type DeploymentIO = { same: boolean; triton: SourceIO; platform: SourceIO; file: SourceIO };

/** What the gateway knows about the check of a model (`assess.ModelCheck`, R1.14). */
export type ModelCheck = {
    found: boolean;
    final: boolean;
    verdict?: string;
    measured_images?: number;
    accuracy?: number;
    reason?: string;
};

/** Figures of a deployment check (R3, `assess.DeploymentFigures`). */
export type DeploymentFigures = {
    deployment: NamedRef;
    device: DeviceRef;
    image?: string;
    model: NamedRef;
    /** The deployment answered the test requests. */
    ready: boolean;
    /** The model the device served, as the check read it. */
    served_model?: string;
    io: DeploymentIO;
    /** Requests that were sent; 0 when none was. */
    requests: number;
    /** The largest difference to the model file; null while nothing was compared. */
    max_abs_diff: number | null;
    /** The largest difference as a share of the largest value of its output; null without a comparison (absent in old reports). */
    max_rel_diff?: number | null;
    /** The largest share of the tolerance a request used; at most 1 means the comparison held (absent in old reports). */
    tolerance_used?: number | null;
    /** The rule of the comparison: abs + scale * largest output value. */
    tolerance?: { abs: number; scale: number };
    /** One entry per compared request (absent in old reports). */
    per_request?: RequestFigures[];
    /** In how many requests the device named the same top class; null without a classification output. */
    argmax_same: number | null;
    /** The round trips of the test requests, in milliseconds. */
    roundtrip_ms: { median: number; max: number };
    model_check: ModelCheck | null;
};

/** The comparison of one test request of a deployment check. */
export type RequestFigures = {
    input: string;
    max_abs_diff: number;
    scale: number;
    rel_diff: number | null;
    tolerance_used: number;
    argmax_same: boolean | null;
    /** The device named another top class, but the model file's two values lie inside the tolerance. */
    tie?: boolean;
};

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
    | { kind: 'failed_calls_limit'; data: FailedCallsStop }
    | { kind: 'error'; data: { message: string } }
    | { kind: string; data: unknown };
