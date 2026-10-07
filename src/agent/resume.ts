// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Resuming a chat in a fresh sandbox, from the SSE event "resume" (API.md, ResumeStep). The steps are only known
// live: pi stores nothing about them, so after a page reload the block is gone. Pure state logic and texts, after the
// gateway's web UI (web/src/lib/resume.ts, applyResumeStep in web/src/lib/stream.ts). Since issue #31 a chat the
// gateway let idle is resumed as soon as it is opened (POST …/resume, `shouldResumeOnOpen`), not on the next message.

import type { Chat, ResumePhase, ResumeStep } from './types';

export type StepPhase = Exclude<ResumePhase, 'ready' | 'failed'>;

/** The steps in the order the gateway runs them. */
export const RESUME_PHASES: StepPhase[] = ['acquire', 'session', 'settings', 'workspace', 'inputs'];

export type ResumeStepView = {
    phase: StepPhase;
    /** pending: not started yet. */
    status: 'pending' | ResumeStep['status'];
    detail?: string;
    size?: number;
    files?: number;
    ms?: number;
};

export type ResumeView = {
    id: string;
    state: 'running' | 'done' | 'failed';
    /** All five phases, the ones not reached yet as pending. */
    steps: ResumeStepView[];
    totalMs?: number;
    error?: string;
    /** Highest stored message seq when the resume started; the user message that triggered it comes later. */
    afterSeq: number;
    /** The first sandbox of a new chat (gateway `start`), not a resume of an idle chat. */
    start?: boolean;
    /** Started by opening the chat (POST …/resume), not by a message: sits where it started, before later messages. */
    opened?: boolean;
};

const freshSteps = (): ResumeStepView[] => RESUME_PHASES.map((phase) => ({ phase, status: 'pending' }));

/**
 * Applies one SSE step. A step with a new id starts a new resume (earlier ones stay, finished). Steps of an
 * unknown phase are ignored; "ready" and "failed" end the resume.
 */
export function applyResumeStep(
    list: ResumeView[],
    step: ResumeStep,
    lastSeq: number,
    opened = false,
): ResumeView[] {
    const i = list.findIndex((r) => r.id === step.id);
    const found: ResumeView =
        i >= 0
            ? list[i]
            : { id: step.id, state: 'running', steps: freshSteps(), afterSeq: lastSeq, ...(opened && { opened }) };
    const cur: ResumeView = step.start && !found.start ? { ...found, start: true } : found;
    let next: ResumeView;
    if (step.phase === 'ready') {
        next = { ...cur, state: 'done', totalMs: step.ms };
    } else if (step.phase === 'failed') {
        // a step still marked running failed with it
        const steps = cur.steps.map((s) => (s.status === 'running' ? { ...s, status: 'error' as const } : s));
        next = { ...cur, steps, state: 'failed', totalMs: step.ms, error: step.detail };
    } else if (RESUME_PHASES.includes(step.phase)) {
        const view: ResumeStepView = {
            phase: step.phase,
            status: step.status,
            detail: step.detail,
            size: step.size,
            files: step.files,
            ms: step.ms,
        };
        next = { ...cur, steps: cur.steps.map((s) => (s.phase === step.phase ? view : s)) };
    } else {
        return list;
    }
    if (i < 0) return [...list, next];
    const out = list.slice();
    out[i] = next;
    return out;
}

/**
 * Ends resumes still marked running (their "ready" got lost, e.g. while the stream reconnected). Called on pi
 * events: the gateway sends all resume steps before the first pi event of the instruction.
 */
export function closeResumes(list: ResumeView[]): ResumeView[] {
    if (!list.some((r) => r.state === 'running')) return list;
    return list.map((r) =>
        r.state === 'running'
            ? {
                  ...r,
                  state: 'done',
                  steps: r.steps.map((s) => (s.status === 'running' ? { ...s, status: 'done' } : s)),
              }
            : r,
    );
}

/** Is a resume running right now? */
export const resumeRunning = (list: ResumeView[]) => list.some((r) => r.state === 'running');

export const RESUME_STEP_LABEL: Record<StepPhase, string> = {
    acquire: 'Take a sandbox from the pool',
    session: 'Restore the session',
    settings: 'Apply settings',
    workspace: 'Restore the workspace',
    inputs: 'Provide the inputs',
};

/** Bytes in binary units: "512 B", "1.2 KiB", "3.4 MiB". */
export function formatBytes(n: number): string {
    if (!Number.isFinite(n) || n < 0) return '';
    if (n < 1024) return `${n} B`;
    const units = ['KiB', 'MiB', 'GiB', 'TiB'];
    let v = n / 1024;
    let u = 0;
    while (v >= 1024 && u < units.length - 1) {
        v /= 1024;
        u++;
    }
    return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[u]}`;
}

const filesText = (n: number) => (n === 1 ? '1 file' : `${n} files`);

/** Addition after a finished step, e.g. "1.2 MiB, 14 files" or "no backup"; nothing while it is open. */
export function stepDetail(s: ResumeStepView): string | undefined {
    if (s.status === 'pending' || s.status === 'running') return undefined;
    const parts: string[] = [];
    if ((s.phase === 'workspace' || s.phase === 'inputs') && s.files !== undefined && s.size !== undefined) {
        parts.push(s.files === 0 ? 'no files' : `${formatBytes(s.size)}, ${filesText(s.files)}`);
    } else if (s.phase === 'session' && s.size !== undefined) {
        parts.push(formatBytes(s.size));
    }
    // for "acquire" the detail is the internal slot id; not shown
    if (s.detail && s.phase !== 'acquire') parts.push(s.detail);
    return parts.length ? parts.join(' · ') : undefined;
}

/** Head line of the block; once finished, the line that stays in the transcript. */
export function resumeSummary(r: ResumeView, formatMs: (ms: number | undefined) => string | undefined): string {
    if (r.state === 'running') return r.start ? 'Starting a sandbox for the chat …' : 'Resuming the chat …';
    if (r.state === 'failed') {
        const why = r.error ? `: ${r.error}` : '';
        return r.start ? `Starting the sandbox failed${why}` : `Resuming failed${why}`;
    }
    const total = formatMs(r.totalMs);
    const warn = r.steps.some((s) => s.status === 'warning') ? ' · with warning' : '';
    return `${r.start ? 'Started' : 'Resumed'} in a fresh sandbox${total ? ` · ${total}` : ''}${warn}`;
}

/**
 * Position of a resume a message triggered in the transcript: right after the first user message stored after it
 * started (the message that triggered it), otherwise at the end. Returns the index of the item to insert after, or
 * -1 for the end. A resume on opening the chat sits before the first item stored after it started instead
 * (`noticeAnchor`), so a message typed meanwhile follows it.
 */
export function resumeAnchor(items: { kind: string; seq?: number }[], r: Pick<ResumeView, 'afterSeq'>): number {
    return items.findIndex((it) => it.kind === 'user' && it.seq !== undefined && it.seq > r.afterSeq);
}

/**
 * Should opening this chat resume it (POST …/resume)? Only a chat the gateway let idle (`dormant`) that is not
 * being resumed or started already, and only once per opened view (`requested`): when the gateway lets an open chat
 * idle again later, the next message resumes it, so an open tab does not keep a sandbox busy.
 */
export function shouldResumeOnOpen(
    chat: Pick<Chat, 'state' | 'resuming' | 'starting'> | undefined,
    requested: boolean,
): boolean {
    return !!chat && !requested && chat.state === 'dormant' && !chat.resuming && !chat.starting;
}
