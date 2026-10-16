// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The cards of pre-annotation in the transcript (issue #112, design `prototyp/entwuerfe/annotation-cards/`): the
// run of a pre-annotation function and the four kinds of job it is followed by (calibrate, uncertain, fill,
// verify). They load the runs and jobs of a chat from GET /api/chats/{id}/annotation, keep the progress current
// from the gateway's own watcher (`useJobs`, kinds `annotation_run` and `annotation_job`) and stand where the
// tool call that started them stands in the history.
//
// What the route cannot answer, the cards do not show (gateway PR of the V4 route): the counts per class of a
// finished run, its frame numbers and how many annotations a `replace` run wipes are measurements of their own
// (`annotation_summary` reads the task from CVAT, and the gateway stores none of them). The card leaves those
// lines away instead of inventing them; a run names its dataset by id, because the gateway stores the id.

import { useEffect, useState } from 'react';

import {
    changeColor,
    changeText,
    classRows,
    fmt2,
    fmtDuration,
    fmtNum,
    fmtPercent,
    fmtStarted,
    imageReviewLine,
    NONE,
    parseTime,
    statusSeconds,
    verdictView,
} from './assess';
import type { CardState, CardView, Cell, ImageRow, KvRow, Section, Seg, TableSection } from './assess';
import { ASSESS_JOB_KIND } from './assess';
import { jsonObjectIn } from './deploymentCard';
import { jobByToolCall } from './jobs';
import type { WatchJob } from './jobs';
import { AGENT_BASE } from './login';
import type { Step } from './transcript';
import type {
    AnnotationAnswer,
    AnnotationJob,
    AnnotationRun,
    CalibrationResult,
    FillResult,
    Plausibility,
    UncertainResult,
    VerifyResult,
} from './types';

/** The kinds the watcher publishes for pre-annotation (`annotation.WatchKindName`, `JobKindName`). */
export const ANNOTATION_RUN_KIND = 'annotation_run';
export const ANNOTATION_JOB_KIND = 'annotation_job';

/** How many correction rounds a task may have in one chat (`annotation.MaxRounds`, V3c). */
export const MAX_ROUNDS = 3;

/** How many image rows a list shows before "Show all" (design L12). */
export const IMAGE_ROWS = 5;

/** The answer of a chat without the route (an older gateway) or without runs. */
export const EMPTY_ANNOTATION: AnnotationAnswer = { cvat_url: '', runs: [], jobs: [] };

/** The runs and jobs of a chat, oldest first; a chat without the route has none. */
export async function fetchAnnotation(chatId: string): Promise<AnnotationAnswer> {
    const res = await fetch(`${AGENT_BASE}/api/chats/${encodeURIComponent(chatId)}/annotation`, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
    });
    if (res.status === 404) return EMPTY_ANNOTATION;
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const answer = (await res.json()) as AnnotationAnswer;
    return { cvat_url: answer?.cvat_url ?? '', runs: answer?.runs ?? [], jobs: answer?.jobs ?? [] };
}

/**
 * The runs and jobs of a chat, loaded again whenever `trigger` changes — the caller passes the observed jobs, so
 * that a run the watcher just picked up appears without the user asking. A failed load keeps what is known.
 */
export function useAnnotation(chatId: string | undefined, trigger: unknown[] = []): AnnotationAnswer {
    const [answer, setAnswer] = useState<AnnotationAnswer>(EMPTY_ANNOTATION);

    useEffect(() => {
        if (!chatId) {
            setAnswer(EMPTY_ANNOTATION);
            return undefined;
        }
        let alive = true;
        fetchAnnotation(chatId)
            .then((a) => {
                if (alive) setAnswer(a);
            })
            .catch(() => {
                // keep what is known; the next trigger loads again
            });
        return () => {
            alive = false;
        };
        // trigger has a fixed length (the caller's list of changing values)
    }, [chatId, ...trigger]);

    return answer;
}

// --- the items of a view -----------------------------------------------------------------------------------------

/** What a rollback took back (`annotation.rollbackAnswer`, V3b): the line of the card of that run or fill. */
export type RollbackLine = { deleted: number; changed_kept: number; frames_emptied: number };

/** One card's worth of data: a run or a job, the observation that keeps it current and its rollback. */
export type AnnotationItem =
    | { key: string; what: 'run'; run: AnnotationRun; watch?: WatchJob; rollback?: RollbackLine }
    | { key: string; what: 'job'; job: AnnotationJob; watch?: WatchJob; rollback?: RollbackLine };

const createdOf = (item: AnnotationItem): number =>
    parseTime(item.what === 'run' ? item.run.created_at : item.job.created_at) ?? 0;

/** The observation of a run or a job: its tool call first, then the kind and the reference (as the route does). */
export function watchOfRun(run: AnnotationRun, jobs: readonly WatchJob[]): WatchJob | undefined {
    return (
        jobByToolCall(jobs, run.tool_call_id) ?? jobs.find((j) => j.kind === ANNOTATION_RUN_KIND && j.ref === run.run_id)
    );
}

export function watchOfJob(job: AnnotationJob, jobs: readonly WatchJob[]): WatchJob | undefined {
    return (
        jobByToolCall(jobs, job.tool_call_id) ?? jobs.find((j) => j.kind === ANNOTATION_JOB_KIND && j.ref === job.job_id)
    );
}

/**
 * The runs and jobs of a chat as the cards see them, oldest first. The route's rows carry the state and the
 * percent the watcher last wrote; a rollback among the steps is attached to the run or the fill whose objects it
 * took back (`source_id`, W3).
 */
export function mergeAnnotation(
    answer: AnnotationAnswer,
    jobs: readonly WatchJob[] = [],
    steps: readonly Step[] = [],
): AnnotationItem[] {
    const rolls = rollbacksIn(steps);
    const items: AnnotationItem[] = [
        ...answer.runs.map((run): AnnotationItem => ({ key: run.run_id, what: 'run', run, watch: watchOfRun(run, jobs) })),
        ...answer.jobs.map((job): AnnotationItem => ({ key: job.job_id, what: 'job', job, watch: watchOfJob(job, jobs) })),
    ];
    for (const item of items) {
        const line = rolls.get(item.key);
        if (line) item.rollback = line;
    }
    return items.sort((a, b) => createdOf(a) - createdOf(b));
}

/**
 * A value that changes whenever an observed run or check does: the caller passes it to `useAnnotation` and
 * `useChecks`, so that a card follows the watcher without a poll of its own.
 */
export function cardsTrigger(jobs: readonly WatchJob[]): string {
    return jobs
        .filter((j) => j.kind === ANNOTATION_RUN_KIND || j.kind === ANNOTATION_JOB_KIND || j.kind === ASSESS_JOB_KIND)
        .map((j) => `${j.id}:${j.state}:${j.progress ?? ''}:${j.message ?? ''}:${j.ended_at ?? ''}`)
        .join('|');
}

/** The percent a card shows while it runs: the watcher's live value first, the route's stored one otherwise. */
function livePercent(stored: number | undefined, watch: WatchJob | undefined): number | null {
    const value = typeof watch?.progress === 'number' ? watch.progress : stored;
    return typeof value === 'number' ? Math.max(0, Math.min(100, Math.round(value))) : null;
}

/** The rollbacks among a run of tool calls, by the run or fill they took back (`annotation.rollbackAnswer`). */
export function rollbacksIn(steps: readonly Step[]): Map<string, RollbackLine> {
    const out = new Map<string, RollbackLine>();
    for (const s of steps) {
        const text = s.result?.text;
        if (typeof text !== 'string' || !text.includes('"source_id"')) continue;
        const json = jsonObjectIn(text) as Record<string, unknown> | undefined;
        if (!json || typeof json.source_id !== 'string' || typeof json.deleted !== 'number') continue;
        out.set(json.source_id, {
            deleted: json.deleted,
            changed_kept: typeof json.changed_kept === 'number' ? json.changed_kept : 0,
            frames_emptied: typeof json.frames_emptied === 'number' ? json.frames_emptied : 0,
        });
    }
    return out;
}

/** The cards of one run of tool calls, in their order, each at the step of the call that started the item. */
export function annotationCardsIn(
    steps: readonly Step[],
    items: readonly AnnotationItem[],
): { key: string; item: AnnotationItem }[] {
    const out: { key: string; item: AnnotationItem }[] = [];
    for (const s of steps) {
        const call = s.callId ?? s.id;
        const item = items.find((i) => (i.what === 'run' ? i.run.tool_call_id : i.job.tool_call_id) === call);
        if (item) out.push({ key: s.id, item });
    }
    return out;
}

/** The state a card shows: the route's own state for both, so that a card of a dormant chat loads as well. */
export function cardStateOf(item: AnnotationItem): CardState {
    return item.what === 'run' ? item.run.state : item.job.state;
}

// --- the small helpers the design fixes -------------------------------------------------------------------------

/** The percent of a job's progress, rounded; null while there is no total to divide by. */
export function percent(done: number | undefined, total: number | undefined): number | null {
    if (done === undefined || total === undefined || total <= 0) return null;
    return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
}

/**
 * Whether a link may be opened: only a CVAT link is one, and the base is the one the gateway names
 * (`cvat_url` of the route, AGW_CVAT_PUBLIC_URL). A foreign host, `javascript:` or the base with another path
 * is no link.
 */
export function isCvatLink(url: string | undefined, base: string | undefined): boolean {
    if (!url || !base) return false;
    const root = base.replace(/\/+$/, '');
    return url === root || url.startsWith(`${root}/`);
}

/** The head and the tail of a file name; only a name longer than 20 characters is shortened (L13). */
export type MidTrunc = { head: string; tail: string };

export function midTrunc(file: string, tail = 12): MidTrunc {
    if (file.length <= 20) return { head: file, tail: '' };
    return { head: file.slice(0, file.length - tail), tail: file.slice(file.length - tail) };
}

/** A threshold the gateway stores in whole percent as the share the card writes ("0.45"). */
export function thresholdText(percentValue: number | undefined): string {
    return typeof percentValue === 'number' ? (percentValue / 100).toFixed(2) : NONE;
}

/** The same threshold as a number in 0..1, for the confidence bars; undefined without one. */
export function threshold(percentValue: number | undefined): number | undefined {
    return typeof percentValue === 'number' ? percentValue / 100 : undefined;
}

/** The rollback line of a card (L19/W3): what was taken back, and what the user had changed by hand. */
export function rollbackText(line: RollbackLine): string {
    const kept = line.changed_kept > 0 ? ` · ${fmtNum(line.changed_kept)} changed by hand, kept` : '';
    return `Rolled back ${fmtNum(line.deleted)} auto annotations · ${fmtNum(line.frames_emptied)} images emptied${kept}`;
}

// `mono` stays off the piece when it is false: the field is optional, and the cards' tests compare the pieces as they
// are written down.
const seg = (text: string, mono = false): Seg => (mono ? { text, mono } : { text });

/** `CVAT task #{id}`: the one line a card of a run can build (the frame count is not stored). */
export function taskLine(taskID: number): string {
    return taskID > 0 ? `CVAT task #${taskID}` : '';
}

/** The line that opens a CVAT task; without a CVAT base it stands there as text without a link. */
function cvatLine(base: string | undefined, url: string | undefined, pre: string): Section {
    return { kind: 'link', pre, url: isCvatLink(url, base) ? url : undefined, text: 'Open in CVAT' };
}

/** The bar of a run or a job: the percent while there is one, an open bar otherwise. */
function progressSection(pct: number | null, left: string, right: string): Section {
    return { kind: 'progress', percent: pct, left, right };
}

/** The seconds between a start and the end of a run or a job; while it runs, up to now. */
function durationOf(from: string | undefined, to: string | undefined, now: number): number | undefined {
    return statusSeconds(from, to, now, !to);
}

// --- the run card -----------------------------------------------------------------------------------------------

/** The subtitle of a run or a job: the function in monospace and the dataset id it works on. */
function fnSubtitle(fn: string, datasetID: number): Seg[][] {
    return [[seg(fn, true), seg(' on '), seg(`#${datasetID}`)]];
}

/** The card of a pre-annotation run. */
export function runCard(item: Extract<AnnotationItem, { what: 'run' }>, base: string | undefined, now: number): CardView {
    const { run, watch, rollback } = item;
    const state = cardStateOf(item);
    const seconds = durationOf(run.created_at, run.ended_at, now);
    const pct = livePercent(run.progress, watch);
    const sections: Section[] = [];

    // the run replaces every annotation of the task; how many that are is not stored (gateway PR of the route)
    if (run.existing === 'replace')
        sections.push({ kind: 'warn', text: 'Replaces the existing annotations on these frames (irreversible).' });

    if (state === 'queued' || state === 'running') {
        const right = state === 'queued' ? `queued ${fmtDuration(seconds ?? 0)}` : `${fmtDuration(seconds ?? 0)} elapsed`;
        // the frame numbers of the design are not stored anywhere; the bar shows the percent the watcher wrote
        sections.push(
            progressSection(
                state === 'queued' ? null : pct,
                state === 'queued' ? 'Waiting for CVAT to start the job' : pct === null ? '' : fmtPercent(pct),
                right,
            ),
        );
        sections.push(cvatLine(base, run.cvat_url, taskLine(run.task_id)));
    } else if (state === 'finished') {
        // the counts per class of a finished run are the agent's annotation_summary, not the route's
        sections.push(cvatLine(base, run.cvat_url, taskLine(run.task_id)));
        sections.push({
            kind: 'hint',
            icon: 'lightbulb',
            text: 'Next: review the annotations in CVAT, then ask the agent to “Write back to dataset”. Writing back needs your approval.',
        });
    } else if (state === 'failed') {
        sections.push({ kind: 'kv', rows: [{ label: 'Ran for', value: fmtDuration(seconds) }] });
        if (run.error) sections.push({ kind: 'error', text: run.error });
        sections.push(cvatLine(base, run.cvat_url, taskLine(run.task_id)));
    } else if (state === 'expired') {
        sections.push({ kind: 'kv', rows: [{ label: 'Started', value: fmtStarted(run.created_at, now) }] });
        sections.push({
            kind: 'hint',
            icon: 'history',
            text: 'CVAT no longer has this run, so progress and counts can’t be loaded.',
        });
        sections.push({ kind: 'hint', icon: 'down', text: 'The agent’s summary below this card has the final counts.' });
    }
    if (rollback) sections.push({ kind: 'hint', icon: 'undo', text: rollbackText(rollback) });

    return {
        title: 'Pre-annotation run',
        icon: 'run',
        subtitle: fnSubtitle(run.function, run.dataset_id),
        effect: run.existing === 'replace' ? 'irreversible' : 'compute',
        state,
        status: state === 'expired' ? 'expired' : `${state}${seconds === undefined ? '' : ` · ${fmtDuration(seconds)}`}`,
        statusColor: state === 'finished' ? 'success' : state === 'failed' ? 'error' : 'secondary',
        accent: state === 'failed' ? 'error.main' : state === 'expired' ? 'grey.400' : 'primary.main',
        sections,
    };
}

// --- the job cards ----------------------------------------------------------------------------------------------

/** The subtitle of a job: the function in monospace and the dataset id it works on. */
const jobSubtitle = (job: AnnotationJob): Seg[][] => fnSubtitle(job.function, job.dataset_id);

const imageLine = (job: AnnotationJob): string => `image ${fmtNum(job.done)} of ${fmtNum(job.total)}`;

/** The card of a calibrate, uncertain, fill or verify job. */
export function jobCard(item: Extract<AnnotationItem, { what: 'job' }>, base: string | undefined, now: number): CardView {
    const { job, rollback } = item;
    const state = cardStateOf(item);
    const elapsed = durationOf(job.created_at, undefined, now);
    // the route carries what the job got through; a change of the watcher reloads it (`cardsTrigger`)
    const pct = percent(job.done, job.total);
    const running = state === 'queued' || state === 'running';
    const sections: Section[] = [];
    let accent = 'primary.main';
    let kindLabel = '';

    if (job.kind === 'calibrate') {
        kindLabel = ' · Calibrate';
        const result = job.result as CalibrationResult | undefined;
        const n = state === 'finished' && result ? result.images : job.total;
        sections.push({ kind: 'sample', text: `Measured on ${fmtNum(n)} manually annotated images`, sub: 'calibration set' });
        if (running) sections.push(progressSection(pct, imageLine(job), `${fmtDuration(elapsed ?? 0)} elapsed`));
        else if (result) {
            sections.push(calibrationTable(result));
            sections.push({ kind: 'kv', rows: calibrationKv(result), boldLabels: ['Proposed min. confidence'] });
        }
    } else if (job.kind === 'uncertain') {
        kindLabel = ' · Uncertain';
        const result = job.result as UncertainResult | undefined;
        const below = job.params?.uncertain_below;
        if (running) {
            sections.push({
                kind: 'sample',
                text: `Measured on ${fmtNum(job.total)} images`,
                sub: `threshold ${thresholdText(below)}`,
            });
            sections.push(progressSection(pct, imageLine(job), `${fmtDuration(elapsed ?? 0)} elapsed`));
        } else if (result) {
            sections.push({
                kind: 'sample',
                text: `${fmtNum(result.uncertain.length)} uncertain images`,
                sub: `top confidence below ${thresholdText(below)} · measured on ${fmtNum(result.checked)} images`,
            });
            sections.push({
                kind: 'images',
                title: 'Lowest confidence first',
                rows: uncertainRows(result, base, threshold(below)),
                more: result.uncertain.length > IMAGE_ROWS ? `Show all ${fmtNum(result.uncertain.length)}` : undefined,
            });
        }
    } else if (job.kind === 'fill') {
        kindLabel = ' · Fill';
        const result = job.result as FillResult | undefined;
        if (running) {
            const left = pct === null ? imageLine(job) : `${fmtPercent(pct)} · ${imageLine(job)}`;
            sections.push(progressSection(pct, left, `${fmtDuration(elapsed ?? 0)} elapsed`));
            sections.push(
                cvatLine(
                    base,
                    job.cvat_url,
                    `${taskLine(job.task_id)} · ${fmtNum(job.total)} images without annotations`,
                ),
            );
        } else if (result) {
            sections.push(fillTable(result, job.params?.min_confidence));
            sections.push(cvatLine(base, job.cvat_url, taskLine(job.task_id)));
        }
    } else {
        // verify: the same shell as every result check of the gateway (V3b)
        kindLabel = ' · Verify';
        const result = job.result as VerifyResult | undefined;
        const verdict = result ? verdictView(result.verdict) : undefined;
        if (verdict && result) {
            accent = verdict.verdict === 'usable' ? 'primary.main' : 'warning.main';
            if (typeof result.round === 'number' && result.round > 0)
                sections.push({
                    kind: 'round',
                    text: `Round ${result.round} of ${MAX_ROUNDS}`,
                    done: result.round,
                    total: MAX_ROUNDS,
                });
            sections.push({ kind: 'verdict', view: verdict, header: result.header });
        }
        if (running) {
            sections.push({ kind: 'sample', text: `Measured on ${fmtNum(job.total)} images` });
            sections.push({ kind: 'mode', text: 'Statistics only, no image review', icon: 'stats' });
            sections.push(progressSection(pct, imageLine(job), `${fmtDuration(elapsed ?? 0)} elapsed`));
        } else if (result) {
            sections.push({
                kind: 'sample',
                text: verifySampleText(result),
                sub: imageReviewLine(result),
                icon: 'image',
            });
            sections.push({ kind: 'mode', ...verifyMode(result) });
            const table = verifyTable(result);
            if (table.rows.length) sections.push(table);
            sections.push({ kind: 'kv', rows: verifyMetrics(result) });
            sections.push(...compareSections(result));
            const details = plausibilityRows(result.plausibility);
            if (details.length) sections.push({ kind: 'details', label: 'Show details', rows: details });
            sections.push(...verifyLists(result));
            const suspicious = suspiciousRows(result, base);
            if (suspicious.length)
                sections.push({
                    kind: 'images',
                    title: 'Suspicious images',
                    rows: suspicious,
                    more: suspicious.length > IMAGE_ROWS ? `Show all ${fmtNum(suspicious.length)}` : undefined,
                });
        }
    }

    if (job.error) sections.push({ kind: 'error', text: job.error });
    if (rollback) sections.push({ kind: 'hint', icon: 'undo', text: rollbackText(rollback) });

    const seconds = durationOf(job.created_at, job.ended_at, now);
    return {
        title: 'Annotation check',
        kindLabel,
        icon: 'check',
        subtitle: jobSubtitle(job),
        // every check of pre-annotation is a compute call, whatever the design's draft chips said (decision)
        effect: 'compute',
        state,
        status: `${state}${state === 'expired' || seconds === undefined ? '' : ` · ${fmtDuration(seconds)}`}`,
        statusColor: state === 'finished' ? 'success' : state === 'failed' ? 'error' : 'secondary',
        accent: state === 'failed' ? 'error.main' : accent,
        sections,
    };
}

/** The sample line of a verify job: the set the figures rest on (V3b). */
function verifySampleText(result: VerifyResult): string {
    const set = result.set === 'validation' ? 'validation' : 'held-out';
    return `Measured on ${fmtNum(result.measured_images)} ${set} images`;
}

/** The mode line of a verify: whether a model looked at the images, and why it did not. */
function verifyMode(result: VerifyResult): { text: string; icon: 'stats' | 'image'; reason?: string } {
    const r = result.image_review;
    if (r?.done) return { text: `Statistics and image review (${r.model ?? ''})`.trim(), icon: 'image' };
    return { text: 'Statistics only, no image review', icon: 'stats', reason: r?.reason || undefined };
}

/** The table of a verify job: a detector carries objects, a classification the images of each class (L15). */
function verifyTable(result: VerifyResult): TableSection {
    const detection = typeof result.overall?.macro_f1 === 'number';
    const rows = classRows(result.per_class).map((r) => {
        const red = (name: string) => r.below.includes(name);
        const cells: Cell[] = [
            { text: r.name, mono: true },
            { text: fmtNum(r.support), align: 'right' },
            { text: fmt2(r.precision), align: 'right', color: red('precision') ? 'error.main' : undefined },
            { text: fmt2(r.recall), align: 'right', color: red('recall') ? 'error.main' : undefined },
        ];
        if (detection) cells.push({ text: fmt2(r.f1), align: 'right', color: red('f1') ? 'error.main' : undefined });
        return cells;
    });
    const columns: Cell[] = detection
        ? [
              { text: 'Class' },
              { text: 'Objects', align: 'right' },
              { text: 'Precision', align: 'right' },
              { text: 'Recall', align: 'right' },
              { text: 'F1', align: 'right' },
          ]
        : [
              { text: 'Class' },
              { text: 'Images', align: 'right' },
              { text: 'Precision', align: 'right' },
              { text: 'Recall', align: 'right' },
          ];
    return {
        kind: 'table',
        widths: detection ? 'minmax(0,1fr) 62px 74px 56px 44px' : 'minmax(0,1fr) 62px 74px 56px',
        columns,
        rows,
    };
}

/** The overall figure of a verify job: macro F1 for a detector, the accuracy for a classification. */
function verifyMetrics(result: VerifyResult): KvRow[] {
    const rows: KvRow[] = [];
    if (typeof result.overall?.macro_f1 === 'number') rows.push({ label: 'Macro F1', value: fmt2(result.overall.macro_f1) });
    if (typeof result.overall?.accuracy === 'number') rows.push({ label: 'Accuracy', value: fmt2(result.overall.accuracy) });
    return rows;
}

/**
 * The plausibility values of a verify report (V3b, L17): what the automatic annotations look like against the
 * manual ones. They stand behind "Show details" — the report of the agent carries them anyway — and only when the
 * gateway measured them.
 */
function plausibilityRows(p: Plausibility | undefined): KvRow[] {
    if (!p?.measured) return [];
    const share = (auto: number | undefined, manual: number | undefined) => `${fmt2(auto)} / ${fmt2(manual)}`;
    const classes = [...new Set([...Object.keys(p.class_share_auto ?? {}), ...Object.keys(p.class_share_manual ?? {})])].sort();
    const rows: KvRow[] = [{ label: 'Filled images', value: fmtNum(p.filled_images) }];
    if (classes.length)
        rows.push({
            label: 'Class share auto / manual',
            value: classes.map((c) => `${c}: ${share(p.class_share_auto?.[c], p.class_share_manual?.[c])}`).join(', '),
        });
    rows.push({ label: 'Class distance (TVD)', value: fmt2(p.tvd) });
    rows.push({ label: 'Empty share auto / manual', value: share(p.empty_share_auto, p.empty_share_manual) });
    rows.push({ label: 'Boxes per image auto / manual', value: share(p.boxes_per_image_auto, p.boxes_per_image_manual) });
    rows.push({ label: 'Median box area ratio', value: fmt2(p.median_rel_area_ratio) });
    return rows;
}

/**
 * The before/after table of a correction round (V3c, design *ver-round*). The gateway carries the change per class
 * (`delta.per_class_f1`) and the report the figure after it; the figure before it is the two subtracted — the
 * gateway does not store it separately, and the subtraction is exact in the units the report uses.
 */
function compareSections(result: VerifyResult): Section[] {
    const delta = result.delta;
    if (!delta?.per_class_f1) return [];
    const rows = classRows(result.per_class)
        .filter((r) => typeof delta.per_class_f1?.[r.name] === 'number')
        .map((r) => {
            const change = delta.per_class_f1?.[r.name] ?? 0;
            return { label: r.name, before: r.f1 - change, after: r.f1, change };
        });
    if (rows.length === 0) return [];
    return [
        {
            kind: 'table',
            widths: 'minmax(0,1fr) 76px 72px 60px',
            columns: [
                { text: 'Class' },
                { text: 'F1 before', align: 'right' },
                { text: 'F1 after', align: 'right' },
                { text: 'Change', align: 'right' },
            ],
            rows: rows.map((r) => [
                { text: r.label, mono: true },
                { text: fmt2(r.before), align: 'right' },
                { text: fmt2(r.after), align: 'right' },
                { text: changeText(r.change), align: 'right', bold: true, color: changeColor(r.change) },
            ]),
        },
    ];
}

/** The reasons, hints and suggestions of a verify report; its header carries the first reason (D10). */
function verifyLists(result: VerifyResult): Section[] {
    const reasons = result.verdict === 'not_measured' ? (result.reasons ?? []).slice(1) : result.reasons ?? [];
    const out: Section[] = [];
    if (reasons.length) out.push({ kind: 'list', title: 'Reasons', items: reasons });
    if (result.hints?.length) out.push({ kind: 'list', title: 'Hints', items: result.hints });
    if (result.suggestions?.length)
        out.push({
            kind: 'list',
            title: 'Suggestions',
            items: result.suggestions.map((s) => ({ id: s.id, text: s.text })),
        });
    return out;
}

/** The uncertain images of a check, lowest confidence first (L11), each with its CVAT link. */
function uncertainRows(result: UncertainResult, base: string | undefined, threshold?: number): ImageRow[] {
    return [...result.uncertain]
        .sort((a, b) => a.confidence - b.confidence)
        .map((i) => ({
            file: i.file ?? `frame ${i.frame}`,
            label: i.top_label,
            confidence: i.confidence,
            threshold,
            url: isCvatLink(i.cvat_url, base) ? i.cvat_url : undefined,
        }));
}

/** The suspicious images of a verify report: the gateway's own reason stands next to each one. */
function suspiciousRows(result: VerifyResult, base: string | undefined): ImageRow[] {
    return (result.suspicious ?? []).map((s) => ({
        file: s.file ?? `frame ${s.frame}`,
        label: '',
        confidence: NaN,
        note: s.reason,
        url: isCvatLink(s.cvat_url, base) ? s.cvat_url : undefined,
    }));
}

/**
 * The table of a finished calibration: one row per label the function answered, with the class it is mapped to.
 * The figures of a calibration stand for the whole mapping, not for one label — the gateway stores them once
 * (`accuracy`, `precision`, `recall`, `f1`), so they stand in the lines below the table and not in its rows.
 */
function calibrationTable(result: CalibrationResult): TableSection {
    const answered = (label: string): number =>
        Object.values(result.confusion?.[label] ?? {}).reduce((a, b) => a + b, 0);
    const rows: Cell[][] = Object.keys(result.confusion ?? {})
        .sort()
        .map((label) => {
            const target = result.mapping?.[label];
            const first: Cell = target
                ? { text: `${label} → ${target}`, mono: true }
                : { text: label, mono: true, italic: true, color: 'text.disabled' };
            const figure: Cell = target
                ? { text: fmtNum(answered(label)), align: 'right' }
                : { text: 'not mapped', align: 'right', italic: true, color: 'text.disabled' };
            return [first, figure];
        });
    return {
        kind: 'table',
        widths: 'minmax(0,1fr) 64px',
        columns: [{ text: 'Function label → class' }, { text: 'Images', align: 'right' }],
        rows,
    };
}

/** The figures of a finished calibration: the proposed threshold and what the function reaches at it. */
function calibrationKv(result: CalibrationResult): KvRow[] {
    const at = thresholdText(result.proposed_min_confidence);
    const rows: KvRow[] = [{ label: 'Proposed min. confidence', value: at }];
    if (typeof result.accuracy === 'number') rows.push({ label: `Accuracy at ${at}`, value: fmt2(result.accuracy) });
    else if (typeof result.f1 === 'number') rows.push({ label: `Mean F1 at ${at}`, value: fmt2(result.f1) });
    if (typeof result.coverage === 'number') rows.push({ label: 'Coverage at this threshold', value: fmt2(result.coverage) });
    return rows;
}

/** The table of a finished fill: what it wrote, what it left alone and what it found nothing on. */
function fillTable(result: FillResult, minConfidence: number | undefined): TableSection {
    const total = result.filled + result.skipped_annotated + result.empty_results;
    const row = (label: string, value: number, bold = false): Cell[] => [
        { text: label, bold },
        { text: fmtNum(value), align: 'right', bold },
    ];
    return {
        kind: 'table',
        widths: 'minmax(0,1fr) 64px',
        columns: [{ text: 'Result' }, { text: 'Images', align: 'right' }],
        rows: [
            row(`Filled · ${fmtNum(result.filled)} new annotations`, result.filled),
            row('Skipped · already annotated', result.skipped_annotated),
            row(`Empty · no detection above ${thresholdText(minConfidence)}`, result.empty_results),
            row('Total', total, true),
        ],
    };
}
