// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Subagent runs: entries from the subagents' session files grouped per run, with name and state from pi-subagents
// (subagent_runs), their own steps and the model calls recorded at the LLM proxy. Pure functions, after the gateway's own
// web/src/lib/subagents.ts and subagent-overview.ts.
import { byToolCall, displayToolName, parseArgs, summarizeArgs } from './transcript';
import type { AgentPart, Step, TranscriptItem } from './transcript';
import type {
    LLMCall,
    StoredMessage,
    SubagentEntry,
    SubagentMessage,
    SubagentMessageMode,
    SubagentMessageState,
    SubagentRunMeta,
    ToolExecution,
} from './types';

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
    /** Run this one continues (a resume or restart after a message, issue #81). */
    continues?: string;
    /** pi-subagents' run ID of the newest run; missing for a foreground run, which cannot be addressed (issue #81). */
    piRunId?: string;
    /** Thread of a run and its continuations, origin first (issue #81); missing: the run alone. */
    members?: string[];
    /** Newest run of the thread: the one a message is addressed to; missing: the run itself. */
    latest?: string;
    /** Whether the user can write to the run now (issue #82); missing from older gateways. */
    messageState?: SubagentMessageState;
};

/** The runs of a thread (the run itself and its continuations); a single run is its own thread. */
export const threadIds = (run: Pick<SubagentRun, 'runId' | 'members'>): string[] => run.members ?? [run.runId];

/** The run a message is addressed to: the newest of the thread (issue #81). */
export const latestRunId = (run: Pick<SubagentRun, 'runId' | 'latest'>): string => run.latest ?? run.runId;

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
    // user_echo: the relay message of a user, shown from the gateway's record instead (issue #81)
    for (const e of entries.filter((x) => x.kind !== 'user_echo')) {
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
            r.continues = m.continues_run_id || undefined;
            r.piRunId = m.pi_run_id || undefined;
            r.messageState = m.message_state || undefined;
            if (started && started < r.start) r.start = started;
            if (ended > r.end) r.end = ended;
        } else if (started) {
            runs.set(m.run_id, {
                runId: m.run_id,
                agent: m.agent,
                label: m.label || undefined,
                state: m.state || undefined,
                continues: m.continues_run_id || undefined,
                piRunId: m.pi_run_id || undefined,
                messageState: m.message_state || undefined,
                entries: [],
                start: started,
                end: Math.max(started, ended),
                toolCalls: 0,
                errors: 0,
            });
        }
    }
    return foldContinuations([...runs.values()].sort((a, b) => a.start - b.start));
}

/**
 * Joins each run with the runs that continue it into one thread (issue #81): one entry in the lists, its entries in time
 * order (an entry the continuation repeats from the earlier session counts once), its state that of the newest run.
 * A continuation whose origin is unknown stays a thread of its own.
 */
export function foldContinuations(runs: SubagentRun[]): SubagentRun[] {
    const ids = new Set(runs.map((r) => r.runId));
    const continuing = new Set<string>();
    const following = new Map<string, SubagentRun[]>();
    for (const r of runs) {
        if (!r.continues || r.continues === r.runId || !ids.has(r.continues)) continue;
        continuing.add(r.runId);
        const list = following.get(r.continues);
        if (list) list.push(r);
        else following.set(r.continues, [r]);
    }
    return runs
        .filter((r) => !continuing.has(r.runId))
        .map((root) => {
            const chain: SubagentRun[] = [];
            const seen = new Set([root.runId]);
            for (let cur: SubagentRun = root; ; ) {
                const next = following.get(cur.runId)?.find((x) => !seen.has(x.runId));
                if (!next) break;
                seen.add(next.runId);
                chain.push(next);
                cur = next;
            }
            if (chain.length === 0) return root;
            const all = [root, ...chain];
            const newest = chain[chain.length - 1];
            const byId = new Set<string>();
            const entries = all
                .flatMap((r) => r.entries)
                .sort((a, b) => ms(a.created_at) - ms(b.created_at))
                .filter((e) => {
                    if (byId.has(e.entry_id)) return false;
                    byId.add(e.entry_id);
                    return true;
                });
            return {
                ...root,
                entries,
                members: all.map((r) => r.runId),
                latest: newest.runId,
                piRunId: newest.piRunId,
                messageState: newest.messageState,
                state: newest.state,
                end: Math.max(...all.map((r) => r.end)),
                toolCalls: entries.filter((e) => e.kind === 'tool_call').length,
                errors: entries.filter((e) => e.kind === 'tool_result' && e.payload?.is_error).length,
            };
        });
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
 * The workflow label when it names the run: empty labels and labels that only repeat the agent's name ("worker",
 * "scout", issue #52) do not count.
 */
function ownLabel(run: Pick<SubagentRun, 'agent' | 'label'>): string | undefined {
    const label = run.label?.trim();
    if (!label) return undefined;
    if (run.agent && label.toLowerCase() === run.agent.trim().toLowerCase()) return undefined;
    return label;
}

/**
 * Title of a run without a model call (issues #48, #52): the workflow label unless it is only the agent's name,
 * otherwise the first meaningful line of the task shortened to `max` characters, otherwise the agent. The full task is
 * not repeated in a tooltip; it is the first message of the subagent's transcript.
 */
export function runTitle(run: Pick<SubagentRun, 'task' | 'agent' | 'label'>, max = 70): string {
    const label = ownLabel(run);
    if (label) return label;
    const line = meaningfulLine(run.task);
    if (!line) return run.agent || 'Subagent';
    return line.length > max ? `${line.slice(0, max - 1)}…` : line;
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
    /** The first task of a thread: the job the subagent got. */
    | { type: 'task'; key: string; text: string }
    /** Later tasks: the main agent's messages to the subagent, never shown as a message of the user (issue #81). */
    | { type: 'note'; key: string; text: string }
    | { type: 'text'; key: string; text: string }
    | { type: 'steps'; key: string; steps: Step[] }
    /** A message the user wrote, from the gateway's record. */
    | { type: 'message'; key: string; message: SubagentMessage }
    /** The thread continues in a new run after the message above (resume or restart). */
    | { type: 'continued'; key: string; mode: SubagentMessageMode };

/**
 * The steps of a run as the transcript shows them: the task, text answers and tool calls joined into step lists. A
 * result belongs to its call by ID, otherwise to the oldest open call of the same name. Open calls run while the run
 * runs, otherwise they did not finish. `messages` (the user's, from the gateway) are placed by their time before the
 * entry that follows them.
 */
export function runItems(
    run: Pick<SubagentRun, 'entries'>,
    live: boolean,
    executions: ToolExecution[] = [],
    messages: SubagentMessage[] = [],
): RunItem[] {
    const execsByCall = byToolCall(executions);
    const durationOf = (l: ToolExecution[] | undefined) =>
        l ? l.reduce((sum, e) => sum + (e.duration_ms ?? 0), 0) : undefined;
    const items: RunItem[] = [];
    const open: { step: Step; name: string; callId?: string }[] = [];
    const queue = messages.slice().sort((a, b) => ms(a.created_at) - ms(b.created_at));
    const flush = (until: number) => {
        while (queue.length && ms(queue[0].created_at) <= until) {
            const m = queue.shift() as SubagentMessage;
            items.push({ type: 'message', key: `m${m.id}`, message: m });
            if (m.target_run_id) items.push({ type: 'continued', key: `c${m.id}`, mode: m.mode });
        }
    };
    let tasks = 0;
    const steps = (): Step[] => {
        const last = items[items.length - 1];
        if (last?.type === 'steps') return last.steps;
        const fresh: RunItem = { type: 'steps', key: `s${items.length}`, steps: [] };
        items.push(fresh);
        return fresh.steps;
    };
    for (const e of run.entries) {
        flush(ms(e.created_at));
        const p = e.payload ?? {};
        if (e.kind === 'user_echo') continue;
        if (e.kind === 'task') {
            const first = tasks++ === 0;
            if (p.text?.trim()) items.push({ type: first ? 'task' : 'note', key: e.entry_id, text: p.text });
        } else if (e.kind === 'text') {
            if (p.text?.trim()) items.push({ type: 'text', key: e.entry_id, text: p.text });
        } else if (e.kind === 'tool_call') {
            const execs = p.id ? execsByCall.get(p.id) : undefined;
            const step: Step = {
                id: e.entry_id,
                callId: p.id,
                tool: displayToolName(p.name ?? 'tool'),
                summary: summarizeArgs(p.arguments),
                status: live ? 'running' : 'stopped',
                name: p.name,
                args: parseArgs(p.arguments),
                executions: execs,
                durationMs: durationOf(execs),
            };
            steps().push(step);
            open.push({ step, name: p.name ?? '', callId: p.id });
        } else if (e.kind === 'tool_result') {
            let i = p.tool_call_id ? open.findIndex((o) => o.callId === p.tool_call_id) : -1;
            if (i < 0) i = open.findIndex((o) => !p.name || !o.name || o.name === p.name);
            const status = p.is_error ? 'error' : 'done';
            const result = { text: p.text ?? '', isError: !!p.is_error };
            if (i < 0)
                steps().push({ id: e.entry_id, tool: displayToolName(p.name ?? 'tool'), status, name: p.name, result });
            else {
                open[i].step.status = status;
                open[i].step.result = result;
                open.splice(i, 1);
            }
        }
    }
    flush(Infinity);
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
        const named = !!ownLabel(r) || !!meaningfulLine(r.task);
        return {
            runId: r.runId,
            title: named ? runTitle(r) : `${r.agent || 'Subagent'} · ${shortRunId(r.runId)}`,
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

/** A transcript item of a subagent's view: the chat's items plus the user's messages and the thread's breaks. */
export type SubagentItem =
    | TranscriptItem
    | { kind: 'note'; key: string; text: string }
    | { kind: 'you'; key: string; message: SubagentMessage }
    | { kind: 'continued'; key: string; mode: SubagentMessageMode };

/**
 * A run's entries as transcript items, for the same components as the chat: the first task as a user message, later
 * tasks as notes, text answers and tool calls (as step lists with their result: done, failed, still running or not
 * finished) joined into agent blocks until the next task. The user's messages come from `messages` (the gateway's
 * record), only those addressed to the run's thread.
 */
export function runTranscript(
    run: Pick<SubagentRun, 'entries' | 'runId' | 'members'>,
    live: boolean,
    executions?: ToolExecution[],
    messages: SubagentMessage[] = [],
): SubagentItem[] {
    const mine = new Set(threadIds(run));
    const out: SubagentItem[] = [];
    let agent: Extract<TranscriptItem, { kind: 'agent' }> | undefined;
    for (const it of runItems(run, live, executions, messages.filter((m) => mine.has(m.run_id)))) {
        if (it.type === 'task') {
            agent = undefined;
            out.push({ kind: 'user', key: `${run.runId}:${it.key}`, text: it.text.trim() });
            continue;
        }
        if (it.type === 'note' || it.type === 'message' || it.type === 'continued') {
            agent = undefined;
            const key = `${run.runId}:${it.key}`;
            if (it.type === 'note') out.push({ kind: 'note', key, text: it.text.trim() });
            else if (it.type === 'message') out.push({ kind: 'you', key, message: it.message });
            else out.push({ kind: 'continued', key, mode: it.mode });
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

/** Adds the user's messages by id; a newer record (status changed) replaces the older one. */
export function mergeSubagentMessages(list: SubagentMessage[], add: SubagentMessage[]): SubagentMessage[] {
    let next = list;
    for (const m of add) {
        if (typeof m?.id !== 'number') continue;
        const i = next.findIndex((x) => x.id === m.id);
        if (i < 0) next = [...next, m];
        else {
            next = next.slice();
            next[i] = m;
        }
    }
    return next;
}

/** Reason of a failed delivery in plain words (the gateway's error texts stay in the record). */
export function deliveryErrorText(error?: string): string {
    if (!error) return 'the subagent did not take it';
    if (error === 'relay timed out') return 'the subagent did not answer in time';
    if (error === 'run ended before the message arrived') return 'the subagent ended before it read the message';
    return error;
}

/** Line under a user's bubble: "Sending …", "Sent", "Delivered" or "Not delivered: <reason>". */
export function deliveryText(m: Pick<SubagentMessage, 'status' | 'error'>): string {
    switch (m.status) {
        case 'sending':
            return 'Sending …';
        case 'sent':
            return 'Sent';
        case 'delivered':
            return 'Delivered';
        default:
            return `Not delivered: ${deliveryErrorText(m.error)}`;
    }
}

/** Text of the field: what the user may write to the open subagent now (issue #81). */
export type SubagentInputState = {
    /** 'open': the field takes text; 'locked': shown disabled with the note; 'hidden': no field (trash). */
    mode: 'open' | 'locked' | 'hidden';
    placeholder: string;
    /** Why the field is locked, or why sending waits. */
    note?: string;
    /** Sending is blocked (the last message has not arrived yet, or the field is locked). */
    blocked: boolean;
};

export const FOREGROUND_NOTE = 'Runs inside a step of the main agent – write to it when it has finished.';
export const STARTING_NOTE = 'The subagent is starting – you can write to it in a moment.';
export const PENDING_NOTE = 'Waiting for your last message to arrive';

/**
 * State of the subagent's field. A running run takes a hint (it reads it after its current step); a finished one a
 * follow-up with its history. A run inside a step of the main agent (no pi-subagents ID) is locked while it runs.
 */
export function subagentInputState({
    status,
    piRunId,
    messageState,
    trashed = false,
    pending = false,
}: {
    status: RunStatus;
    piRunId?: string;
    messageState?: SubagentMessageState;
    trashed?: boolean;
    pending?: boolean;
}): SubagentInputState {
    if (trashed) return { mode: 'hidden', placeholder: '', blocked: true };
    // the gateway's own verdict (issue #82) decides; without it (older gateway) a live run without ID is foreground
    if (messageState === 'starting')
        return { mode: 'locked', placeholder: STARTING_NOTE, note: STARTING_NOTE, blocked: true };
    if (messageState === 'foreground' || (messageState === undefined && isLiveStatus(status) && !piRunId))
        return { mode: 'locked', placeholder: FOREGROUND_NOTE, note: FOREGROUND_NOTE, blocked: true };
    const placeholder = isLiveStatus(status)
        ? 'Message the subagent – it reads it after its current step'
        : 'Ask a follow-up – continues with its history';
    if (pending) return { mode: 'open', placeholder, note: PENDING_NOTE, blocked: true };
    return { mode: 'open', placeholder, blocked: false };
}

/**
 * Error of sending to a subagent in plain words, from the gateway's codes (409, 429, 404); `limit` is the number of
 * subagents at the same time (gateway config).
 */
export function subagentSendErrorText(e: unknown, limit?: number): string {
    const o = (e ?? {}) as { code?: unknown; status?: unknown; message?: unknown };
    switch (o.code) {
        case 'subagent_limit':
            return limit === 1
                ? '1 subagent is already running – try again when it has finished.'
                : limit
                  ? `${limit} subagents are already running – try again when one has finished.`
                  : 'The limit of running subagents is reached – try again when one has finished.';
        case 'foreground_run':
            return FOREGROUND_NOTE;
        case 'run_starting':
            return STARTING_NOTE;
        case 'message_pending':
            return PENDING_NOTE;
        case 'chat_in_trash':
            return 'This chat is in the trash. Restore it to write.';
        case 'not_resumable':
            return 'This subagent can no longer be continued.';
        case 'subagents_unavailable':
            return 'Subagents are not available in this chat.';
    }
    if (o.status === 429) return 'Too many messages to subagents within an hour – try again later.';
    if (o.status === 404) return 'This subagent is no longer available.';
    return typeof o.message === 'string' && o.message ? o.message : 'The message could not be sent.';
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
