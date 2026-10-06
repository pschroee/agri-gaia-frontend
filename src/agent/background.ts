// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Background tasks (bash with run_in_background, or a running command the user moved there) and the running
// foreground commands that can be stopped or moved: state from the API and the SSE events, labels and the
// gateway's note at the end of a task. Pure functions, after the gateway's own web/src/lib/background.ts and
// systemnote.ts.
import { formatElapsed } from './runState';
import type { BackgroundEvent, BackgroundState, BackgroundTask, PiEvent } from './types';

/** Applies an SSE event "background". A throttled "output" does not overwrite an end that already arrived. */
export function applyBackgroundEvent(list: BackgroundTask[], ev: BackgroundEvent | undefined): BackgroundTask[] {
    const t = ev?.task;
    if (!t?.id) return list;
    const i = list.findIndex((x) => x.id === t.id);
    if (i < 0) return [...list, t];
    if (ev?.change === 'output' && list[i].state !== 'running') return list;
    const next = list.slice();
    next[i] = { ...list[i], ...t };
    return next;
}

/** Takes a task from an answer (stop, move to background) or a loaded list, by id. */
export function upsertBackground(list: BackgroundTask[], add: BackgroundTask[]): BackgroundTask[] {
    let next = list;
    for (const t of add) {
        if (!t?.id) continue;
        const i = next.findIndex((x) => x.id === t.id);
        if (i < 0) next = [...next, t];
        else {
            next = next.slice();
            next[i] = { ...next[i], ...t };
        }
    }
    return next;
}

/** Running ones first (oldest on top), then ended ones (newest on top). */
export function sortBackground(list: BackgroundTask[]): BackgroundTask[] {
    return [...list].sort((a, b) => {
        const ra = a.state === 'running' ? 0 : 1;
        const rb = b.state === 'running' ? 0 : 1;
        if (ra !== rb) return ra - rb;
        return ra === 0 ? a.seq - b.seq : b.seq - a.seq;
    });
}

export const runningCount = (list: BackgroundTask[]) => list.filter((t) => t.state === 'running').length;

export type Tone = 'running' | 'ok' | 'error' | 'muted';

const STATE_LABEL: Record<BackgroundState, string> = {
    running: 'running',
    exited: 'ended',
    failed: 'failed',
    timeout: 'time limit',
    stopped: 'stopped',
    lost: 'lost with the sandbox',
    suspended: 'ended when resting',
    closed: 'ended with the chat',
};

/** Label and tone of a task's state. */
export function backgroundStatus(t: Pick<BackgroundTask, 'state' | 'exit_code' | 'stopped_by'>): {
    label: string;
    tone: Tone;
} {
    switch (t.state) {
        case 'running':
            return { label: 'running', tone: 'running' };
        case 'exited':
            return t.exit_code === 0
                ? { label: 'exit 0', tone: 'ok' }
                : { label: `exit ${t.exit_code ?? '?'}`, tone: 'error' };
        case 'failed':
        case 'timeout':
            return { label: STATE_LABEL[t.state], tone: 'error' };
        case 'stopped':
            return { label: t.stopped_by === 'user' ? 'stopped by you' : 'stopped by the agent', tone: 'muted' };
        default:
            return { label: STATE_LABEL[t.state] ?? String(t.state), tone: 'muted' };
    }
}

/** Runtime in ms: until now while running, otherwise until the end; undefined without times. */
export function backgroundRuntimeMs(
    t: Pick<BackgroundTask, 'state' | 'started_at' | 'ended_at'>,
    now: number,
): number | undefined {
    const start = Date.parse(t.started_at);
    if (Number.isNaN(start)) return undefined;
    if (t.state === 'running') return Math.max(0, now - start);
    const end = t.ended_at ? Date.parse(t.ended_at) : NaN;
    return Number.isNaN(end) ? undefined : Math.max(0, end - start);
}

export function formatBackgroundRuntime(t: Pick<BackgroundTask, 'state' | 'started_at' | 'ended_at'>, now: number) {
    const ms = backgroundRuntimeMs(t, now);
    return ms === undefined ? '' : formatElapsed(ms);
}

/** The last n lines of the output, without the trailing line break. */
export function tailLines(tail: string | undefined, n: number): string[] {
    const s = (tail ?? '').replace(/\n+$/, '');
    if (!s) return [];
    const lines = s.split('\n');
    return lines.slice(Math.max(0, lines.length - n));
}

/** The command on one line, shortened. */
export function commandPreview(cmd: string, max = 80): string {
    const one = cmd.split(/\s+/).filter(Boolean).join(' ');
    return one.length > max ? `${one.slice(0, max - 1).trimEnd()}…` : one;
}

/** Collapsed strip line: "1 running · 2 ended". */
export function backgroundSummary(list: BackgroundTask[]): string {
    const run = runningCount(list);
    const ended = list.length - run;
    return [run ? `${run} running` : '', ended ? `${ended} ended` : ''].filter(Boolean).join(' · ');
}

/** Task per tool call that started it (bash with run_in_background, or moved there by the user). */
export function backgroundByCall(list: BackgroundTask[]): Map<string, BackgroundTask> {
    const m = new Map<string, BackgroundTask>();
    for (const t of list) if (t.tool_call_id) m.set(t.tool_call_id, t);
    return m;
}

// Running foreground commands ------------------------------------------------------------------------------------

/**
 * Foreground commands that can be stopped or moved to the background. `live`: bash executions seen as pi events
 * (tool_execution_start until _end); `server`: the gateway's last list (GET …/tools/running), which also covers
 * commands started before the page was loaded. The gateway may register a command a moment after pi reports it, so
 * a live one stays until its end event even when the server's list does not have it yet.
 */
export type RunningTools = { live: string[]; server: string[] };

export const emptyRunning: RunningTools = { live: [], server: [] };

export type RunningAction =
    | { type: 'pi'; event: PiEvent }
    | { type: 'server'; ids: string[] }
    | { type: 'done'; id: string }
    | { type: 'reset' };

const without = (s: RunningTools, id: string): RunningTools =>
    s.live.includes(id) || s.server.includes(id)
        ? { live: s.live.filter((x) => x !== id), server: s.server.filter((x) => x !== id) }
        : s;

export function runningReducer(s: RunningTools, a: RunningAction): RunningTools {
    switch (a.type) {
        case 'reset':
            return emptyRunning;
        case 'server':
            return { ...s, server: [...a.ids] };
        case 'done':
            return without(s, a.id);
        case 'pi': {
            const ev = a.event;
            const id = typeof ev.toolCallId === 'string' ? ev.toolCallId : undefined;
            if (ev.type === 'tool_execution_start' && id && ev.toolName === 'bash') {
                return s.live.includes(id) ? s : { ...s, live: [...s.live, id] };
            }
            if (ev.type === 'tool_execution_end' && id) return without(s, id);
            if (ev.type === 'agent_settled') return emptyRunning;
            return s;
        }
        default:
            return s;
    }
}

/** IDs of the controllable foreground commands. */
export function controllableTools(s: RunningTools): Set<string> {
    return new Set([...s.server, ...s.live]);
}

/** Text of a failed stop or move, by status. */
export function toolActionErrorText(action: 'stop' | 'background', status: number | undefined, message: string) {
    if (status === 404) return 'The command has already ended.';
    if (action === 'background' && status === 409) return 'Too many background tasks are running; stop one first.';
    return `${action === 'stop' ? 'Stopping' : 'Moving to the background'} failed: ${message}`;
}

/** Text of a failed stop of a background task. */
export function backgroundStopErrorText(status: number | undefined, message: string) {
    if (status === 409) return 'The task is no longer running.';
    if (status === 404) return 'Unknown task.';
    return `Stopping failed: ${message}`;
}

// The gateway's note at the end of a task ---------------------------------------------------------------------

const SYSTEM_HEADER = '[Note from the orchestrator, not from the user]';

export type BackgroundNote = {
    /** The orchestrator's header line ("Background task bg-3 finished: exit 0, runtime 0:08"). */
    summary: string;
    /** Compact form: "bg-3 finished · exit 0 · 0:08". */
    label: string;
    tone: 'ok' | 'error' | 'muted';
    command?: string;
    error?: string;
    totalLines?: number;
    lines: string[];
    logPath?: string;
    noOutput: boolean;
};

/** Compact form of the header line of a background note. */
export function compactNoteSummary(summary: string): string {
    let s = summary.trim().replace(/^Background task /, '');
    let runtime = '';
    const rm = /, runtime (\d+:\d{2}(?::\d{2})?)$/.exec(s);
    if (rm) {
        runtime = ` · ${rm[1]}`;
        s = s.slice(0, rm.index);
    }
    s = s.replace(/ \(started by subagent ([^)]*)\)/, ' (subagent $1)').replace(': ', ' · ');
    return s + runtime;
}

function noteTone(summary: string): BackgroundNote['tone'] {
    if (/finished: exit 0\b/.test(summary) || /finished(,|$)/.test(summary)) return 'ok';
    if (/stopped/.test(summary)) return 'muted';
    return 'error';
}

/**
 * Reads a background note (the part of a user message the gateway marks as such): header line and the fenced data
 * from the sandbox (command, error, last lines, path). Data from the sandbox is display only.
 */
export function parseBackgroundNote(text: string): BackgroundNote {
    const rest = text.startsWith(SYSTEM_HEADER) ? text.slice(SYSTEM_HEADER.length) : text;
    const summary = rest.split('\n').find((l) => l.trim()) ?? '';
    const note: BackgroundNote = {
        summary: summary.trim(),
        label: compactNoteSummary(summary),
        tone: noteTone(summary),
        lines: [],
        noOutput: false,
    };
    const fence = /<<<(\S+)\n([\s\S]*?)\n\1>>>/.exec(rest);
    if (!fence) return note;
    const lines = fence[2].split('\n');
    let i = 0;
    let end = lines.length;
    if (lines[i]?.startsWith('Command: ')) note.command = lines[i++].slice('Command: '.length);
    if (lines[i]?.startsWith('Error: ')) note.error = lines[i++].slice('Error: '.length);
    if (end > i && lines[end - 1].startsWith('Full output: '))
        note.logPath = lines[--end].slice('Full output: '.length);
    if (lines[i] === 'No output.') {
        note.noOutput = true;
        return note;
    }
    const lm = /^Last lines \(of (\d+)\):$/.exec(lines[i] ?? '');
    if (lm) {
        note.totalLines = Number(lm[1]);
        i++;
    }
    note.lines = lines.slice(i, end);
    return note;
}
