// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { isBlocked } from './format';
import type { Approval, ContentBlock, PiMessage, SocketCall, StoredMessage, ToolExecution } from './types';

export type StepStatus = 'running' | 'done' | 'error' | 'waiting' | 'blocked' | 'stopped';

export type Step = {
    id: string;
    tool: string;
    summary?: string;
    status: StepStatus;
    /** Sum of the operations the gateway ran for this call; missing for tools without sandbox execution. */
    durationMs?: number;
};

export type AgentPart = { type: 'text'; text: string } | { type: 'steps'; steps: Step[] };

export type TranscriptItem =
    | { kind: 'user'; key: string; text: string }
    | { kind: 'notice'; key: string; text: string }
    | { kind: 'agent'; key: string; parts: AgentPart[]; error?: string };

const ATTACHMENTS_HEAD = '[Anhänge unter /workspace/inputs/]';

function textOf(content: PiMessage['content']): string {
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
};

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

    const stepFor = (id: string, name: string, args: unknown): Step => {
        const res = results.get(id);
        let status: StepStatus;
        if (blocked.has(id)) status = 'blocked';
        else if (pending.has(id)) status = 'waiting';
        else if (res) status = res.isError ? (rejected.has(id) ? 'stopped' : 'error') : 'done';
        else status = ctx.running ? 'running' : 'stopped';
        return { id, tool: displayToolName(name), summary: summarizeArgs(args), status, durationMs: durations.get(id) };
    };

    for (const m of messages) {
        const msg = m.message;
        if (msg.role === 'user') {
            agent = undefined;
            let text = textOf(msg.content);
            const i = text.lastIndexOf(ATTACHMENTS_HEAD);
            if (i >= 0) text = text.slice(0, i).trim();
            if (m.origin === 'system') items.push({ kind: 'notice', key: `n${m.seq}`, text });
            else items.push({ kind: 'user', key: `u${m.seq}`, text });
            continue;
        }
        if (msg.role !== 'assistant') continue;
        if (!agent) {
            agent = { kind: 'agent', key: `a${m.seq}`, parts: [] };
            items.push(agent);
        }
        const blocks = Array.isArray(msg.content) ? msg.content : [];
        for (const b of blocks) {
            if (b.type === 'text' && b.text.trim()) {
                agent.parts.push({ type: 'text', text: b.text });
            } else if (b.type === 'toolCall') {
                const last = agent.parts[agent.parts.length - 1];
                const step = stepFor(b.id, b.name, b.arguments);
                if (last?.type === 'steps') last.steps.push(step);
                else agent.parts.push({ type: 'steps', steps: [step] });
            }
        }
        if (msg.stopReason === 'error' && msg.errorMessage) agent.error = msg.errorMessage;
    }
    return items;
}
