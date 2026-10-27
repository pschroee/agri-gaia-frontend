// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The history of a plan step as rows (issue #245): what the platform job already did, what it does now and what
// still comes. The finished and the current phases come from the job's history (gateway issue K3); the phases to come
// from a fixed list per kind of job, in the words of the gateway's phases (K3, K4).

import type { JobHistoryEntry, WatchJob } from './jobs';
import { JOB_RUNNING } from './jobs';
import { clockSeconds } from './planDetail';
import { durationText } from './plan';

export type HistoryState = 'done' | 'running' | 'pending';

export type HistoryRow = {
    text: string;
    state: HistoryState;
    /** The clock time a done phase began, or how long the current one has lasted; '' for a phase to come. */
    when: string;
    percent?: number;
};

const BUILD_PHASES = ['Preparing the build', 'Building the image', 'Pushing the image to the registry'];

/** The phases a kind of job goes through, in order; empty where the phases are not known in advance. */
export function phasesOf(kind: string | undefined, trainingBuild: boolean): string[] {
    if (kind === 'image_build') return BUILD_PHASES;
    if (kind === 'platform_task' && trainingBuild) return [...BUILD_PHASES, 'Creating the training container'];
    return [];
}

/**
 * "Building the image · step 3/9 · RUN pip …", "Building the image (step 3/9)" and "Building the image" name the same
 * phase: the words up to the first " · " (as the gateway's `store.PhaseKey` cuts them).
 */
const phaseKey = (text: string): string =>
    // the backend ends a training build with "Train Container #N created.", the words of its last phase (B27)
    /^train container #\d+ created/i.test(text.trim())
        ? 'creating the training container'
        : phaseText(text);

const phaseText = (text: string): string =>
    text
        .split(' · ')[0]
        .replace(/\s*\([^)]*\)\s*$/, '')
        .replace(/[….]+$/, '')
        .trim()
        .toLowerCase();

const atMs = (e: JobHistoryEntry): number => Date.parse(e.at);

/**
 * The rows of a job's history. Entries come oldest first; the last one is current while the job runs, all are done
 * once it has ended. A phase of the fixed list that no entry names yet follows as pending. A job without history has
 * no rows (the step then shows no history at all).
 */
export function historyRows(
    job: WatchJob | undefined,
    now: number,
    opts: { trainingBuild?: boolean } = {},
): HistoryRow[] {
    // the gateway writes the end of a job as an entry of its own, often with the words of the last one (B27)
    const history = (job?.history ?? [])
        .filter((e) => e && typeof e.text === 'string' && e.text.trim() !== '')
        .filter((e, i, all) => i === 0 || e.text.trim() !== all[i - 1].text.trim());
    if (!job || history.length === 0) return [];
    const running = job.state === JOB_RUNNING;
    const rows: HistoryRow[] = history.map((e, i) => {
        const current = running && i === history.length - 1;
        // the entry keeps the words the phase began with; the current phase reads the job's latest line instead
        const live = (job.message ?? '').trim();
        const text = current && live && phaseKey(live) === phaseKey(e.text) ? live : e.text;
        const t = atMs(e);
        const when = Number.isNaN(t) ? '' : current ? durationText(now - t) : clockSeconds(t);
        return { text, state: current ? 'running' : 'done', when, ...(typeof e.percent === 'number' ? { percent: e.percent } : {}) };
    });
    if (running) {
        const seen = new Set(history.map((e) => phaseKey(e.text)));
        const phases = phasesOf(job.kind, !!opts.trainingBuild);
        // only phases after the last named one are still to come
        let last = -1;
        phases.forEach((p, i) => {
            if (seen.has(phaseKey(p))) last = i;
        });
        for (const p of phases.slice(last + 1)) rows.push({ text: p, state: 'pending', when: '' });
    }
    return rows;
}
