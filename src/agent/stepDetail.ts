// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Details of a tool step, opened below its row in the step list (issue #58): what the agent actually ran and what came
// back. Pure mapping from a transcript step to blocks the component renders; it shows only what the gateway delivered
// (secrets stay redacted as they arrive).

import { formatBytes } from './files';
import { effectOf, formatMs, OUTCOME_LABEL, outcomeOf, outcomeReason, splitCall } from './format';
import type { Effect } from './format';
import type { Step } from './transcript';
import type { Approval, PiEvent, SocketCall, ToolExecution } from './types';

export type DetailTone = 'ok' | 'error' | 'muted';

export type DetailField = { label: string; value: string; mono?: boolean; tone?: DetailTone };

/**
 * One block of a step's details. code: a wrapping monospace block (clip: long text starts shortened with "Show all";
 * copy: with a copy button); fields: label and value rows; platform: one request to the platform; approval: an
 * approval the call asked for.
 */
export type DetailBlock =
    | { type: 'fields'; fields: DetailField[] }
    | {
          type: 'code';
          label: string;
          text: string;
          copy?: boolean;
          error?: boolean;
          clip?: boolean;
          /** Muted line below the block (e.g. that only the gateway's excerpt exists). */
          note?: string;
      }
    | { type: 'platform'; request: PlatformRequest; title?: string }
    | { type: 'approval'; approval: Approval };

export type StepDetailKind = 'bash' | 'file' | 'platform' | 'generic';

export type StepDetail = { kind: StepDetailKind; blocks: DetailBlock[] };

/** One request to the platform, from the socket log and the call's arguments. */
export type PlatformRequest = {
    method?: string;
    path?: string;
    query?: string[];
    /** JSON body, indented; or the `--body` argument as written when it is not JSON (`@file`, `-`). */
    body?: string;
    /** "200 · ok", "404 · error", "rejected by you" …; missing when the gateway logged no call (yet). */
    status?: string;
    tone?: DetailTone;
    durationMs?: number;
    effect?: Effect;
    approval?: Approval;
};

/** Lines and characters a clipped block shows before "Show all". */
export const CLIP_LINES = 20;
export const CLIP_CHARS = 3000;

/** Start of a long text: at most `maxLines` lines and `maxChars` characters; clipped tells whether anything is hidden. */
export function clipText(
    text: string,
    maxLines = CLIP_LINES,
    maxChars = CLIP_CHARS,
): { text: string; clipped: boolean; totalLines: number } {
    const lines = text.split('\n');
    let shown = lines.length > maxLines ? lines.slice(0, maxLines).join('\n') : text;
    if (shown.length > maxChars) shown = shown.slice(0, maxChars);
    return { text: shown, clipped: shown.length < text.length, totalLines: lines.length };
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** JSON value as indented text; text that is JSON gets indented, other text stays as it is. */
export function prettyJson(v: unknown): string {
    if (typeof v === 'string') {
        const t = v.trim();
        if (!/^[[{]/.test(t)) return v;
        try {
            return JSON.stringify(JSON.parse(t), null, 2);
        } catch {
            return v;
        }
    }
    if (v === undefined) return '';
    try {
        return JSON.stringify(v, null, 2) ?? String(v);
    } catch {
        return String(v);
    }
}

/** A platform response as the CLI prints it ("HTTP 200", maybe a Location line, then JSON): the JSON indented. */
export function formatResponse(text: string): string {
    const lines = text.split('\n');
    let i = 0;
    while (i < lines.length && i < 4 && /^(HTTP \d{3}\b|Location:|\s*$)/i.test(lines[i])) i++;
    const rest = lines.slice(i).join('\n');
    const pretty = prettyJson(rest);
    if (pretty === rest) return text;
    return i > 0 ? `${lines.slice(0, i).join('\n').trimEnd()}\n${pretty}` : pretty;
}

// --- reading agw-platform calls out of a shell command ---

type Word = { w: string } | { sep: true };

/**
 * Splits a shell command into words and separators (&&, ||, |, ;, newline), honouring quotes and backslashes. Only
 * good enough to find `agw-platform` calls and their arguments; anything unusual just yields fewer words.
 */
export function shellWords(cmd: string): Word[] {
    const out: Word[] = [];
    let cur = '';
    let has = false;
    const flush = () => {
        if (has) out.push({ w: cur });
        cur = '';
        has = false;
    };
    for (let i = 0; i < cmd.length; i++) {
        const c = cmd[i];
        if (c === '\\') {
            if (cmd[i + 1] === '\n') {
                i++;
                continue;
            }
            if (i + 1 < cmd.length) {
                cur += cmd[++i];
                has = true;
            }
            continue;
        }
        if (c === "'") {
            const end = cmd.indexOf("'", i + 1);
            if (end < 0) return out; // unbalanced: stop rather than guess
            cur += cmd.slice(i + 1, end);
            has = true;
            i = end;
            continue;
        }
        if (c === '"') {
            let j = i + 1;
            for (; j < cmd.length && cmd[j] !== '"'; j++) {
                if (cmd[j] === '\\' && /["\\$`]/.test(cmd[j + 1] ?? '')) j++;
                cur += cmd[j];
            }
            if (j >= cmd.length) return out;
            has = true;
            i = j;
            continue;
        }
        if (c === ' ' || c === '\t') {
            flush();
            continue;
        }
        if (c === '\n' || c === ';' || c === '|' || c === '&') {
            flush();
            if (out.length && !('sep' in out[out.length - 1])) out.push({ sep: true });
            if ((c === '|' || c === '&') && cmd[i + 1] === c) i++;
            continue;
        }
        cur += c;
        has = true;
    }
    flush();
    return out;
}

/** The `agw-platform request …` calls (method, path, query, body) and other subcommands named in a shell command. */
export function platformCallsInCommand(cmd: string): PlatformRequest[] {
    const words = shellWords(cmd);
    const out: PlatformRequest[] = [];
    for (let i = 0; i < words.length; i++) {
        const t = words[i];
        if ('sep' in t || !/(^|\/)agw-platform$/.test(t.w)) continue;
        const args: string[] = [];
        for (let j = i + 1; j < words.length; j++) {
            const a = words[j];
            if ('sep' in a) break;
            args.push(a.w);
        }
        if (args[0] !== 'request') {
            out.push({});
            continue;
        }
        const req: PlatformRequest = { method: args[1]?.toUpperCase(), path: args[2] };
        for (let k = 3; k < args.length; k++) {
            const a = args[k];
            const val = (flag: string) => {
                if (a === flag) return args[++k];
                if (a.startsWith(`${flag}=`)) return a.slice(flag.length + 1);
                return undefined;
            };
            const q = val('--query');
            if (q !== undefined) {
                req.query = [...(req.query ?? []), q];
                continue;
            }
            const b = val('--body');
            if (b !== undefined) req.body = prettyJson(b);
        }
        out.push(req);
    }
    return out;
}

/** Body of a platform-write approval: its preview without the "METHOD path" line it starts with. */
export function approvalBody(a: Approval): string | undefined {
    const p = a.preview?.startsWith(a.name) ? a.preview.slice(a.name.length) : a.preview;
    const t = p?.trim();
    return t ? prettyJson(t) : undefined;
}

/** "200 · ok", "404 · error", "rejected by you", "blocked: <reason>" for a platform call's result. */
export function platformStatus(result: string): { text: string; tone: DetailTone } {
    const outcome = outcomeOf(result);
    const code = /\b(\d{3})\b/.exec(result)?.[1];
    if (outcome === 'ok') return { text: code ? `${code} · ok` : 'ok', tone: 'ok' };
    if (outcome === 'error') return { text: code ? `${code} · error` : result || 'error', tone: 'error' };
    if (outcome === 'rejected') return { text: OUTCOME_LABEL.rejected, tone: 'muted' };
    const reason = outcomeReason(result);
    return { text: reason ? `${OUTCOME_LABEL[outcome]}: ${reason}` : OUTCOME_LABEL[outcome], tone: 'error' };
}

/**
 * The platform requests of a call: each logged socket call with its status, its body from the approval or from the
 * arguments (in order, matched by method and path); without logged calls the requests the arguments name.
 */
export function platformRequests(step: Step, named: PlatformRequest[]): PlatformRequest[] {
    const approvals = (step.approvals ?? []).filter((a) => a.kind === 'platform_write');
    const usedApprovals = new Set<Approval>();
    const takeApproval = (method?: string, path?: string): Approval | undefined => {
        const a = approvals.find((x) => {
            if (usedApprovals.has(x)) return false;
            const s = splitCall(x.name);
            return s.method === method && s.path.split('?')[0] === (path ?? '').split('?')[0];
        });
        if (a) usedApprovals.add(a);
        return a;
    };
    const usedNamed = new Set<number>();
    const takeNamed = (method?: string, path?: string): PlatformRequest | undefined => {
        const i = named.findIndex(
            (r, k) =>
                !usedNamed.has(k) && r.method === method && (r.path ?? '').split('?')[0] === (path ?? '').split('?')[0],
        );
        if (i < 0) return undefined;
        usedNamed.add(i);
        return named[i];
    };
    const calls: SocketCall[] = step.platformCalls ?? [];
    const out: PlatformRequest[] = calls.map((c) => {
        const { method, path } = splitCall(c.detail);
        const st = platformStatus(c.result ?? '');
        const n = takeNamed(method, path);
        const approval = takeApproval(method, path);
        return {
            method: method || undefined,
            path: path || undefined,
            query: n?.query,
            body: (approval && approvalBody(approval)) ?? n?.body,
            status: st.text,
            tone: st.tone,
            durationMs: c.duration_ms,
            effect: method ? effectOf(method, path) : undefined,
            approval,
        };
    });
    // requests the arguments name that the socket log does not have (yet): a pending approval, an older gateway
    named.forEach((r, k) => {
        if (usedNamed.has(k) || !r.method) return;
        const approval = takeApproval(r.method, r.path);
        out.push({
            ...r,
            body: (approval && approvalBody(approval)) ?? r.body,
            effect: effectOf(r.method, r.path ?? ''),
            approval,
            status: approval?.state === 'pending' ? 'waiting for your approval' : undefined,
            tone: approval?.state === 'pending' ? 'muted' : undefined,
        });
    });
    return out;
}

// --- per tool ---

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/** A value as one line of a field: strings as they are, everything else as compact JSON. */
function fieldValue(v: unknown): string {
    if (typeof v === 'string') return v;
    try {
        return JSON.stringify(v) ?? String(v);
    } catch {
        return String(v);
    }
}

/** Fields of the arguments not shown elsewhere (null and undefined left out). */
function restFields(args: Obj, used: string[], labels: Record<string, string> = {}): DetailField[] {
    return Object.entries(args)
        .filter(([k, v]) => !used.includes(k) && v !== null && v !== undefined)
        .map(([k, v]) => ({ label: labels[k] ?? k, value: fieldValue(v), mono: true }));
}

/** Last exit code the gateway recorded for the call, else the one pi's bash result names. */
export function exitCodeOf(step: Step): number | undefined {
    const execs = step.executions ?? [];
    for (let i = execs.length - 1; i >= 0; i--) if (execs[i].exit_code !== undefined) return execs[i].exit_code;
    const m = /Command exited with code (\d+)\s*$/.exec(step.result?.text ?? '');
    return m ? Number(m[1]) : undefined;
}

/** The execution whose output excerpt stands in when pi's result is missing (the last one with an excerpt). */
function excerptOf(step: Step): ToolExecution | undefined {
    const execs = step.executions ?? [];
    for (let i = execs.length - 1; i >= 0; i--) if (execs[i].output_excerpt !== undefined) return execs[i];
    return undefined;
}

/**
 * The output of a call: pi's result (red when it is an error), else the output so far while it runs, else the
 * gateway's excerpt with a note that only the excerpt exists.
 */
function outputBlock(step: Step, label: string, format: (t: string) => string = (t) => t): DetailBlock | undefined {
    const exit = exitCodeOf(step);
    if (step.result) {
        const err = step.result.isError;
        return {
            type: 'code',
            label: err ? 'Error' : label,
            text: step.result.text ? format(step.result.text) : '(no output)',
            copy: !!step.result.text,
            error: err,
            clip: true,
        };
    }
    if (step.partial !== undefined)
        return {
            type: 'code',
            label: `${label} so far`,
            text: step.partial || '(no output yet)',
            copy: !!step.partial,
            clip: true,
        };
    const ex = excerptOf(step);
    if (ex)
        return {
            type: 'code',
            label,
            text: ex.output_excerpt || '(no output)',
            copy: !!ex.output_excerpt,
            error: (exit !== undefined && exit !== 0) || !!ex.error,
            clip: true,
            note: `Only the gateway's excerpt is available (beginning and end, at most 4 KiB of ${formatBytes(
                ex.output_bytes,
            )}).`,
        };
    return undefined;
}

function bashDetail(step: Step, args: Obj): StepDetail {
    const command = str(args.command) ?? '';
    const fields: DetailField[] = [];
    const exit = exitCodeOf(step);
    if (exit !== undefined)
        fields.push({ label: 'Exit code', value: String(exit), mono: true, tone: exit === 0 ? 'ok' : 'error' });
    const dur = formatMs(step.durationMs);
    if (dur) fields.push({ label: 'Duration', value: dur });
    const execError = (step.executions ?? [])
        .map((e) => e.error)
        .filter(Boolean)
        .pop();
    if (execError) fields.push({ label: 'Gateway', value: execError, tone: 'error' });
    const cwd = str(args.cwd) ?? str(step.executions?.find((e) => typeof e.args?.cwd === 'string')?.args.cwd);
    if (cwd) fields.push({ label: 'Directory', value: cwd, mono: true });
    if (typeof args.timeout === 'number') fields.push({ label: 'Timeout', value: `${args.timeout} s` });
    if (args.run_in_background === true) fields.push({ label: 'Background', value: 'started as a background task' });
    fields.push(...restFields(args, ['command', 'cwd', 'timeout', 'run_in_background']));

    const blocks: DetailBlock[] = [];
    if (fields.length) blocks.push({ type: 'fields', fields });
    blocks.push({ type: 'code', label: 'Command', text: command, copy: true });
    const named = /(^|[\s/;&|(])agw-platform\b/.test(command) ? platformCallsInCommand(command) : [];
    const reqs = platformRequests(
        step,
        named.filter((r) => r.method),
    );
    reqs.forEach((r, i) =>
        blocks.push({
            type: 'platform',
            request: r,
            title: reqs.length > 1 ? `Platform call ${i + 1} of ${reqs.length}` : 'Platform call',
        }),
    );
    const isPlatform = reqs.length > 0;
    const out = outputBlock(step, isPlatform ? 'Response' : 'Output', isPlatform ? formatResponse : undefined);
    if (out) blocks.push(out);
    blocks.push(...otherApprovals(step, reqs));
    return { kind: 'bash', blocks };
}

/** Approvals of the call not shown with a platform request (uploads, internet, unmatched platform writes). */
function otherApprovals(step: Step, reqs: PlatformRequest[]): DetailBlock[] {
    const shown = new Set(reqs.map((r) => r.approval).filter(Boolean));
    return (step.approvals ?? []).filter((a) => !shown.has(a)).map((approval) => ({ type: 'approval', approval }));
}

function editBlocks(args: Obj): DetailBlock[] | undefined {
    const pair = (e: unknown): e is { oldText: string; newText: string } =>
        isObj(e) && typeof e.oldText === 'string' && typeof e.newText === 'string';
    let edits: unknown = args.edits;
    if (typeof edits === 'string') {
        try {
            edits = JSON.parse(edits);
        } catch {
            return undefined;
        }
    }
    if (edits === undefined && pair(args)) edits = [args];
    if (pair(edits)) edits = [edits];
    if (!Array.isArray(edits) || !edits.every(pair)) return undefined;
    const many = edits.length > 1;
    return edits.flatMap((e, i) => {
        const n = many ? ` ${i + 1}` : '';
        return [
            { type: 'code' as const, label: `Change${n}: old`, text: e.oldText, clip: true },
            { type: 'code' as const, label: `Change${n}: new`, text: e.newText, copy: true, clip: true },
        ];
    });
}

const FILE_TOOLS = ['read', 'write', 'edit', 'grep', 'find', 'ls'];

const FILE_LABELS: Record<string, string> = {
    path: 'Path',
    pattern: 'Pattern',
    glob: 'Glob',
    offset: 'Offset',
    limit: 'Limit',
    ignoreCase: 'Ignore case',
    literal: 'Literal',
    context: 'Context lines',
};

const RESULT_LABEL: Record<string, string> = {
    read: 'Content (start)',
    write: 'Result',
    edit: 'Result',
    grep: 'Matches',
    find: 'Files',
    ls: 'Entries',
};

function fileDetail(step: Step, tool: string, args: Obj): StepDetail {
    const blocks: DetailBlock[] = [];
    const fields: DetailField[] = [];
    for (const k of ['path', 'pattern', 'glob']) {
        const v = args[k];
        if (v !== undefined && v !== null) fields.push({ label: FILE_LABELS[k], value: fieldValue(v), mono: true });
    }
    const used = ['path', 'pattern', 'glob'];
    let edits: DetailBlock[] | undefined;
    if (tool === 'write' && typeof args.content === 'string') {
        fields.push({ label: 'Size', value: formatBytes(new TextEncoder().encode(args.content).length) });
        used.push('content');
    }
    if (tool === 'edit') {
        edits = editBlocks(args);
        if (edits) used.push('edits', 'oldText', 'newText');
    }
    fields.push(...restFields(args, used, FILE_LABELS));
    const dur = formatMs(step.durationMs);
    if (dur) fields.push({ label: 'Duration', value: dur });
    if (fields.length) blocks.push({ type: 'fields', fields });
    if (tool === 'write' && typeof args.content === 'string')
        blocks.push({ type: 'code', label: 'Content', text: args.content, copy: true, clip: true });
    if (edits) blocks.push(...edits);
    const out = outputBlock(step, RESULT_LABEL[tool] ?? 'Result');
    if (out) blocks.push(out);
    blocks.push(...otherApprovals(step, []));
    return { kind: 'file', blocks };
}

function mcpPlatformDetail(step: Step, name: string, args: Obj | undefined): StepDetail {
    const named: PlatformRequest[] = [];
    if (name === 'mcp_platform_request' && args && typeof args.method === 'string') {
        const q = args.query;
        named.push({
            method: args.method.toUpperCase(),
            path: str(args.path),
            query: isObj(q)
                ? Object.entries(q).map(([k, v]) => `${k}=${fieldValue(v)}`)
                : typeof q === 'string' && q
                ? [q]
                : undefined,
            body: args.body === undefined || args.body === null ? undefined : prettyJson(args.body),
        });
    }
    const blocks: DetailBlock[] = [];
    const reqs = platformRequests(step, named);
    reqs.forEach((r, i) =>
        blocks.push({
            type: 'platform',
            request: r,
            title: reqs.length > 1 ? `Platform call ${i + 1} of ${reqs.length}` : 'Platform call',
        }),
    );
    // a named tool (platform.list_datasets …) also shows its own arguments
    if (name !== 'mcp_platform_request' && args && Object.keys(args).length)
        blocks.push({ type: 'code', label: 'Arguments', text: prettyJson(args), copy: true, clip: true });
    const out = outputBlock(step, 'Response', formatResponse);
    if (out) blocks.push(out);
    blocks.push(...otherApprovals(step, reqs));
    return { kind: 'platform', blocks };
}

/** Maps a step to the blocks of its details, by tool. */
export function stepDetail(step: Step): StepDetail {
    const name = step.name ?? step.tool;
    const args = step.args;
    const obj = isObj(args) ? args : undefined;
    if (name === 'bash' && obj && typeof obj.command === 'string') return bashDetail(step, obj);
    if (name.startsWith('mcp_platform_')) return mcpPlatformDetail(step, name, obj);
    if (FILE_TOOLS.includes(name) && obj) return fileDetail(step, name, obj);
    const blocks: DetailBlock[] = [];
    const dur = formatMs(step.durationMs);
    if (dur) blocks.push({ type: 'fields', fields: [{ label: 'Duration', value: dur }] });
    if (args !== undefined && !(obj && Object.keys(obj).length === 0))
        blocks.push({ type: 'code', label: 'Arguments', text: prettyJson(args), copy: true, clip: true });
    const out = outputBlock(step, 'Result');
    if (out) blocks.push(out);
    blocks.push(...otherApprovals(step, []));
    return { kind: 'generic', blocks };
}

// --- live output of running calls ---

/** Text of a tool result object ({content: [{type: "text", text}]}) or plain text. */
export function resultText(v: unknown): string | undefined {
    if (typeof v === 'string') return v;
    if (!isObj(v) || !Array.isArray(v.content)) return undefined;
    return v.content
        .filter((b): b is { type: 'text'; text: string } => isObj(b) && b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text)
        .join('\n\n');
}

/**
 * Output so far of running calls, by tool call ID, from pi's events: `tool_execution_update.partialResult` replaces
 * the output (it is the whole output so far), the end of the call removes it (the stored result takes over).
 */
export function partialsReducer(state: Record<string, string>, ev: PiEvent): Record<string, string> {
    const e = ev as Obj;
    const id = str(e.toolCallId);
    if (!id) return state;
    if (e.type === 'tool_execution_update') {
        const text = resultText(e.partialResult);
        if (text === undefined || state[id] === text) return state;
        return { ...state, [id]: text };
    }
    if (e.type === 'tool_execution_end' && id in state) {
        const next = { ...state };
        delete next[id];
        return next;
    }
    return state;
}
