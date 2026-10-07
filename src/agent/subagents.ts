// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Subagent runs: entries from the subagents' session files grouped per run, with name and state from pi-subagents
// (subagent_runs), their own steps and the model calls recorded at the LLM proxy. Pure functions, after the gateway's own
// web/src/lib/subagents.ts and subagent-overview.ts.
import { displayToolName, summarizeArgs } from './transcript';
import type { AgentPart, Step, TranscriptItem } from './transcript';
import type { LLMCall, StoredMessage, SubagentEntry, SubagentRunMeta } from './types';

export type SubagentRun = {
    runId: string;
    agent: string;
    /** Name in the workflow, according to pi-subagents. */
    label?: string;
    /** State according to pi-subagents; missing: estimated from the entries. */
    state?: string;
    entries: SubagentEntry[];
    /** First and last activity in ms. */
    start: number;
    end: number;
    /** The task (first task entry). */
    task?: string;
    toolCalls: number;
    errors: number;
};

const ms = (iso: string | undefined) => {
    const v = iso ? Date.parse(iso) : NaN;
    return Number.isNaN(v) ? 0 : v;
};

const entryKey = (e: SubagentEntry) => `${e.run_id}\u0000${e.entry_id}`;

/** Adds entries; equal (run_id, entry_id) are replaced, the order is kept. */
export function mergeSubagentEntries(list: SubagentEntry[], add: SubagentEntry[]): SubagentEntry[] {
    if (add.length === 0) return list;
    const next = list.slice();
    const index = new Map(next.map((e, i) => [entryKey(e), i]));
    for (const e of add) {
        if (!e?.run_id) continue;
        const k = entryKey(e);
        const i = index.get(k);
        if (i === undefined) {
            index.set(k, next.length);
            next.push(e);
        } else next[i] = e;
    }
    return next;
}

/** Adds run metadata by run_id; empty fields of the newer one keep the older value (as the gateway stores them). */
export function mergeRunMeta(list: SubagentRunMeta[], add: SubagentRunMeta[]): SubagentRunMeta[] {
    let next = list;
    for (const m of add) {
        if (!m?.run_id) continue;
        const i = next.findIndex((x) => x.run_id === m.run_id);
        if (i < 0) next = [...next, m];
        else {
            const old = next[i];
            const merged: SubagentRunMeta = { ...old };
            for (const [k, v] of Object.entries(m))
                if (v !== '' && v !== undefined && v !== null) (merged as Record<string, unknown>)[k] = v;
            next = next.slice();
            next[i] = merged;
        }
    }
    return next;
}

/**
 * Groups entries per run (sorted by created_at), runs by start. `meta` adds agent, name and state; a run without
 * entries appears with its metadata alone.
 */
export function groupRuns(entries: SubagentEntry[], meta: SubagentRunMeta[] = []): SubagentRun[] {
    const byRun = new Map<string, SubagentEntry[]>();
    for (const e of entries) {
        const l = byRun.get(e.run_id);
        if (l) l.push(e);
        else byRun.set(e.run_id, [e]);
    }
    const runs = new Map<string, SubagentRun>();
    for (const [runId, list] of byRun) {
        const sorted = [...list].sort((a, b) => ms(a.created_at) - ms(b.created_at));
        const times = sorted.map((e) => ms(e.created_at));
        runs.set(runId, {
            runId,
            agent: sorted.find((e) => e.agent)?.agent ?? '',
            entries: sorted,
            start: Math.min(...times),
            end: Math.max(...times),
            task: sorted.find((e) => e.kind === 'task')?.payload?.text,
            toolCalls: sorted.filter((e) => e.kind === 'tool_call').length,
            errors: sorted.filter((e) => e.kind === 'tool_result' && e.payload?.is_error).length,
        });
    }
    for (const m of meta) {
        const r = runs.get(m.run_id);
        const started = ms(m.started_at);
        const ended = ms(m.ended_at);
        if (r) {
            if (m.agent) r.agent = m.agent;
            r.label = m.label || undefined;
            r.state = m.state || undefined;
            if (started && started < r.start) r.start = started;
            if (ended > r.end) r.end = ended;
        } else if (started) {
            runs.set(m.run_id, {
                runId: m.run_id,
                agent: m.agent,
                label: m.label || undefined,
                state: m.state || undefined,
                entries: [],
                start: started,
                end: Math.max(started, ended),
                toolCalls: 0,
                errors: 0,
            });
        }
    }
    return [...runs.values()].sort((a, b) => a.start - b.start);
}

export type RunStatus = 'running' | 'idle' | 'done' | 'failed' | 'stopped';

/** Without news for this long, a run without a state counts as quiet while the chat works. */
export const RUN_IDLE_MS = 90_000;

const RUNNING_STATES = new Set(['running', 'queued', 'pending', 'starting', 'active', 'waiting', 'paused']);
const DONE_STATES = new Set(['complete', 'completed', 'done', 'succeeded', 'success']);
const FAILED_STATES = new Set(['failed', 'error', 'errored']);

/**
 * Status of a run. Authoritative is pi-subagents' state; only without it is it estimated: ends with a text answer →
 * done; activity within RUN_IDLE_MS → running (background runs work on while the main agent rests); otherwise quiet
 * (chat still working) or ended without an answer.
 */
export function runStatus(
    run: Pick<SubagentRun, 'entries' | 'end' | 'state'>,
    { chatRunning, now }: { chatRunning: boolean; now: number },
): RunStatus {
    const st = run.state?.toLowerCase();
    if (st) {
        if (DONE_STATES.has(st)) return 'done';
        if (RUNNING_STATES.has(st)) return 'running';
        if (FAILED_STATES.has(st)) return 'failed';
        return 'stopped';
    }
    const last = run.entries[run.entries.length - 1];
    if (last?.kind === 'text') return 'done';
    if (now - run.end <= RUN_IDLE_MS) return 'running';
    return chatRunning ? 'idle' : 'stopped';
}

export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
    running: 'running',
    idle: 'quiet',
    done: 'done',
    failed: 'failed',
    stopped: 'ended without answer',
};

/** Short run ID: six characters, "#n" for parallel children kept. */
export function shortRunId(runId: string): string {
    const [base, idx] = runId.split('#');
    const short = base.length > 6 ? base.slice(0, 6) : base;
    return idx !== undefined ? `${short}#${idx}` : short;
}

/**
 * A line of the task that says something: markdown heading, quote and list marks, emphasis and the "Task:" prefix of
 * pi-subagents are dropped; lines of punctuation only (rules, fences), tags such as "[Context]" and bare section
 * headings ("## Task") do not count.
 */
function meaningfulLine(task: string | undefined): string | undefined {
    for (const raw of (task ?? '').split('\n')) {
        const line = raw
            .trim()
            .replace(/^(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+)/, '')
            .replace(/\*\*|__|`/g, '')
            .replace(/^task:\s*/i, '')
            .trim();
        if (!line || /^\[[^\]]*\]:?$/.test(line) || !/[\p{L}\p{N}]/u.test(line)) continue;
        // a bare heading such as "## Task" or "Context:" names a section, not the job
        if (/^(?:task|your task|instructions?|context|goal|objective)\s*:?$/i.test(line)) continue;
        return line.replace(/\s+/g, ' ');
    }
    return undefined;
}

/**
 * Title of a run without a model call (issue #48): the workflow name (label), otherwise the first meaningful line of
 * the task shortened to `max` characters, otherwise the agent. The full task belongs in the tooltip (runTooltip).
 */
export function runTitle(run: Pick<SubagentRun, 'task' | 'agent' | 'label'>, max = 70): string {
    if (run.label?.trim()) return run.label.trim();
    const line = meaningfulLine(run.task);
    if (!line) return run.agent || 'Subagent';
    return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/** Tooltip of a run's title: the full task (with the name in front when the title is the name). */
export function runTooltip(run: Pick<SubagentRun, 'task' | 'agent' | 'label'>): string {
    const task = run.task?.trim();
    if (!task) return runTitle(run, Infinity);
    return run.label?.trim() ? `${run.label.trim()}\n\n${task}` : task;
}

/** Second line: agent and short run ID. */
export function runSubtitle(run: Pick<SubagentRun, 'agent' | 'runId'>): string {
    return `${run.agent || 'subagent'} · run ${shortRunId(run.runId)}`;
}

/** Duration in ms: until now while live, otherwise first to last activity. */
export function runDuration(run: Pick<SubagentRun, 'start' | 'end'>, status: RunStatus, now: number): number {
    const live = status === 'running' || status === 'idle';
    return Math.max(0, (live ? Math.max(now, run.end) : run.end) - run.start);
}

export type RunUsage = { calls: number; tokens: number };

/**
 * Model calls and tokens of a run from the LLM proxy (tamper-proof), assigned by the response_id of its entries
 * (which come from the sandbox). undefined when no model call matches.
 */
export function runUsage(run: Pick<SubagentRun, 'entries'>, calls: LLMCall[]): RunUsage | undefined {
    const ids = new Set(run.entries.map((e) => e.response_id).filter((id): id is string => !!id));
    if (ids.size === 0) return undefined;
    const out: RunUsage = { calls: 0, tokens: 0 };
    for (const c of calls) {
        if (!c.response_id || !ids.has(c.response_id)) continue;
        out.calls++;
        out.tokens += (c.input ?? 0) + (c.output ?? 0);
    }
    return out.calls === 0 ? undefined : out;
}

/** Adds model calls by id. */
export function mergeLLMCalls(list: LLMCall[], add: LLMCall[]): LLMCall[] {
    let next = list;
    for (const c of add) {
        if (c?.id === undefined) continue;
        const i = next.findIndex((x) => x.id === c.id);
        if (i < 0) next = [...next, c];
        else {
            next = next.slice();
            next[i] = c;
        }
    }
    return next;
}

export type RunItem =
    | { type: 'task'; key: string; text: string }
    | { type: 'text'; key: string; text: string }
    | { type: 'steps'; key: string; steps: Step[] };

/**
 * The steps of a run as the transcript shows them: the task, text answers and tool calls joined into step lists. A
 * result belongs to its call by ID, otherwise to the oldest open call of the same name. Open calls run while the run
 * runs, otherwise they did not finish.
 */
export function runItems(run: Pick<SubagentRun, 'entries'>, live: boolean): RunItem[] {
    const items: RunItem[] = [];
    const open: { step: Step; name: string; callId?: string }[] = [];
    const steps = (): Step[] => {
        const last = items[items.length - 1];
        if (last?.type === 'steps') return last.steps;
        const fresh: RunItem = { type: 'steps', key: `s${items.length}`, steps: [] };
        items.push(fresh);
        return fresh.steps;
    };
    for (const e of run.entries) {
        const p = e.payload ?? {};
        if (e.kind === 'task' || e.kind === 'text') {
            if (p.text?.trim()) items.push({ type: e.kind, key: e.entry_id, text: p.text });
        } else if (e.kind === 'tool_call') {
            const step: Step = {
                id: e.entry_id,
                tool: displayToolName(p.name ?? 'tool'),
                summary: summarizeArgs(p.arguments),
                status: live ? 'running' : 'stopped',
            };
            steps().push(step);
            open.push({ step, name: p.name ?? '', callId: p.id });
        } else if (e.kind === 'tool_result') {
            let i = p.tool_call_id ? open.findIndex((o) => o.callId === p.tool_call_id) : -1;
            if (i < 0) i = open.findIndex((o) => !p.name || !o.name || o.name === p.name);
            const status = p.is_error ? 'error' : 'done';
            if (i < 0) steps().push({ id: e.entry_id, tool: displayToolName(p.name ?? 'tool'), status });
            else {
                open[i].step.status = status;
                open.splice(i, 1);
            }
        }
    }
    return items;
}

/** Collapsed strip line: "1 running · 2 done". */
export function runsSummary(statuses: RunStatus[]): string {
    const order: RunStatus[] = ['running', 'idle', 'done', 'failed', 'stopped'];
    return order
        .map((s) => [s, statuses.filter((x) => x === s).length] as const)
        .filter(([, n]) => n > 0)
        .map(([s, n]) => `${n} ${s === 'stopped' ? 'ended' : RUN_STATUS_LABEL[s]}`)
        .join(' · ');
}

// --- Looking into a subagent (issue #48) ---

/** A subagent as a sub-entry under its chat (panel chat selector, history of /ai-agent). */
export type SubagentNavItem = {
    runId: string;
    title: string;
    /** Full task for the tooltip. */
    tooltip: string;
    status: RunStatus;
};

/** Runs live while they run or are quiet in a working chat. */
export const isLiveStatus = (s: RunStatus) => s === 'running' || s === 'idle';

/**
 * Sub-entries of a chat in the order the runs started. A run with neither name nor task gets its short run ID after
 * the agent, so two of them stay apart; never "Subagent 1".
 */
export function subagentNav(
    runs: SubagentRun[],
    { chatRunning, now }: { chatRunning: boolean; now: number },
): SubagentNavItem[] {
    return runs.map((r) => {
        const named = !!r.label?.trim() || !!meaningfulLine(r.task);
        const title = named ? runTitle(r) : `${r.agent || 'Subagent'} · ${shortRunId(r.runId)}`;
        return {
            runId: r.runId,
            title,
            tooltip: named ? runTooltip(r) : title,
            status: runStatus(r, { chatRunning, now }),
        };
    });
}

/** Short state of a sub-entry: running, quiet, done, failed, ended. */
export function subagentStateText(s: RunStatus): string {
    return s === 'stopped' ? 'ended' : RUN_STATUS_LABEL[s];
}

/** The user's choice to open or close a chat's group of subagents, and the default it was made against. */
export type GroupToggle = { open: boolean; madeWhenDefault: boolean };

/** Default of a group: open while one of its subagents runs, closed when all are done. */
export function groupOpenByDefault(statuses: RunStatus[]): boolean {
    return statuses.some(isLiveStatus);
}

/**
 * Whether a chat's group of subagents is open. The user's toggle holds until the default changes (a new run starts
 * or the last one ends), then the default applies again. A group with the opened subagent in it is always open, so
 * the selected entry stays visible.
 */
export function groupOpen(statuses: RunStatus[], toggle: GroupToggle | undefined, hasSelected = false): boolean {
    if (hasSelected) return true;
    const def = groupOpenByDefault(statuses);
    if (toggle && toggle.madeWhenDefault === def) return toggle.open;
    return def;
}

/** The toggle after a click on the group's arrow. */
export function toggleGroup(statuses: RunStatus[], toggle: GroupToggle | undefined, hasSelected = false): GroupToggle {
    return { open: !groupOpen(statuses, toggle, hasSelected), madeWhenDefault: groupOpenByDefault(statuses) };
}

/**
 * A run's entries as transcript items, for the same components as the chat: each task as a user message, text answers
 * and tool calls (as step lists with their result: done, failed, still running or not finished) joined into agent
 * blocks until the next task.
 */
export function runTranscript(run: Pick<SubagentRun, 'entries' | 'runId'>, live: boolean): TranscriptItem[] {
    const out: TranscriptItem[] = [];
    let agent: Extract<TranscriptItem, { kind: 'agent' }> | undefined;
    for (const it of runItems(run, live)) {
        if (it.type === 'task') {
            agent = undefined;
            out.push({ kind: 'user', key: `${run.runId}:${it.key}`, text: it.text.trim() });
            continue;
        }
        const part: AgentPart =
            it.type === 'text' ? { type: 'text', text: it.text } : { type: 'steps', steps: it.steps };
        if (!agent) {
            agent = { kind: 'agent', key: `${run.runId}:${it.key}`, parts: [] };
            out.push(agent);
        }
        agent.parts.push(part);
    }
    return out;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Agents a subagent call names: agent, and the agent of each entry of tasks, chain or parallel. */
export function toolAgents(args: unknown): string[] {
    let a = args;
    if (typeof a === 'string') {
        try {
            a = JSON.parse(a);
        } catch {
            return [];
        }
    }
    if (!isObj(a)) return [];
    const out: string[] = [];
    if (typeof a.agent === 'string') out.push(a.agent);
    for (const k of ['tasks', 'chain', 'parallel']) {
        const list = a[k];
        if (Array.isArray(list)) for (const t of list) if (isObj(t) && typeof t.agent === 'string') out.push(t.agent);
    }
    return out;
}

/**
 * Runs per tool call ID of the main agent's `subagent` calls (after the gateway's assignRuns): each run belongs to the
 * last answer with a subagent call that started before it (background runs start after the call); within that answer
 * the call naming the run's agent wins, otherwise the first one. Runs started before any such call stay unassigned.
 */
export function runsByCall(
    messages: Pick<StoredMessage, 'message' | 'created_at'>[],
    runs: Pick<SubagentRun, 'runId' | 'agent' | 'start'>[],
): Record<string, string[]> {
    const candidates: { time: number; calls: { id: string; agents: string[] }[] }[] = [];
    for (const m of messages) {
        const msg = m.message;
        if (msg.role !== 'assistant' || !Array.isArray(msg.content)) continue;
        const calls = msg.content
            .filter((b) => b.type === 'toolCall' && b.name === 'subagent' && !!b.id)
            .map((b) =>
                b.type === 'toolCall' ? { id: b.id, agents: toolAgents(b.arguments) } : { id: '', agents: [] },
            );
        if (!calls.length) continue;
        const time = msg.timestamp ?? ms(m.created_at);
        candidates.push({ time, calls });
    }
    candidates.sort((a, b) => a.time - b.time);
    const out: Record<string, string[]> = {};
    for (const r of [...runs].sort((a, b) => a.start - b.start)) {
        let c: (typeof candidates)[number] | undefined;
        for (const x of candidates) if (x.time <= r.start) c = x;
        if (!c) continue;
        const hit = c.calls.find((x) => x.agents.includes(r.agent)) ?? c.calls[0];
        (out[hit.id] ??= []).push(r.runId);
    }
    return out;
}
