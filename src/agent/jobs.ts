// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Observed platform jobs of a chat (gateway A-E2, autonomy E4): the gateway watches a training or an image
// build with the user's token and reports its state. One source for every card that shows a job — the plan
// card, the step cards (own code E4), the edge cards (edge E4) and the pre-annotation cards (V4) — instead
// of each of them handling its own SSE event.
//
// `useJobs` loads the list once and keeps it current from the chat's stream (the SSE event `job`); the pure
// parts (fetchJobs, applyJobEvent, jobByToolCall, jobOfStep) carry the logic a test can check.

import { useEffect, useState } from 'react';

import { AGENT_BASE } from './login';
import { eventsUrl } from './api';
import type { EpochFigures, PlanStep, WatchOutput } from './plan';

/** One phase of a job's history (gateway issue K3). */
export type JobHistoryEntry = { at: string; text: string; percent?: number };

/** One observed platform job, as the gateway stores and sends it (gateway `store.WatchJob`). */
export type WatchJob = {
    id: string;
    chat_id: string;
    /** The plan the job belongs to; empty for a job outside a plan. */
    plan_id?: string;
    step_idx?: number;
    /** The tool call that started the job; empty for a job the gateway started itself. */
    tool_call_id?: string;
    /** The sort of job: training, image, task, notebook_run, edge_deployment, annotation_run, annotation_job,
     * `assessment` (the result checks, issue #112) … */
    kind: string;
    /** The platform's id of the object the job works on. */
    ref?: string;
    /** running | done | failed (gateway `store.Job*`); a failed read leaves the state as it is. */
    state: string;
    /** The percent the platform reported; absent while it reports none. */
    progress?: number;
    /** The platform's line about the job. */
    message?: string;
    /** The estimated end, as the gateway computed it (D2.4). */
    eta?: string;
    /** The tail of the job's log. */
    log_tail?: string;
    outputs?: WatchOutput[];
    /** The last epoch a training job reported (gateway issue #221). */
    last_epoch?: EpochFigures;
    /**
     * The phases the job went through, oldest first (gateway issue K3): when each began, its words and, where the
     * platform knew it, the percent. The last entry is the phase the job is in; absent on a gateway without history.
     */
    history?: JobHistoryEntry[];
    /** Reading calls that failed in a row (D2.3). */
    fail_reads?: number;
    started_at?: string;
    checked_at?: string;
    ended_at?: string;
    /** The run's own start and end, as the run wrote them (issue #203); only the kind `notebook_run` has them. */
    run_started_at?: string;
    run_ended_at?: string;
    /**
     * The address the user can open for this job, as the gateway built it (own code C-E4): the kind `notebook_run`
     * writes the run in the user's JupyterHub there, every other kind leaves the field empty. A card never builds
     * such an address of its own; without it, it offers no link.
     */
    link?: string;
    /**
     * Who stopped this job (own code C-E4, the words the aborts of issue #120 use): `user` for the stop over
     * `POST /api/chats/{id}/jobs/{job}/stop`, `agent` for a stop of the agent's own tools. Missing while nobody
     * stopped it — a card then claims nothing about who did.
     */
    stopped_by?: 'user' | 'agent';
};

/** Job states of the gateway (`internal/store/watch.go`: JobRunning, JobDone, JobFailed). */
export const JOB_RUNNING = 'running';
export const JOB_DONE = 'done';
export const JOB_FAILED = 'failed';

/** The SSE event "job": a job's new state, with what changed. */
export type JobEvent = {
    /** progress (the job runs on), next (it is observed on as another kind), ended. */
    change: string;
    job: WatchJob;
};

/** Jobs of a chat, newest first; a chat without the route (older gateway, 404) has none. */
export async function fetchJobs(chatId: string): Promise<WatchJob[]> {
    const res = await fetch(`${AGENT_BASE}/api/chats/${encodeURIComponent(chatId)}/jobs`, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
    });
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const list = (await res.json()) as WatchJob[];
    return Array.isArray(list) ? list : [];
}

/** The job a tool call started; undefined when none matches. */
export function jobByToolCall(jobs: readonly WatchJob[], toolCallId: string | undefined): WatchJob | undefined {
    if (!toolCallId) return undefined;
    return jobs.find((j) => j.tool_call_id === toolCallId);
}

/** The job a plan step waits for (the step names it); the newest one when several carry the name. */
export function jobOfStep(jobs: WatchJob[], step: PlanStep | undefined): WatchJob | undefined {
    const want = step?.watch_job;
    if (!want) return undefined;
    return jobs.find((j) => j.id === want);
}

/** The job of a plan step by the plan and the step's number. */
export function jobOfPlanStep(jobs: WatchJob[], planId: string, idx: number): WatchJob | undefined {
    return jobs.find((j) => j.plan_id === planId && j.step_idx === idx);
}

/**
 * The list with one event applied: the job replaces the known one (same id) or is added in front. An event
 * for an unknown job of another chat is ignored.
 */
export function applyJobEvent(jobs: WatchJob[], ev: JobEvent, chatId?: string): WatchJob[] {
    const job = ev?.job;
    if (!job?.id) return jobs;
    if (chatId && job.chat_id && job.chat_id !== chatId) return jobs;
    const rest = jobs.filter((j) => j.id !== job.id);
    return [job, ...rest];
}

/** The payload of an SSE data line when it is a `job` event of the chat; anything else is ignored. */
export function jobEvent(text: string): JobEvent | undefined {
    let ev: unknown;
    try {
        ev = JSON.parse(text);
    } catch {
        return undefined;
    }
    if (!ev || typeof ev !== 'object') return undefined;
    const { kind, data } = ev as { kind?: unknown; data?: unknown };
    if (kind !== 'job' || !data || typeof data !== 'object') return undefined;
    const d = data as { change?: unknown; job?: unknown };
    if (!d.job || typeof d.job !== 'object') return undefined;
    return { change: typeof d.change === 'string' ? d.change : 'progress', job: d.job as WatchJob };
}

/** The part of EventSource the hook uses (replaceable in tests). */
export type JobSource = {
    onmessage: ((ev: MessageEvent<string>) => void) | null;
    onerror: ((ev: Event) => void) | null;
    close: () => void;
};

/** Openers for the load and the stream, so a test can take both apart. */
export type JobsHooks = {
    openStream: (chatId: string) => JobSource;
};

const defaultHooks: JobsHooks = {
    openStream: (chatId) => new EventSource(eventsUrl(chatId), { withCredentials: true }) as unknown as JobSource,
};

/**
 * The observed jobs of a chat, loaded once and kept current from the chat's stream. Without a chat the list is
 * empty. A failed load keeps what is known; a stream that breaks is reconnected by EventSource itself.
 */
export function useJobs(chatId: string | undefined, hooks: JobsHooks = defaultHooks): WatchJob[] {
    const [jobs, setJobs] = useState<WatchJob[]>([]);

    useEffect(() => {
        if (!chatId) {
            setJobs([]);
            return undefined;
        }
        let alive = true;
        fetchJobs(chatId)
            .then((list) => {
                if (alive) setJobs(list);
            })
            .catch(() => {
                // keep what is known; the stream may still deliver the current state
            });
        const src = hooks.openStream(chatId);
        src.onmessage = (msg) => {
            const ev = jobEvent(msg.data);
            if (ev) setJobs((list) => applyJobEvent(list, ev, chatId));
        };
        src.onerror = () => {
            // EventSource reconnects on its own; the next load after a remount brings the state
        };
        return () => {
            alive = false;
            src.close();
        };
    }, [chatId, hooks]);

    return jobs;
}
