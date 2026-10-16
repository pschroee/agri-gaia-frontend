// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The deployment card of the transcript (edge D-E4, design `prototyp/entwuerfe/edge-deployment-card/`): the answer of
// the agent's edge deployment tools as one card instead of JSON. Pure logic, texts and times — the component
// (`components/DeploymentCard.tsx`) only lays them out.
//
// The state comes from the tool result (D4.1); what changes while the device pulls the image comes from the job the
// gateway observes for the deployment (`internal/watch/edge.go`, kind `edge_deployment`), which `useJobs` keeps
// current. No polling of its own.

import { JOB_DONE, JOB_FAILED, JOB_RUNNING, jobByToolCall } from './jobs';
import type { WatchJob } from './jobs';
import { shellWords } from './stepDetail';
import type { Step } from './transcript';

/** The three deployment tools of the gateway (`internal/platform/tools_edge.go`, `tools_edge_undeploy.go`). */
export type DeploymentTool = 'status' | 'start' | 'undeploy';

/**
 * The names the tools answer to: the MCP name as the transcript shortens it (`platform.status`), the raw name pi calls
 * it (with the `mcp_` prefix) and the subcommand of the command line tool.
 */
const TOOL_NAMES: Record<string, DeploymentTool> = {
    'platform.deployment_status': 'status',
    platform_deployment_status: 'status',
    mcp_platform_deployment_status: 'status',
    'deployment-status': 'status',
    'platform.start_deployment': 'start',
    platform_start_deployment: 'start',
    mcp_platform_start_deployment: 'start',
    'start-deployment': 'start',
    'platform.undeploy': 'undeploy',
    platform_undeploy: 'undeploy',
    mcp_platform_undeploy: 'undeploy',
    undeploy: 'undeploy',
};

/** The deployment tool a name belongs to, in any of its spellings; undefined for everything else. */
export function deploymentTool(name: string | undefined): DeploymentTool | undefined {
    return name ? TOOL_NAMES[name] : undefined;
}

/** The subcommand of `agw-platform` (the CLI binding) that calls the same tool. */
const CLI_COMMANDS: Record<string, DeploymentTool> = {
    'deployment-status': 'status',
    'start-deployment': 'start',
    undeploy: 'undeploy',
};

/** The shell command of a step, when its arguments carry one. */
function commandOf(args: unknown): string | undefined {
    if (typeof args === 'string') return args;
    if (!args || typeof args !== 'object') return undefined;
    const c = (args as { command?: unknown }).command;
    return typeof c === 'string' ? c : undefined;
}

/**
 * The deployment tool a step called: the MCP tool directly, or `agw-platform <subcommand>` inside a `bash` call (the CLI
 * binding). Anything else: undefined, and the step keeps today's display.
 */
export function deploymentToolOf(step: Pick<Step, 'tool' | 'name' | 'args'>): DeploymentTool | undefined {
    const direct = deploymentTool(step.name) ?? deploymentTool(step.tool);
    if (direct) return direct;
    const command = commandOf(step.args);
    if (!command) return undefined;
    const words = shellWords(command);
    for (let i = 0; i < words.length; i++) {
        const w = words[i];
        if ('sep' in w || !/(^|\/)agw-platform$/.test(w.w)) continue;
        const sub = words[i + 1];
        if (sub && !('sep' in sub)) {
            const tool = CLI_COMMANDS[sub.w];
            if (tool) return tool;
        }
    }
    return undefined;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * The first JSON object inside a tool result text. The platform tools answer as `<HTTP line>
 * {…}` (and the command line prints the same), followed by notes; the object is read out of it so both bindings and
 * any note after it work. Without an object: undefined.
 */
export function jsonObjectIn(text: string): unknown {
    for (let i = text.indexOf('{'); i >= 0; i = text.indexOf('{', i + 1)) {
        let depth = 0;
        let inString = false;
        let escaped = false;
        for (let j = i; j < text.length; j++) {
            const c = text[j];
            if (inString) {
                if (escaped) escaped = false;
                else if (c === '\\') escaped = true;
                else if (c === '"') inString = false;
                continue;
            }
            if (c === '"') inString = true;
            else if (c === '{') depth++;
            else if (c === '}') {
                depth--;
                if (depth > 0) continue;
                try {
                    return JSON.parse(text.slice(i, j + 1));
                } catch {
                    break; // not JSON after all: try the next opening brace
                }
            }
        }
    }
    return undefined;
}

/** The platform's status of a deployment (the chip); `failed` is not one of them (edge D2, F3). */
export type DeploymentStatus = 'created' | 'deployed' | 'undeployed';

export const isDeploymentStatus = (s: string | undefined): s is DeploymentStatus =>
    s === 'created' || s === 'deployed' || s === 'undeployed';

/** The edge device of a deployment. */
export type DeploymentDevice = {
    id?: string;
    name?: string;
    /** Last heartbeat within five minutes (the gateway computes it, `EdgeOnlineWindow`). */
    online?: boolean;
    lastHeartbeat?: string;
};

/** The platform task that started or took the deployment back. */
export type DeploymentTask = {
    id?: string;
    status?: string;
    message?: string;
    /** completion_percentage of the task; the live percent comes from the job. */
    percent?: number;
    createdAt?: string;
    startedAt?: string;
    finishedAt?: string;
};

/** What the card shows, read from the result of one tool call. */
export type DeploymentCardData = {
    id: string;
    name: string;
    status: DeploymentStatus;
    device?: DeploymentDevice;
    image?: string;
    /** Port mappings as the card writes them ("18100 → 8000/tcp"). */
    ports: string[];
    containerIdPresent?: boolean;
    createdAt?: string;
    task?: DeploymentTask;
    /** The gateway's own hint (edge D2.6); where it is missing the card uses its short wording. */
    hint?: string;
};

/** A value as text: strings trimmed, numbers as written; empty and anything else: undefined. */
function textOf(v: unknown): string | undefined {
    if (typeof v === 'string') return v.trim() || undefined;
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    return undefined;
}

/** Port mappings as the card writes them: the arrow of the design (U+2192), the gateway sends `->`. */
export function portList(v: unknown): string[] {
    if (!Array.isArray(v)) return [];
    return v.map((p) => (typeof p === 'string' ? p.replace(/\s*->\s*/, ' → ').trim() : '')).filter(Boolean);
}

function deviceOf(v: unknown): DeploymentDevice | undefined {
    if (!isObj(v)) return undefined;
    return {
        id: textOf(v.id),
        name: textOf(v.name),
        online: typeof v.online === 'boolean' ? v.online : undefined,
        lastHeartbeat: textOf(v.last_heartbeat),
    };
}

function taskOf(v: unknown): DeploymentTask | undefined {
    if (!isObj(v)) return undefined;
    const percent = typeof v.completion_percentage === 'number' ? v.completion_percentage : undefined;
    return {
        id: textOf(v.id),
        status: textOf(v.status),
        message: textOf(v.message),
        percent,
        // the gateway names the platform's creation_date `creation_date`; both spellings are read (F1)
        createdAt: textOf(v.creation_date) ?? textOf(v.created_at),
        startedAt: textOf(v.started_at),
        finishedAt: textOf(v.finished_at),
    };
}

/**
 * The card of a tool result, or null when the call is not a deployment tool of the given name or its result is not the
 * full JSON of `platform_deployment_status` (edge D-E4, "unvollständiges JSON → null"): the transcript then keeps its
 * own display. `result` is the text of the tool result, as the agent got it.
 *
 * `start_deployment` and `undeploy` answer with only the deployment id, the task and a note (edge D2/D3); their name and
 * device never travel, so no card is drawn from them — that is reported, not invented.
 */
export function deploymentCardOf(tool: string, result: unknown): DeploymentCardData | null {
    if (!deploymentTool(tool)) return null;
    const json = isObj(result) ? result : typeof result === 'string' ? jsonObjectIn(result) : undefined;
    if (!isObj(json)) return null;
    const id = textOf(json.deployment_id);
    const name = textOf(json.name);
    const status = textOf(json.status);
    if (!id || !name || !isDeploymentStatus(status)) return null;
    return {
        id,
        name,
        status,
        device: deviceOf(json.device),
        image: textOf(json.image),
        ports: portList(json.ports),
        containerIdPresent:
            typeof json.docker_container_id_present === 'boolean' ? json.docker_container_id_present : undefined,
        createdAt: textOf(json.created_at),
        task: taskOf(json.task),
        hint: textOf(json.hint),
    };
}

/** The sort of job the gateway starts for a deployment (`internal/watch/edge.go`). */
export const EDGE_JOB_KIND = 'edge_deployment';

/** The deployment a job reference names: the gateway writes `deployment:7|task:12`. */
export function deploymentRefId(ref: string | undefined): string | undefined {
    for (const part of (ref ?? '').split('|')) {
        const i = part.indexOf(':');
        if (i > 0 && part.slice(0, i) === 'deployment') {
            const id = part.slice(i + 1).trim();
            if (id) return id;
        }
    }
    return undefined;
}

/**
 * The job that observes a deployment: the one its call started, else the newest job whose reference names the same
 * deployment — the status call starts no job of its own, and the card of the start call carries no name yet.
 */
export function jobOfDeployment(jobs: readonly WatchJob[], id: string): WatchJob | undefined {
    return jobs.find((j) => j.kind === EDGE_JOB_KIND && deploymentRefId(j.ref) === id);
}

/** A card with the step it belongs to and the job that keeps it current. */
export type DeploymentCardEntry = { key: string; data: DeploymentCardData; job?: WatchJob };

/** The deployment cards of one run of tool calls, in their order; a step without such a result is left out. */
export function deploymentCardsIn(steps: readonly Step[], jobs: readonly WatchJob[]): DeploymentCardEntry[] {
    const out: DeploymentCardEntry[] = [];
    for (const s of steps) {
        const tool = deploymentToolOf(s);
        if (!tool) continue;
        const data = deploymentCardOf(tool, s.result?.text);
        if (!data) continue;
        const job = jobByToolCall(jobs, s.callId ?? s.id) ?? jobOfDeployment(jobs, data.id);
        out.push({ key: s.id, data, job });
    }
    return out;
}

/** The state the card shows (edge D-E4), derived as the plan fixed it. */
export type DeploymentView = 'created' | 'starting' | 'deployed' | 'failed' | 'offline' | 'undeployed';

/** Task states the platform uses while the task runs (`db/models.py`, TaskStatus). */
const TASK_RUNNING = new Set(['created', 'inprogress', 'scheduled', 'running']);

/**
 * The state of the card: the device decides over `deployed` (offline wins, the chip keeps the platform's word), a
 * failed task or job is `failed`, a running one is `starting` (a running job is newer than a stored result), and a job
 * the gateway finished says the start went through. Otherwise the platform's own status.
 */
export function deploymentView(data: DeploymentCardData, job?: WatchJob): DeploymentView {
    if (data.device?.online === false && data.status === 'deployed') return 'offline';
    if (job?.state === JOB_FAILED || data.task?.status === 'failed') return 'failed';
    if (job?.state === JOB_RUNNING || TASK_RUNNING.has(data.task?.status ?? '')) return 'starting';
    if (job?.state === JOB_DONE) return data.status === 'undeployed' ? 'undeployed' : 'deployed';
    return data.status;
}

// --- Texts of the card (design, "Texte im Wortlaut") -----------------------------------------------------------

export const NO_TASK = 'No task yet';
export const PULLING_IMAGE = 'Pulling image on device…';
export const CONTAINER_STARTED = 'Container started on device';
export const CONTAINER_REMOVED = 'Container stopped and removed';
export const TASK_FAILED = 'The start failed.';
export const HINT_CREATED = 'Nothing runs until the deployment is started.';
export const HINT_DEPLOYED = 'The platform does not check whether the container still runs.';
export const HINT_DEVICE_LATE = 'The device has not checked in for more than 5 minutes.';
export const emptyHint = (name: string) => `A container named ${name} may be left on the device and needs manual removal.`;

/** The task line of a state: its message and the status word on the right (empty in `created`). */
export function taskLine(view: DeploymentView, data: DeploymentCardData): { text: string; status: string } {
    switch (view) {
        case 'created':
            return { text: NO_TASK, status: '' };
        case 'starting':
            return { text: PULLING_IMAGE, status: 'in progress' };
        case 'failed':
            return { text: data.task?.message || TASK_FAILED, status: 'failed' };
        case 'deployed':
        case 'offline':
            return { text: CONTAINER_STARTED, status: 'completed' };
        default:
            return { text: CONTAINER_REMOVED, status: 'completed' };
    }
}

/** The hint line of a state; `warn` decides between the info and the warning icon. */
export type DeploymentHint = { text: string; warn: boolean };

/**
 * The hint of a state. A device that has not checked in brings its warning in every state but `failed` (there the
 * failed start is what the user has to act on) and `undeployed` (nothing runs any more). The gateway's own `hint`
 * carries the exact wording of the platform's limits (F3, F11) where it applies; the short texts here are the design's
 * fallback.
 */
export function deploymentHint(view: DeploymentView, data: DeploymentCardData): DeploymentHint | undefined {
    if (view === 'failed') return { text: data.hint || emptyHint(data.name), warn: true };
    if (view === 'offline' || (data.device?.online === false && data.status !== 'undeployed'))
        return { text: HINT_DEVICE_LATE, warn: true };
    if (view === 'deployed') return { text: data.hint || HINT_DEPLOYED, warn: false };
    if (view === 'created') return { text: HINT_CREATED, warn: false };
    return undefined;
}

// --- Times (design, L9) ----------------------------------------------------------------------------------------

const NO_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?$/;

/**
 * A timestamp as milliseconds. The platform sends UTC without a zone ("2026-10-16T14:52:07", F8), which JavaScript
 * would read as local time; such a value is read as UTC. A value with a zone, or without a time, is taken as it is.
 */
export function parseTime(v: string | undefined): number | undefined {
    if (!v) return undefined;
    const t = Date.parse(NO_ZONE.test(v) ? `${v}Z` : v);
    return Number.isNaN(t) ? undefined : t;
}

const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
const timeSecFmt = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
});

const pad = (n: number) => String(n).padStart(2, '0');
const dateText = (t: number) => {
    const d = new Date(t);
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
};

/** "today" / "yesterday" / "16.10.2026", in the reader's time zone. */
function dayPart(t: number, now: number): string {
    const day = (x: number | Date) => (x instanceof Date ? x : new Date(x)).toDateString();
    if (day(t) === day(now)) return 'today';
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (day(t) === day(yesterday)) return 'yesterday';
    return dateText(t);
}

/** A time in the details: "today, 14:52:07"; a missing value is "—" (W2). */
export function detailTimeText(v: string | undefined, now: number): string {
    const t = parseTime(v);
    return t === undefined ? '—' : `${dayPart(t, now)}, ${timeSecFmt.format(t)}`;
}

/** The moment in the head of the page card: "today, 14:52". */
export function updatedText(t: number | undefined, now: number): string | undefined {
    return t === undefined ? undefined : `${dayPart(t, now)}, ${timeFmt.format(t)}`;
}

/** How long ago a device checked in: "just now", "2 min ago", "3 h ago", else the date (L9). */
export function lastSeenText(v: string | undefined, now: number): string {
    const t = parseTime(v);
    if (t === undefined) return '—';
    const s = Math.max(0, Math.round((now - t) / 1000));
    if (s < 60) return 'just now';
    const min = Math.floor(s / 60);
    if (min < 60) return `${min} min ago`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h} h ago`;
    return dateText(t);
}

/**
 * When the card was last updated (L9): the newest moment in the tool result and in the job that belongs to it. A job
 * the gateway keeps checking is newer than the stored result, which is what the line is for.
 */
export function updatedAt(data: DeploymentCardData, job?: WatchJob): number | undefined {
    const times = [
        data.createdAt,
        data.task?.startedAt,
        data.task?.finishedAt,
        data.task?.createdAt,
        job?.started_at,
        job?.checked_at,
        job?.ended_at,
    ]
        .map(parseTime)
        .filter((t): t is number => t !== undefined);
    return times.length ? Math.max(...times) : undefined;
}

/** One row of the details. */
export type DeploymentDetail = { label: string; value: string; mono?: boolean; truncate?: boolean };

/**
 * The six rows of the details, always in this order; what the platform does not deliver is "—" (F1, W2). The platform's
 * task has only a creation date (`db/models.py`), no start or finish, so those two rows stay "—" until the gateway
 * passes them on.
 */
export function deploymentDetails(data: DeploymentCardData, now: number): DeploymentDetail[] {
    return [
        { label: 'Task ID', value: data.task?.id ?? '—', mono: true, truncate: true },
        {
            label: 'Container ID present',
            value: data.containerIdPresent === undefined ? '—' : data.containerIdPresent ? 'Yes' : 'No',
        },
        { label: 'Created', value: detailTimeText(data.createdAt, now) },
        { label: 'Task started', value: detailTimeText(data.task?.startedAt, now) },
        { label: 'Task finished', value: detailTimeText(data.task?.finishedAt, now) },
        { label: 'Device last check-in', value: detailTimeText(data.device?.lastHeartbeat, now) },
    ];
}

// --- Shortening long values (design `smartTail`/`mid`, L10) ----------------------------------------------------

/** What the head and the tail of a shortened value are; an empty tail means the value is not split. */
export type MidSplit = { head: string; tail: string };

/** Where a tail may start: a version, a tag, a port or a device number stays readable. */
const BOUNDARY = /(?=[-_.:/])/;

/** The tail of a value: from the back at the word boundaries, until `min` is reached and `cap` is not exceeded. */
function smartTail(s: string, min: number, cap: number, re: RegExp): string {
    let tail = '';
    const parts = s.split(re);
    for (let i = parts.length - 1; i >= 0; i--) {
        const next = parts[i] + tail;
        if (next.length > cap) break;
        tail = next;
        if (tail.length >= min) break;
    }
    return tail.length < 3 ? s.slice(-min) : tail;
}

/**
 * Splits a long value into the head that the browser ellipsizes and the tail that stays visible (L10). `cap` is the
 * longest tail, `min` what it should reach; without `cap` the tail is simply the last `min` characters (the task id).
 * A value only a little longer than its tail is not split at all.
 */
export function midSplit(s: string, limits: { min: number; cap?: number; boundary?: RegExp }): MidSplit {
    const tail =
        limits.cap === undefined
            ? s.slice(-limits.min)
            : smartTail(s, limits.min, limits.cap, limits.boundary ?? BOUNDARY);
    return s.length <= tail.length + 3 ? { head: s, tail: '' } : { head: s.slice(0, s.length - tail.length), tail };
}
