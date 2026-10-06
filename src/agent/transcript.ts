// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { isPageContext, type PageContext } from './pageContext';
import { compactNoteSummary, parseBackgroundNote } from './background';
import type { BackgroundNote } from './background';
import { splitAttachments } from './files';
import { isBlocked } from './format';
import { messageImageKey } from './images';
import { hasThinkingText, thinkingDuration, thinkingKey } from './live';
import type { LiveMessage, ThinkingTime } from './live';
import type {
    Approval,
    ContentBlock,
    MessageSource,
    PiMessage,
    SocketCall,
    StoredMessage,
    ToolExecution,
} from './types';
import { answerUsage } from './usage';
import type { AnswerUsage } from './usage';

/** aborted: ended by the user's stop (abort of the run or "Stop" on the command), not a failure. */
export type StepStatus = 'running' | 'done' | 'error' | 'waiting' | 'blocked' | 'stopped' | 'aborted';

/**
 * Texts with which an aborted call or answer ends: the abort error of Node/fetch ("This operation was aborted"),
 * pi's providers ("Request was aborted"), the gateway's bash bridge ("Command aborted", "Command stopped by the
 * user", appended to the output so far).
 */
const ABORT_LINE =
    /^(?:(?:this|the) operation was aborted|(?:request (?:was )?)?aborted|operation aborted|command aborted|command stopped by the user)\.?$/i;

/** Whether a tool result or error message only says that the user stopped it (its last line decides). */
export function isAbortText(text: string | undefined): boolean {
    const lines = (text ?? '').trim().split('\n');
    return ABORT_LINE.test(lines[lines.length - 1].trim());
}

/** Whether a stored assistant message ended because the run was aborted (pi: stopReason "aborted"). */
export function isAbortedAnswer(msg: Pick<PiMessage, 'stopReason' | 'errorMessage'>): boolean {
    return msg.stopReason === 'aborted' || (msg.stopReason === 'error' && isAbortText(msg.errorMessage));
}

/**
 * Status of a stored tool call. `result` is pi's tool result (missing while it runs or when it never ended);
 * `answerAborted`: the answer that requested the call was aborted.
 */
export function stepStatus(
    result: PiMessage | undefined,
    flags: { blocked: boolean; pending: boolean; rejected: boolean; running: boolean; answerAborted: boolean },
): StepStatus {
    if (flags.blocked) return 'blocked';
    if (flags.pending) return 'waiting';
    if (result) {
        if (!result.isError) return 'done';
        if (flags.rejected) return 'stopped';
        return isAbortText(textOf(result.content)) ? 'aborted' : 'error';
    }
    if (flags.running) return 'running';
    return flags.answerAborted ? 'aborted' : 'stopped';
}

export type Step = {
    id: string;
    tool: string;
    summary?: string;
    status: StepStatus;
    /** Sum of the operations the gateway ran for this call; missing for tools without sandbox execution. */
    durationMs?: number;
};

/** Thinking of the model. id identifies the block across live and stored message (for its open state). */
export type ThinkingPart = {
    type: 'thinking';
    id: string;
    text: string;
    /** Measured while streaming; unknown for blocks that were not seen live (pi stores no timing). */
    durationMs?: number;
    /** The model is still thinking: start of the block, for a running timer. */
    liveSince?: number;
};

/** imageKey: ID of the stored answer the text comes from, to fetch its display images (missing while live). */
export type AgentPart =
    | { type: 'text'; text: string; imageKey?: string }
    | ThinkingPart
    | { type: 'steps'; steps: Step[] };

/** seq: the stored message the item comes from (the first one for an agent block; missing for the live one). */
export type TranscriptItem =
    /** files: names of the attachments (inputs) that went with the message. */
    /** context: page context the message was sent with (structured, from the gateway's source), shown as "Refers to …". */
    | { kind: 'user'; key: string; seq?: number; text: string; files?: string[]; context?: PageContext }
    /** note: a background task's end, parsed for the compact line (gateway type "background"). */
    | { kind: 'notice'; key: string; seq?: number; text: string; label?: string; note?: BackgroundNote }
    /** stopped: the answer was aborted by the user (shown muted, not as an error). */
    | {
          kind: 'agent';
          key: string;
          seq?: number;
          parts: AgentPart[];
          error?: string;
          stopped?: boolean;
          usage?: AnswerUsage;
      }
    | {
          kind: 'compaction';
          key: string;
          seq?: number;
          reason?: string;
          tokensBefore?: number;
          tokensAfter?: number;
          cost?: number;
      };

/** Fixed head of every gateway note inside a user message (agent gateway, internal/chat/origin.go). */
const SYSTEM_HEADER = '[Note from the orchestrator, not from the user]';

/**
 * English one-liner for a gateway note with a known type; the gateway's text stays in the tooltip. summary: the
 * orchestrator's header line, when known (background: "Background task bg-3 finished: exit 0, runtime 0:08").
 */
export function noteLabel(src: MessageSource, summary?: string): string | undefined {
    const refs = src.refs ?? [];
    switch (src.type) {
        case 'language':
            return `preferred browser language passed to the agent${refs[0] ? `: ${refs[0]}` : ''}`;
        case 'sandbox':
            return `background tasks ended with the previous sandbox${refs.length ? `: ${refs.join(', ')}` : ''}`;
        case 'background':
            if (summary && /^Background task /.test(summary.trim()))
                return `background task ${compactNoteSummary(summary)}`;
            return `background task${refs[0] ? ` ${refs[0]}` : ''} ended`;
        default:
            return undefined;
    }
}

type Part = { kind: 'user'; text: string } | { kind: 'system'; text: string; source: MessageSource };

/**
 * Splits a user message along the parts the gateway names (sources): each note starts with SYSTEM_HEADER and
 * either ends at its fence (marker) or at the end of its single line; the rest is user text. Without sources
 * the message is taken as a whole, as before.
 */
export function splitMessage(text: string, sources: MessageSource[] | undefined): Part[] {
    if (!sources?.some((s) => s.kind === 'system')) return text ? [{ kind: 'user', text }] : [];
    const parts: Part[] = [];
    let cursor = 0;
    const pushUser = (s: string) => {
        const t = s.trim();
        if (t) parts.push({ kind: 'user', text: t });
    };
    for (const src of sources) {
        if (src.kind !== 'system') continue;
        const start = text.indexOf(SYSTEM_HEADER, cursor);
        if (start < 0) continue;
        let end: number;
        if (src.marker) {
            const close = `\n${src.marker}>>>`;
            const ci = text.indexOf(close, start);
            end = ci < 0 ? text.length : ci + close.length;
        } else {
            const nl = text.indexOf('\n', start + SYSTEM_HEADER.length + 1);
            end = nl < 0 ? text.length : nl;
        }
        pushUser(text.slice(cursor, start));
        parts.push({ kind: 'system', text: text.slice(start, end), source: src });
        cursor = end;
    }
    pushUser(text.slice(cursor));
    return parts;
}

/**
 * A part the gateway marks as context for the model only (`audience: "agent"`, e.g. the preferred browser language):
 * not shown in the chat. Decided by the gateway's mark alone, not by the type or the text (gateway API.md, *Origin of
 * instructions*).
 */
export function isAgentOnly(p: Part): boolean {
    return p.kind === 'system' && p.source.audience === 'agent';
}

/** Plain text of a message's content (text blocks joined by blank lines). */
export function textOf(content: PiMessage['content']): string {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    return content
        .filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text')
        .map((b) => b.text)
        .join('\n\n');
}

/** Tool names as the agent sees them, shortened for display (mcp_platform_list_datasets → platform.list_datasets). */
export function displayToolName(name: string): string {
    return name.replace(/^mcp_platform_/, 'platform.').replace(/^mcp_/, '');
}

const SUMMARY_KEYS = ['command', 'path', 'pattern', 'method', 'url', 'query', 'name', 'id', 'dataset_id', 'model_id'];

/** A short hint at the arguments of a tool call (command, path …), at most 60 characters. */
export function summarizeArgs(args: unknown): string | undefined {
    let obj = args;
    if (typeof args === 'string') {
        try {
            obj = JSON.parse(args);
        } catch {
            return args.length > 60 ? `${args.slice(0, 59)}…` : args || undefined;
        }
    }
    if (!obj || typeof obj !== 'object') return undefined;
    const rec = obj as Record<string, unknown>;
    let s: string | undefined;
    if (typeof rec.method === 'string' && typeof rec.path === 'string') s = `${rec.method} ${rec.path}`;
    for (const k of SUMMARY_KEYS) {
        if (s) break;
        const v = rec[k];
        if (typeof v === 'string' || typeof v === 'number') s = String(v);
    }
    if (!s) return undefined;
    s = s.replace(/\s+/g, ' ').trim();
    return s.length > 60 ? `${s.slice(0, 59)}…` : s;
}

type Context = {
    approvals: Approval[];
    socketCalls: SocketCall[];
    executions: ToolExecution[];
    running: boolean;
    /** Thinking blocks measured live (live.ts), by thinkingKey. */
    thinkingTimes?: Record<string, ThinkingTime>;
};

/** Appends a tool step to the parts, joining it with a directly preceding step list. */
function pushStep(parts: AgentPart[], step: Step) {
    const last = parts[parts.length - 1];
    if (last?.type === 'steps') last.steps.push(step);
    else parts.push({ type: 'steps', steps: [step] });
}

/**
 * Builds the conversation from the stored messages: user messages, notices of the gateway (wake-ups)
 * and one agent block per turn, in which text and tool steps keep their order.
 */
export function buildTranscript(messages: StoredMessage[], ctx: Context): TranscriptItem[] {
    const results = new Map<string, PiMessage>();
    for (const m of messages) {
        if (m.message.role === 'toolResult' && m.message.toolCallId) results.set(m.message.toolCallId, m.message);
    }
    const durations = new Map<string, number>();
    for (const e of ctx.executions) {
        durations.set(e.tool_call_id, (durations.get(e.tool_call_id) ?? 0) + (e.duration_ms ?? 0));
    }
    const pending = new Set(ctx.approvals.filter((a) => a.state === 'pending').map((a) => a.tool_call_id));
    const blocked = new Set(ctx.socketCalls.filter(isBlocked).map((c) => c.tool_call_id));
    const rejected = new Set(ctx.approvals.filter((a) => a.state === 'rejected').map((a) => a.tool_call_id));

    const items: TranscriptItem[] = [];
    let agent: Extract<TranscriptItem, { kind: 'agent' }> | undefined;
    // stored messages of each agent block, for its tokens and cost
    const answerRows = new Map<Extract<TranscriptItem, { kind: 'agent' }>, StoredMessage[]>();

    const stepFor = (id: string, name: string, args: unknown, answerAborted: boolean): Step => {
        const status = stepStatus(results.get(id), {
            blocked: blocked.has(id),
            pending: pending.has(id),
            rejected: rejected.has(id),
            running: ctx.running,
            answerAborted,
        });
        return { id, tool: displayToolName(name), summary: summarizeArgs(args), status, durationMs: durations.get(id) };
    };

    for (const m of messages) {
        const msg = m.message;
        if (msg.role === 'user') {
            agent = undefined;
            const split = splitAttachments(textOf(msg.content));
            const text = split.text.trim();
            const files = split.files.length ? split.files : undefined;
            if (m.origin === 'system' && !m.sources?.length) {
                items.push({ kind: 'notice', key: `n${m.seq}`, seq: m.seq, text });
                continue;
            }
            if (m.origin !== 'system' && m.origin !== 'mixed') {
                items.push({ kind: 'user', key: `u${m.seq}`, seq: m.seq, text, files });
                continue;
            }
            // notes the gateway marks as context for the model only (audience "agent", e.g. the preferred
            // language) are cut out, never shown as user text
            // a page context (agent-only part with structured `context`) goes to the user text that follows it
            const contexts = new Map<number, PageContext>();
            const parts: Part[] = [];
            let ctx: PageContext | undefined;
            for (const p of splitMessage(text, m.sources)) {
                if (isAgentOnly(p)) {
                    if (p.kind === 'system' && isPageContext(p.source.context)) ctx = p.source.context;
                    continue;
                }
                if (p.kind === 'user' && ctx) {
                    contexts.set(parts.length, ctx);
                    ctx = undefined;
                }
                parts.push(p);
            }
            const lastUser = parts.map((p) => p.kind).lastIndexOf('user');
            // the attachments block ends the message: it belongs to the user's text (or stands alone)
            if (files && lastUser < 0)
                items.push({ kind: 'user', key: `u${m.seq}-f`, seq: m.seq, text: '', files, context: ctx });
            parts.forEach((p, i) => {
                if (p.kind === 'system') {
                    const note = p.source.type === 'background' ? parseBackgroundNote(p.text) : undefined;
                    items.push({
                        kind: 'notice',
                        key: `n${m.seq}-${i}`,
                        seq: m.seq,
                        text: p.text,
                        label: noteLabel(p.source, note?.summary),
                        note,
                    });
                } else
                    items.push({
                        kind: 'user',
                        key: `u${m.seq}-${i}`,
                        seq: m.seq,
                        text: p.text,
                        files: i === lastUser ? files : undefined,
                        context: contexts.get(i),
                    });
            });
            continue;
        }
        if (msg.role === 'compaction') {
            agent = undefined;
            items.push({
                kind: 'compaction',
                key: `c${m.seq}`,
                seq: m.seq,
                reason: msg.reason,
                tokensBefore: msg.tokensBefore,
                tokensAfter: msg.estimatedTokensAfter,
                cost: m.cost,
            });
            continue;
        }
        if (msg.role !== 'assistant') continue;
        if (!agent) {
            agent = { kind: 'agent', key: `a${m.seq}`, seq: m.seq, parts: [] };
            items.push(agent);
            answerRows.set(agent, []);
        }
        answerRows.get(agent)?.push(m);
        const cur = agent;
        const blocks = Array.isArray(msg.content) ? msg.content : [];
        const aborted = isAbortedAnswer(msg);
        const imageKey = messageImageKey(msg);
        blocks.forEach((b, idx) => {
            if (b.type === 'text' && b.text.trim()) {
                cur.parts.push({ type: 'text', text: b.text, imageKey });
            } else if (b.type === 'thinking' && hasThinkingText(b.thinking)) {
                const ts = msg.timestamp;
                const id = ts === undefined ? `s${m.seq}:${idx}` : thinkingKey(ts, idx);
                const durationMs = thinkingDuration(ctx.thinkingTimes?.[id]);
                cur.parts.push({ type: 'thinking', id, text: b.thinking, durationMs });
            } else if (b.type === 'toolCall') {
                pushStep(cur.parts, stepFor(b.id, b.name, b.arguments, aborted));
            }
        });
        // an answer the user stopped is no error: a muted note instead of "Error: This operation was aborted"
        if (aborted) agent.stopped = true;
        else if (msg.stopReason === 'error' && msg.errorMessage) agent.error = msg.errorMessage;
    }
    for (const [item, rows] of answerRows) item.usage = answerUsage(rows);
    return items;
}

/**
 * Parts of the message that is being streamed: text, thinking (running ones with their start) and tool calls
 * as running steps, in the order of the content blocks.
 */
export function liveParts(msg: LiveMessage | undefined): AgentPart[] {
    const parts: AgentPart[] = [];
    if (!msg) return parts;
    msg.blocks.forEach((b, idx) => {
        if (b.type === 'text') {
            if (b.text.trim()) parts.push({ type: 'text', text: b.text });
        } else if (b.type === 'thinking') {
            const running = b.endedAt === undefined && !msg.ended;
            // a running block shows up at once ("Thinking …"), a finished one only with text
            if (!running && !hasThinkingText(b.thinking)) return;
            const id = msg.timestamp === undefined ? `live:${idx}` : thinkingKey(msg.timestamp, idx);
            parts.push({
                type: 'thinking',
                id,
                text: b.thinking,
                durationMs: running ? undefined : thinkingDuration(b),
                liveSince: running ? b.startedAt : undefined,
            });
        } else if (b.id || b.name) {
            pushStep(parts, {
                id: b.id || `live:${idx}`,
                tool: displayToolName(b.name),
                summary: summarizeArgs(b.arguments),
                status: 'running',
            });
        }
    });
    return parts;
}

/** Number of entries a reader sees: messages, notices, agent answers and each tool call in them. */
export function countEntries(items: TranscriptItem[]): number {
    let n = 0;
    for (const it of items) {
        n += 1;
        if (it.kind === 'agent') for (const p of it.parts) if (p.type === 'steps') n += p.steps.length;
    }
    return n;
}
