// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Runs of the agent's own code in the chat's notebook server (own code C-E4): the structured data the gateway puts
// into an approval (its field `notebook`) and the state of a running job of the kind `notebook_run`. Both views of
// this feature — the approval card that shows the code file by file (NotebookRunApproval) and the card of the run in
// the chat (NotebookRunCard) — take everything but the layout and the state from here, so the wording and the rules
// can be tested without rendering MUI.
//
// Nothing of this file builds a value of its own: the code, the datasets, the limits, the link to JupyterHub and the
// run's log all come from the gateway (the structured approval data, the observed job, its `link`), never from the
// agent's text. The code is shown as plain text only — never as HTML, never as Markdown, never with links in it.

import type { WatchJob } from './jobs';

/** One file of a run, as the approval carries it (gateway `notebook.files[]`). */
export type NotebookFile = {
    name: string;
    size: number;
    sha256: string;
    /**
     * The file's text as the card shows it (a notebook as its code cells in JSON); missing when the approval shows
     * no text of it — a binary, or more text than the approval carries.
     */
    text?: string;
};

/** One dataset a run gets; the name is missing when the gateway could not read it (then only the id is shown). */
export type NotebookDataset = { id: number; name?: string };

/** What a run of this instance gets (gateway `notebook.limits`). */
export type NotebookLimits = { cpus: number; mem_gb: number; timeout_min: number; internet: boolean };

/** The structured data of the approval of a run: the gateway's field `notebook` (own code C-E4). */
export type NotebookApprovalData = {
    /** The file that runs: a script or a notebook. */
    entry: string;
    files: NotebookFile[];
    datasets: NotebookDataset[];
    limits: NotebookLimits;
    /**
     * The agent's own note to the user about what the run is for (at most 500 characters, escaped for display). It is
     * the agent's text, **not** something the gateway read or checked: the card shows it in a block of its own, marked
     * "not verified" (gateway issue #92). Missing while the agent wrote none.
     */
    note?: string;
};

/** The label of the agent's note: it names who wrote it and that nobody verified it (gateway issue #92). */
export const AGENT_NOTE_LABEL = "Agent's note – not verified";

/** The state a run card shows, derived from the observed job (`runViewOf`). */
export type NotebookRunView = 'starting' | 'running' | 'finished' | 'failed' | 'timeout' | 'stopped';

/** The observer kind of a run (gateway `watch.Kind`); its jobs are the ones the run card is for. */
export const NOTEBOOK_RUN_KIND = 'notebook_run';

/** The word the head of the run card shows for each state (design: never only the colour). */
export const RUN_LABEL: Record<NotebookRunView, string> = {
    starting: 'Starting notebook server',
    running: 'Running',
    finished: 'Finished',
    failed: 'Failed',
    timeout: 'Timed out',
    stopped: 'Stopped',
};

/** The states in which a run is still going: the card ticks the time, shows the stop button, hides "Show log". */
export const isLive = (view: NotebookRunView): boolean => view === 'starting' || view === 'running';

// ---------------------------------------------------------------------------------------------------------------
// The approval: files, code and the texts built from the gateway's data
// ---------------------------------------------------------------------------------------------------------------

/**
 * The files with the entry file first, the rest in the order the gateway sent them. A missing entry keeps the
 * gateway's order (nothing is invented, the first file then carries the marker).
 */
export function orderFiles(files: NotebookFile[], entry: string): NotebookFile[] {
    const at = files.findIndex((f) => f.name === entry);
    if (at <= 0) return files;
    return [files[at], ...files.slice(0, at), ...files.slice(at + 1)];
}

/** One numbered line of the code view. */
export type CodeLine = { n: number; text: string };

/**
 * The lines of a text with their numbers, starting at 1. Blank lines count (they are part of what the user reads);
 * a single newline at the end does not add a last empty line.
 */
export function codeLines(text: string): CodeLine[] {
    const all = text.split('\n');
    if (all.length > 1 && all[all.length - 1] === '') all.pop();
    return all.map((t, i) => ({ n: i + 1, text: t }));
}

/** One code cell of a notebook with its own numbering (the design: "cell n" separators, numbers per cell anew). */
export type NotebookCell = { n: number; lines: CodeLine[] };

/**
 * The code cells of a notebook, as the gateway hands its text over (`{"cells":[{"cell_type":"code","source":"…"}]}`,
 * markdown and empty cells left out). Undefined when the text is no such JSON — the card then shows the text itself,
 * with line numbers, and never guesses cells.
 */
export function notebookCells(text: string): NotebookCell[] | undefined {
    let doc: unknown;
    try {
        doc = JSON.parse(text);
    } catch {
        return undefined;
    }
    const cells = (doc as { cells?: unknown } | null)?.cells;
    if (!Array.isArray(cells)) return undefined;
    const out: NotebookCell[] = [];
    for (const c of cells) {
        const cell = c as { cell_type?: unknown; source?: unknown };
        if (cell?.cell_type !== 'code') continue;
        const src = Array.isArray(cell.source)
            ? cell.source.filter((s): s is string => typeof s === 'string').join('')
            : typeof cell.source === 'string'
            ? cell.source
            : '';
        if (src.trim() === '') continue;
        out.push({ n: out.length + 1, lines: codeLines(src) });
    }
    return out;
}

/** File types the card shows as code; anything else gets "No preview for this file type." */
const PREVIEWABLE = ['.py', '.ipynb', '.yaml', '.yml', '.json', '.txt', '.md', '.cfg', '.toml', '.csv'];

/** Whether the card shows this file as text: a known type and text the approval carries. */
export function isPreviewable(name: string, text: string | undefined): boolean {
    if (!text) return false;
    const lower = name.toLowerCase();
    return PREVIEWABLE.some((e) => lower.endsWith(e));
}

/** Short form of a SHA-256: first 8 characters, ellipsis, last 4 (the full one stands in the tooltip). */
export function shortSha(sha: string): string {
    if (!sha) return '';
    return sha.length <= 12 ? sha : `${sha.slice(0, 8)}…${sha.slice(-4)}`;
}

/**
 * A long name shortened in the middle, so that its ending stays readable (design, gap L1). The full name belongs
 * into a tooltip and into the aria label of the element, never into the shortened text.
 */
export function midTrunc(name: string, max: number): string {
    if (!name || name.length <= max || max < 4) return name;
    const dot = name.lastIndexOf('.');
    const ext = dot > 0 && name.length - dot <= 8 ? name.slice(dot) : '';
    const keep = max - 1;
    const tail = Math.max(ext.length + 3, Math.floor(keep / 3));
    return `${name.slice(0, Math.max(1, keep - tail))}…${name.slice(name.length - tail)}`;
}

/** The title of the card: "Run train.py in your notebook server" (the entry comes from the gateway). */
export const entryTitle = (entry: string, max = 0): string =>
    `Run ${max > 0 ? midTrunc(entry, max) : entry} in your notebook server`;

/** The limits as one line: "2 CPUs · 8 GB · no internet · max 120 min". */
export const limitsLine = (l: NotebookLimits): string =>
    [
        `${l.cpus} CPUs`,
        `${l.mem_gb} GB`,
        l.internet ? 'internet' : 'no internet',
        `max ${l.timeout_min} min`,
    ].join(' · ');

/** One dataset as the chip shows it: "mnist-mini · id 1"; without a name only the id. */
export const datasetLabel = (d: NotebookDataset): string => (d.name ? `${d.name} · id ${d.id}` : `id ${d.id}`);

/** The datasets of a run as one value (the facts line of the panel, gap L11); empty when there is none. */
export const datasetsValue = (datasets: NotebookDataset[]): string =>
    datasets.map((d) => d.name ?? `id ${d.id}`).join(', ');

/** A file of a run as a result: the gateway names the path below `outputs/` (its `Output.label`). */
export const outputName = (o: { label?: string; id?: string }): string => {
    const p = o.label || o.id || '';
    return p.startsWith('outputs/') ? p.slice('outputs/'.length) : p;
};

/** The size a result file reports, when the kind knows it (gateway issue #92; 0 means it does not). */
export const outputSize = (o: { size?: number }): number | undefined =>
    typeof o.size === 'number' && o.size > 0 ? o.size : undefined;

/**
 * Who stopped a run, in the words the design uses (gap L14, gateway issue #92): "you" for the user's own stop over
 * the job route, "the agent" for the agent's own `notebook_stop`. Undefined while nobody stopped it — the card then
 * leaves the row out instead of guessing.
 */
export const stoppedByText = (stoppedBy: string | undefined): string | undefined => {
    if (stoppedBy === 'user') return 'you';
    if (stoppedBy === 'agent') return 'the agent';
    return undefined;
};

// ---------------------------------------------------------------------------------------------------------------
// The decided approval (the design's one-line card, gaps L7/L8)
// ---------------------------------------------------------------------------------------------------------------

/** What the one-line card of a decided approval shows besides its title. */
export type ApprovalDecision = {
    /** The state's word: Approved, Rejected, Expired. */
    label: string;
    /** What follows the title: " · not run" for a rejected or expired run, empty for an approved one. */
    suffix: string;
    /** Colour of state and border, from the theme. */
    tone: 'ok' | 'error' | 'muted';
    /** The time on the right: the decision, or the deadline for an expired one. */
    at?: string;
};

/**
 * The decision of a run's approval. The minutes of an expiry come from the gateway's approval timeout (the frontend
 * reads `approval_timeout_s`); without that number the line still says that nothing ran, only without the count.
 */
export function approvalDecision(
    approval: { state: string; decided_at?: string },
    expiryMin?: number,
): ApprovalDecision {
    switch (approval.state) {
        case 'approved':
            return { label: 'Approved', suffix: '', tone: 'ok', at: approval.decided_at };
        case 'rejected':
            return { label: 'Rejected', suffix: ' · not run', tone: 'error', at: approval.decided_at };
        default:
            return {
                label: 'Expired',
                suffix: expiryMin
                    ? ` · no decision within ${expiryMin} min, not run`
                    : ' · no decision within the time limit, not run',
                tone: 'muted',
                at: approval.decided_at,
            };
    }
}

/**
 * The deadline of an approval as the gateway counts it: `created_at` plus the gateway's approval timeout. The
 * gateway sends no `expires_at` for a single approval (only for a plan), so the time on the right of an expired
 * line is this one.
 */
export function approvalDeadline(createdAt: string | undefined, expiryMin: number | undefined): string | undefined {
    if (!createdAt || !expiryMin) return undefined;
    const t = Date.parse(createdAt);
    return Number.isFinite(t) ? new Date(t + expiryMin * 60_000).toISOString() : undefined;
}

/**
 * The minutes an approval stays open, as the gateway states them (its config `approval_timeout_s`). Undefined while
 * the view has no config — the texts then leave the number out instead of guessing one.
 */
export function expiryMinutes(config: { approval_timeout_s?: number } | undefined): number | undefined {
    const s = config?.approval_timeout_s;
    return typeof s === 'number' && s > 0 ? Math.max(1, Math.round(s / 60)) : undefined;
}

// ---------------------------------------------------------------------------------------------------------------
// The run: the observed job
// ---------------------------------------------------------------------------------------------------------------

/** The state the card shows. The gateway reports running, done or failed (and, for a stop, failed without a code). */
export function runViewOf(job: { state?: string; message?: string }): NotebookRunView {
    if (job.state === 'starting') return 'starting';
    if (job.state === 'done') return 'finished';
    if (job.state !== 'failed') return 'running';
    const code = exitCodeOf(job.message);
    if (code === 124) return 'timeout';
    // A failed run without an exit code is the one a stop leaves behind (gateway status.go): the notebook server of
    // the chat was stopped while the code went. Anything else stays failed, with the gateway's line.
    if (code === undefined && /stopped while it went/i.test(job.message ?? '')) return 'stopped';
    return 'failed';
}

/** The exit code of a run out of the job's line ("exit 0 after 12 min 8 s"); undefined while it has none. */
export function exitCodeOf(message: string | undefined): number | undefined {
    const m = /^exit\s+(\d+)\b/.exec((message ?? '').trim());
    return m ? Number(m[1]) : undefined;
}

/**
 * The run's seconds: how long it went so far while it runs, how long it took after it ended, else what the gateway's
 * line ("… after 12 min 8 s") says. Undefined when nothing of that is known.
 */
export function runSeconds(
    job: Pick<WatchJob, 'state' | 'message' | 'started_at' | 'ended_at'>,
    now = Date.now(),
): number | undefined {
    const start = job.started_at ? Date.parse(job.started_at) : NaN;
    if (job.state === 'running' || job.state === 'starting')
        return Number.isFinite(start) ? Math.max(0, Math.floor((now - start) / 1000)) : undefined;
    const end = job.ended_at ? Date.parse(job.ended_at) : NaN;
    if (Number.isFinite(start) && Number.isFinite(end)) return Math.max(0, Math.round((end - start) / 1000));
    const m = /after\s+(?:(\d+)\s*h\s*)?(?:(\d+)\s*min\s*)?(?:(\d+)\s*s)?/.exec(job.message ?? '');
    if (!m || (!m[1] && !m[2] && !m[3])) return undefined;
    return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

/** The running time as the head of a live run shows it: "3:24", from 60 minutes "1:12:07" (gap L9). */
export function formatRunClock(seconds: number): string {
    const s = Math.max(0, Math.floor(seconds));
    const m = Math.floor(s / 60);
    const rest = s % 60;
    const two = (n: number) => String(n).padStart(2, '0');
    return m < 60 ? `${m}:${two(rest)}` : `${Math.floor(m / 60)}:${two(m % 60)}:${two(rest)}`;
}

/** The duration of a run as the card shows it after the end: "12 min 08 s", under a minute "41 s" (gap L9). */
export function formatDuration(seconds: number): string {
    const s = Math.max(0, Math.round(seconds));
    if (s < 60) return `${s} s`;
    return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
}

/** One fact of the run: what it is, what it is worth, and whether the value carries a tone. */
export type RunFact = { label: string; value: string; tone?: 'error' | 'warning' };

/**
 * The facts of a run, as the design's grid on the page and its one line in the panel shows them (gaps L11): the exit
 * code, the duration and the start after the end, who stopped it, the start and the limits while it runs. The datasets
 * and the time limit come from the run's approval (the job itself carries neither).
 */
export function runFacts(
    job: Pick<WatchJob, 'state' | 'message' | 'started_at' | 'ended_at' | 'log_tail' | 'stopped_by'>,
    data: NotebookApprovalData | undefined,
    now = Date.now(),
): RunFact[] {
    const view = runViewOf(job);
    const started = job.started_at ? formatTime(job.started_at) : undefined;
    const secs = runSeconds(job, now);
    const duration = secs === undefined ? undefined : formatDuration(secs);
    const out: RunFact[] = [];
    if (view === 'running' || view === 'starting') {
        if (started) out.push({ label: 'Started', value: started });
        if (data) out.push({ label: 'Time limit', value: `${data.limits.timeout_min} min` });
        const ds = datasetsValue(data?.datasets ?? []);
        if (ds) out.push({ label: 'Datasets', value: ds });
        return out;
    }
    const code = exitCodeOf(job.message);
    if (code !== undefined)
        out.push({ label: 'Exit code', value: String(code), tone: code === 124 ? 'warning' : code === 0 ? undefined : 'error' });
    if (duration) out.push({ label: 'Duration', value: duration });
    if (started) out.push({ label: 'Started', value: started });
    // who stopped it stands in the job (gateway issue #92); without the field nothing is claimed (gap L14)
    const by = stoppedByText(job.stopped_by);
    if (by) out.push({ label: 'Stopped by', value: by });
    return out;
}

/** One fact as the panel's single line shows it: "exit 0", "12 min 08 s", "started 14:58" (gap L11). */
export function factText(f: RunFact): string {
    if (f.label === 'Exit code') return `exit ${f.value}`;
    if (f.label === 'Duration' || f.label === 'Datasets') return f.value;
    return `${f.label.toLowerCase()} ${f.value}`;
}

/** The head of a live run shows the time that passed, an ended one its duration, a timed out one its limit. */
export function runHeadTime(
    job: Pick<WatchJob, 'state' | 'message' | 'started_at' | 'ended_at'>,
    data: NotebookApprovalData | undefined,
    now = Date.now(),
): string | undefined {
    const view = runViewOf(job);
    const secs = runSeconds(job, now);
    if (isLive(view)) return secs === undefined ? undefined : formatRunClock(secs);
    if (view === 'timeout' && data) return `${data.limits.timeout_min} min`;
    return secs === undefined ? undefined : formatDuration(secs);
}

/** "14:58": the time of a run's start, as the facts and the starting note show it. */
export function formatTime(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const two = (n: number) => String(n).padStart(2, '0');
    return `${two(d.getHours())}:${two(d.getMinutes())}`;
}

/** The note of the starting state: when the user approved and that the run starts as soon as the server is ready. */
export const startingNote = (approvedAt: string | undefined, entry: string, max = 0): string =>
    `${approvedAt ? `Approved at ${approvedAt}. ` : ''}${max > 0 ? midTrunc(entry, max) : entry} starts as soon as the server is ready.`;

/** The note of a timed out run; without the limit the sentence keeps its meaning, only without the number. */
export const timeoutNote = (timeoutMin?: number): string =>
    timeoutMin ? `Stopped at the ${timeoutMin} min time limit.` : 'Stopped at the time limit.';

// ---------------------------------------------------------------------------------------------------------------
// The log of a run
// ---------------------------------------------------------------------------------------------------------------

/** How many lines of the log the card shows while it is collapsed (design, gaps L13). */
const SHORT_LOG_LINES: Record<NotebookRunView, number> = {
    starting: 0,
    running: 3,
    finished: 0,
    failed: 5,
    timeout: 3,
    stopped: 3,
};

/** The lines of a log text, without the empty ones a trailing newline leaves behind. */
export function logLines(text: string | undefined): string[] {
    const all = (text ?? '').split('\n');
    while (all.length > 0 && all[all.length - 1].trim() === '') all.pop();
    return all;
}

/** The short log of the collapsed card, with its heading; undefined when the state shows none. */
export function shortLog(
    view: NotebookRunView,
    logTail: string | undefined,
): { label: string; text: string; error: boolean } | undefined {
    const n = SHORT_LOG_LINES[view];
    if (!n) return undefined;
    const lines = logLines(logTail).slice(-n);
    if (lines.length === 0) return undefined;
    return {
        label: view === 'running' ? `Last ${n} log lines` : 'Last log lines',
        text: lines.join('\n'),
        // a failed run shows its lines in the red block of the step details (design, L13)
        error: view === 'failed',
    };
}

/** The whole log the gateway delivers (`log_tail`, at most 20 lines) with its heading (gap W2). */
export function fullLog(
    logTail: string | undefined,
): { label: string; text: string; lines: number } | undefined {
    const lines = logLines(logTail);
    if (lines.length === 0) return undefined;
    return { label: `Log · last ${lines.length} lines`, text: lines.join('\n'), lines: lines.length };
}

// ---------------------------------------------------------------------------------------------------------------
// Finding the job's approval
// ---------------------------------------------------------------------------------------------------------------

/** The jobs of the kind `notebook_run` that a run of the answer started (matched by their tool call). */
export function notebookJobsOf(jobs: WatchJob[], toolCallIds: Iterable<string>): WatchJob[] {
    const ids = new Set(toolCallIds);
    return jobs.filter((j) => j.kind === NOTEBOOK_RUN_KIND && !!j.tool_call_id && ids.has(j.tool_call_id));
}

/**
 * The approval that belongs to a job: the one of its tool call that carries the run's structured data. Older
 * gateway entries (no `notebook`) and approvals of other calls never match.
 */
export function notebookApprovalOf<T extends { tool_call_id?: string; notebook?: NotebookApprovalData }>(
    approvals: T[] | undefined,
    job: { tool_call_id?: string },
): T | undefined {
    if (!job.tool_call_id) return undefined;
    return approvals?.find((a) => a.tool_call_id === job.tool_call_id && !!a.notebook);
}
