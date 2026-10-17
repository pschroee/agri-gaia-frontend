// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The result checks of the gateway as cards (issue #112, design `prototyp/entwuerfe/check-card/`): the answer of
// GET /api/chats/{id}/assessments holds one row per check — a training check, a check of an own model file and a
// deployment check, plus the pre-annotation's verify answer, which uses the same shell (`assess.Report`). This
// module is the pure part — the figures, the wording and the states — plus the two calls that load the route
// (`fetchChecks`, `useChecks`); `components/AnnotationCard.tsx` lays the card out, and `annotation.ts` reads the
// runs and jobs of the pre-annotation route the same way.
//
// Nothing here calls the platform or CVAT. The card shows what the gateway measured and never works out a figure
// of its own (P5); reasons, hints, suggestions, the header and the note go through verbatim.

import { useEffect, useState } from 'react';

import { AGENT_BASE } from './login';
import { JOB_FAILED, JOB_RUNNING, jobByToolCall } from './jobs';
import type { WatchJob } from './jobs';
import type { Step } from './transcript';
import type {
    AssessCheck,
    AssessKind,
    AssessProgress,
    AssessProgressStep,
    AssessVerdict,
    BaselineFigures,
    BasicFigures,
    ClassFigures,
    DeploymentFigures,
    ModelCheck,
    NamedRef,
    OwnModelFigures,
    PreprocessFigures,
    AssessReport,
    TensorInfo,
    TrainingFigures,
} from './types';

/** The observation kind of a check (`assess.KindName`); `useJobs` keeps its jobs current. */
export const ASSESS_JOB_KIND = 'assessment';

/** The checks of a chat, oldest first; a chat without the route (an older gateway) has none. */
export async function fetchChecks(chatId: string): Promise<AssessCheck[]> {
    const res = await fetch(`${AGENT_BASE}/api/chats/${encodeURIComponent(chatId)}/assessments`, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
    });
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const answer = (await res.json()) as { checks?: AssessCheck[] };
    return answer?.checks ?? [];
}

/**
 * The checks of a chat, loaded again whenever `trigger` changes — the caller passes the observed jobs
 * (`cardsTrigger`), so that a check the watcher just picked up appears without the user asking. A failed load
 * keeps what is known.
 */
export function useChecks(chatId: string | undefined, trigger: unknown[] = []): AssessCheck[] {
    const [checks, setChecks] = useState<AssessCheck[]>([]);

    useEffect(() => {
        if (!chatId) {
            setChecks([]);
            return undefined;
        }
        let alive = true;
        fetchChecks(chatId)
            .then((list) => {
                if (alive) setChecks(list);
            })
            .catch(() => {
                // keep what is known; the next trigger loads again
            });
        return () => {
            alive = false;
        };
        // trigger has a fixed length (the caller's list of changing values)
    }, [chatId, ...trigger]);

    return checks;
}

// --- numbers, times and words (design L4, Zahlenformate) --------------------------------------------------------

/** The narrow no-break space the design uses as thousands separator ("1 000"). */
const THIN = ' ';
/** The en dash the card writes for a figure the gateway did not measure. */
export const NONE = '–';

/** An integer with a thin space before every group of three digits ("1 000", "2 870"). */
export function fmtNum(n: number): string {
    if (!Number.isFinite(n)) return NONE;
    const sign = n < 0 ? '-' : '';
    return sign + Math.round(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, THIN);
}

/** A figure with two decimals ("0.92"); null and a missing figure are "–". */
export function fmt2(v: number | null | undefined): string {
    return v === null || v === undefined || !Number.isFinite(v) ? NONE : v.toFixed(2);
}

/** A percentage as the design writes it: an integer and a space before the sign ("41 %"). */
export function fmtPercent(v: number | null | undefined): string {
    return v === null || v === undefined || !Number.isFinite(v) ? NONE : `${Math.round(v)} %`;
}

/**
 * The p value of the baseline test with two significant digits ("p = 0.42", "p = 0.00014", "p = 1.0"); below
 * 0.0001 the card writes "p < 0.0001" instead of a figure nobody reads.
 */
export function fmtP(p: number): string {
    if (!Number.isFinite(p) || p < 0.0001) return 'p < 0.0001';
    const s = p.toPrecision(2);
    return `p = ${s.includes('e') ? p.toFixed(6) : s}`;
}

/** The largest difference of a deployment check: below 0.01 in exponential form ("3.1e-6"), else two decimals. */
export function fmtDiff(v: number | null | undefined): string {
    if (v === null || v === undefined || !Number.isFinite(v)) return NONE;
    return Math.abs(v) < 0.01 ? v.toExponential(1) : v.toFixed(2);
}

/** A duration in seconds as "m:ss", from an hour on "h:mm:ss". */
export function fmtDuration(seconds: number | null | undefined): string {
    if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return NONE;
    const s = Math.round(seconds);
    const pad = (n: number) => String(n).padStart(2, '0');
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h > 0) return `${h}:${pad(m)}:${pad(s % 60)}`;
    return `${m}:${pad(s % 60)}`;
}

/** A moment as milliseconds; an unreadable value is undefined. */
export function parseTime(v: string | undefined): number | undefined {
    if (!v) return undefined;
    const t = Date.parse(v);
    return Number.isNaN(t) ? undefined : t;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const timeFmt = (t: number) => {
    const d = new Date(t);
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

/** When a check started, as the design writes it: "today, 09:12", "yesterday, 09:12", "12.10.2026, 09:12". */
export function fmtStarted(v: string | undefined, now: number): string {
    const t = parseTime(v);
    if (t === undefined) return NONE;
    const day = (x: number) => new Date(x).toDateString();
    const d = new Date(t);
    if (day(t) === day(now)) return `today, ${timeFmt(t)}`;
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    if (day(t) === day(y.getTime())) return `yesterday, ${timeFmt(t)}`;
    return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}, ${timeFmt(t)}`;
}

/** The seconds between two moments; undefined while one of them is unknown or in the future. */
export function secondsBetween(from: string | undefined, to: number): number | undefined {
    const t = parseTime(from);
    if (t === undefined) return undefined;
    const s = Math.round((to - t) / 1000);
    return s < 0 ? undefined : s;
}

// --- the shell of a report --------------------------------------------------------------------------------------

/** What the verdict chip says and how it looks (design *Verdict*). */
export type VerdictView = {
    verdict: AssessVerdict;
    label: string;
    color: 'success' | 'warning' | 'default';
    icon: 'usable' | 'questionable' | 'not_measured';
};

/** The chip of a verdict; an empty verdict (a partial report of a failed check) gets no chip. */
export function verdictView(v: string | undefined): VerdictView | undefined {
    switch (v) {
        case 'usable':
            return { verdict: 'usable', label: 'Usable', color: 'success', icon: 'usable' };
        case 'questionable':
            return { verdict: 'questionable', label: 'Questionable', color: 'warning', icon: 'questionable' };
        case 'not_measured':
            return { verdict: 'not_measured', label: 'Not measured', color: 'default', icon: 'not_measured' };
        default:
            return undefined;
    }
}

/** The left border of the card per state (design *Card*): the verdict decides, not the state. */
export function borderOf(state: CardState, verdict: AssessVerdict | undefined): string {
    if (state === 'failed') return 'error.main';
    if (state === 'expired') return 'grey.400';
    if (verdict === 'questionable' || verdict === 'not_measured') return 'warning.main';
    return 'primary.main';
}

/** The states a card shows (design *Zustände je Art*). */
export type CardState = 'queued' | 'running' | 'finished' | 'failed' | 'expired';

/** What one line of the sample size says: the set the figures rest on (design *Stichprobe*). */
export function sampleText(set: string | undefined, n: number): string {
    switch (set) {
        case 'validation':
            return `Measured on ${fmtNum(n)} validation images`;
        case 'synthetic':
            return `${fmtNum(n)} synthetic test requests`;
        case 'holdout':
            return `Measured on ${fmtNum(n)} held-out images`;
        default:
            return `Measured on ${fmtNum(n)} images`;
    }
}

/**
 * The lines under the sample of a check card: while the check compares rounds it says so, and the gateway's own
 * note follows verbatim (D6) — the card never formulates anything about the measurement.
 */
export function checkSampleCaptions(report: AssessReport): string[] {
    const out: string[] = [];
    if (report.set === 'validation') out.push('interim – the final check uses other images');
    if (report.note) out.push(report.note);
    return out;
}

/** The mode line of a check: whether a model looked at the pictures, and the tooltip of a missing review. */
export type ModeLine = { text: string; icon: 'stats' | 'image'; reason?: string };

export function modeLine(report: AssessReport): ModeLine {
    const r = report.image_review ?? { done: false };
    if (r.done) return { text: `Statistics and image review (${r.model ?? ''})`.trim(), icon: 'image' };
    return { text: 'Statistics only, no image review', icon: 'stats', reason: r.reason || undefined };
}

/**
 * The image review line under the sample of a pre-annotation check (D9): the review looks at the images of the
 * source, never at the hold-out set the verdict rests on. `checked` and `flagged_share` come with V3d (#111);
 * without them the line is left out rather than guessed.
 */
export function imageReviewLine(report: AssessReport): string | undefined {
    const r = report.image_review;
    if (!r?.done || !r.checked) return undefined;
    const flagged = r.flagged_share
        ? `, ${fmtNum(Math.round(r.checked * r.flagged_share))} flagged`
        : '';
    return `Image review: ${fmtNum(r.checked)} filled images checked${flagged}`;
}

/**
 * The image review line of a result check (R4, #117): the model looked at misclassified validation images. The
 * card leaves the line out when no review ran (`done: false`) or the gateway named no figures — "0 of 0" would
 * claim a review that never happened.
 */
export function checkImageReviewLine(report: AssessReport): string | undefined {
    const r = report.image_review;
    if (!r?.done || !r.checked || !r.of) return undefined;
    const flagged = r.flagged ? `, ${fmtNum(r.flagged)} flagged` : '';
    return `Image review: ${fmtNum(r.checked)} of ${fmtNum(r.of)} misclassified validation images checked${flagged}`;
}

/**
 * The reasons under the card. A not measured report puts its first reason into the header (R0.2, D10); showing
 * it again under "Reasons" would repeat the same sentence.
 */
export function visibleReasons(report: AssessReport): string[] {
    const reasons = report.reasons ?? [];
    return report.verdict === 'not_measured' ? reasons.slice(1) : reasons.slice();
}

/** The suggestions as they stand in the report: the id and the gateway's text, in one line each. */
export function suggestionLines(report: AssessReport): { id: string; text: string }[] {
    return (report.suggestions ?? []).map((s) => ({ id: s.id, text: s.text }));
}

/** The line of the report the agent starts its reply with, verbatim (`assess.Header`). */
export function headerOf(report: AssessReport | null | undefined): string {
    return report?.header ?? '';
}

// --- the classes of a report ------------------------------------------------------------------------------------

/** One row of the table per class. */
export type ClassRow = {
    name: string;
    precision: number | null;
    recall: number;
    f1: number;
    support: number;
    below: string[];
};

/** The classes of a per-class map, sorted the way the gateway sorts them (by name). */
export function classRows(perClass: Record<string, ClassFigures> | undefined): ClassRow[] {
    const names = Object.keys(perClass ?? {}).sort();
    return names.map((name) => {
        const c = (perClass ?? {})[name];
        return { name, precision: c.precision, recall: c.recall, f1: c.f1, support: c.support, below: c.below ?? [] };
    });
}

/** The majority baseline in one line: `0.50 (always “3”) · p = 0.00014` (design M60). */
export function baselineText(b: BaselineFigures | undefined): string | undefined {
    if (!b) return undefined;
    const p = fmtP(b.p_value);
    return `${fmt2(b.accuracy)} (always “${b.class}”) · ${p}`;
}

// --- the rows of a check card -----------------------------------------------------------------------------------

/** One key/value row of a card. */
export type KvRow = { label: string; value: string; mono?: boolean };

/** The value of a source's inputs or outputs: the name, the type and the shape ("input_ids INT64 [1, 128]"). */
function tensorText(t: TensorInfo | undefined): string {
    if (!t) return NONE;
    const name = t.name ? `${t.name} ` : '';
    const shape = `[${(t.shape ?? []).join(', ')}]`;
    return `${name}${t.type ? `${t.type} ` : ''}${shape}`;
}

/**
 * The row of the inputs or outputs of a deployment (R3.4, D14): the three sources in one line when they agree,
 * otherwise every source the check has, so that a difference shows which source it is in. When only one source
 * carries the value, its name, type and shape stand there (the design's "Inputs input_ids INT64 [1, 128]").
 */
function ioRow(label: string, sources: [string, TensorInfo[]][]): KvRow | undefined {
    const filled = sources.filter(([, list]) => (list ?? []).length > 0);
    if (filled.length === 0) return undefined;
    if (filled.length === 1) return { label, value: tensorText(filled[0][1][0]) };
    return { label, value: filled.map(([n, list]) => `${n} [${(list[0].shape ?? []).join(', ')}]`).join(' · ') };
}

/** The wording of a model check inside a deployment check (`assess.ModelCheck.Text`), verbatim in its rules. */
export function modelCheckText(c: ModelCheck | null | undefined): string {
    if (!c || !c.found) return 'none in this chat';
    if (!c.final) return 'none in this chat (interim only)';
    if (c.verdict === 'usable' || c.verdict === 'questionable')
        return `${c.verdict} (${fmtNum(c.measured_images ?? 0)} held-out images, accuracy ${fmt2(c.accuracy)})`;
    if (c.verdict === 'not_measured') return c.reason ? `not measured (${c.reason})` : 'not measured';
    return 'none in this chat';
}

/**
 * The key/value rows of a deployment check, in the design's order and each only with the data it has (R3.7).
 * Nothing here is red and there is no table: a problem is a reason.
 */
export function deploymentRows(fig: DeploymentFigures | undefined): KvRow[] {
    if (!fig) return [];
    const rows: KvRow[] = [];
    rows.push({ label: 'Ready', value: fig.ready ? 'yes' : 'no' });
    if (fig.served_model) {
        const expected = fig.model?.name;
        const suffix = !expected || expected === fig.served_model ? ' – as expected' : ` – expected ${expected}`;
        rows.push({ label: 'Model served', value: `${fig.served_model}${suffix}`, mono: true });
    }
    const io = fig.io;
    if (io) {
        const sources: [string, TensorInfo[]][] = [
            ['Triton', io.triton?.inputs],
            ['platform', io.platform?.inputs],
            ['model file', io.file?.inputs],
        ];
        if (io.same) rows.push({ label: 'Inputs and outputs', value: 'same in Triton, platform and model file' });
        else {
            const ins = ioRow('Inputs', sources);
            if (ins) rows.push(ins);
            const outs = ioRow('Outputs', [
                ['Triton', io.triton?.outputs],
                ['platform', io.platform?.outputs],
                ['model file', io.file?.outputs],
            ]);
            if (outs) rows.push(outs);
        }
    }
    rows.push({ label: 'Requests', value: fig.requests > 0 ? fmtNum(fig.requests) : 'not sent' });
    if (fig.max_abs_diff !== null && fig.max_abs_diff !== undefined)
        rows.push({ label: 'Largest difference to the model file', value: fmtDiff(fig.max_abs_diff) });
    if (fig.argmax_same !== null && fig.argmax_same !== undefined && fig.requests > 0)
        rows.push({ label: 'Same top class', value: `${fmtNum(fig.argmax_same)} of ${fmtNum(fig.requests)}` });
    if (fig.roundtrip_ms)
        rows.push({
            label: 'Round trip (incl. docker exec)',
            value: `median ${fmtNum(fig.roundtrip_ms.median)} ms · max ${fmtNum(fig.roundtrip_ms.max)} ms`,
        });
    // the model check stands there in every case: "none in this chat" is a statement the card can make
    rows.push({ label: 'Model check', value: modelCheckText(fig.model_check) });
    return rows;
}

/** The preprocessing of an own-model check in one line (R2.4, design E57). */
export function preprocessText(p: PreprocessFigures | undefined): string | undefined {
    if (!p) return undefined;
    const parts: string[] = [p.color || NONE];
    if (p.size && p.size.length >= 2) parts.push(`${p.size[0]}×${p.size[1]}`);
    if (p.scale) parts.push(`scale 1/${Math.round(1 / p.scale)}`);
    if (p.layout) parts.push(p.layout);
    let text = parts.join(' · ');
    if (p.mean?.length || p.std?.length)
        text += ` · mean ${(p.mean ?? []).join(', ')} · std ${(p.std ?? []).join(', ')}`;
    return `${text} (${p.declared ? 'declared by the agent' : 'template default'})`;
}

/** The basic checks of an own-model file (R2.5, D12): a fixed label per structured field, passed or failed. */
export type BasicCheck = { label: string; ok: boolean };

export function basicChecks(fig: BasicFigures | null | undefined): BasicCheck[] {
    if (!fig) return [];
    const out: BasicCheck[] = [{ label: 'Loads in onnxruntime', ok: fig.loads }];
    const first = fig.inputs?.[0];
    const shape = (t: TensorInfo) => `[${(t.shape ?? []).join(', ')}]`;
    if (fig.inputs?.length === 1 && first) out.push({ label: `One input ${shape(first)} ${first.type}`, ok: true });
    else if (fig.inputs && fig.inputs.length > 1)
        out.push({ label: `${fmtNum(fig.inputs.length)} inputs`, ok: true });
    const classes = fig.outputs?.[0];
    if (classes) out.push({ label: `Output ${shape(classes)} – ${fig.classes} classes`, ok: true });
    if (typeof fig.varied === 'boolean')
        out.push({ label: 'Different outputs for different images', ok: fig.varied });
    // the class order is only compared when the agent declared class_names (R2.4); without them it is null
    if (typeof fig.class_order === 'boolean')
        out.push({ label: 'Class order matches the declared class_names', ok: fig.class_order });
    return out;
}

/** The key/value rows of a training or own-model check under the table (design M58, M110). */
export function metricRows(
    fig: TrainingFigures | OwnModelFigures | undefined,
    withOverall = true,
): KvRow[] {
    if (!fig) return [];
    const rows: KvRow[] = [];
    if (withOverall) {
        rows.push({ label: 'Accuracy', value: fmt2(fig.overall?.accuracy) });
        rows.push({ label: 'Macro F1', value: fmt2(fig.overall?.macro_f1) });
    }
    const baseline = baselineText(fig.baseline);
    if (baseline) rows.push({ label: 'Majority baseline', value: baseline });
    return rows;
}

/** The before/after table of a check that compared rounds (R1.12, design E16). */
export type CompareRow = { label: string; before: string; after: string; change: number | null };

export function compareRows(
    previous: { accuracy?: number; macro_f1?: number } | undefined,
    current: { accuracy?: number; macro_f1?: number } | undefined,
): CompareRow[] {
    if (!previous || !current) return [];
    const rows: CompareRow[] = [];
    for (const [label, key] of [
        ['Accuracy', 'accuracy'],
        ['Macro F1', 'macro_f1'],
    ] as const) {
        const a = previous[key];
        const b = current[key];
        if (typeof a !== 'number' || typeof b !== 'number') continue;
        rows.push({ label, before: fmt2(a), after: fmt2(b), change: b - a });
    }
    return rows;
}

/** A change with its sign and the design's minus (U+2212); the colour follows the sign. */
export function changeText(d: number | null): string {
    if (d === null || !Number.isFinite(d)) return NONE;
    const s = Math.abs(d).toFixed(2);
    if (d > 0) return `+${s}`;
    if (d < 0) return `−${s}`;
    return s;
}

/** `changeColor` is the theme colour of a change: green up, red down, plain when nothing changed. */
export const changeColor = (d: number | null): string | undefined =>
    d === null || d === 0 ? undefined : d > 0 ? 'success.main' : 'error.main';

// --- the platform figure ----------------------------------------------------------------------------------------

/**
 * The figure the training template measured itself (R1.13, D11). `undefined` means the card leaves the section
 * away: without the key the log was not read, and the card then claims nothing about what stands in it.
 */
export type PlatformFigureView = { label: string; text: string };

export function platformFigure(fig: TrainingFigures | undefined): PlatformFigureView | undefined {
    if (!fig || !('platform_figure' in fig)) return undefined;
    const p = fig.platform_figure;
    const label = 'platform figure (not checked by the gateway)';
    if (!p) return { label, text: 'No platform figure in the training log' };
    const from = p.source ? ` · from the ${p.source}` : '';
    const note = p.note ? ` · ${p.note}` : '';
    return { label, text: `${p.name} ${p.value}${from}${note}` };
}

// --- the checks of a chat ---------------------------------------------------------------------------------------

/** One check with the observation the gateway keeps for it. */
export type CheckItem = { key: string; check: AssessCheck; watch?: WatchJob };

/** The observation of a check (`internal/assess/watchkind.go`), matched by the tool call or by kind and ref. */
function watchOf(check: AssessCheck, jobs: readonly WatchJob[]): WatchJob | undefined {
    return jobByToolCall(jobs, check.tool_call_id) ?? jobs.find((j) => j.kind === ASSESS_JOB_KIND && j.ref === check.check_id);
}

/**
 * The checks of a chat: the route's rows and, for a check the route does not carry yet, the observation the
 * watcher published. The route is the authority for the state — it is written by the same gateway — and the
 * watcher only fills in what the route has not seen.
 *
 * A tool call that named a check the route does not know left an `expired` row: the report is gone, the card
 * still stands at the place of its call (D16) with what the call said.
 */
export function mergeChecks(
    checks: readonly AssessCheck[],
    jobs: readonly WatchJob[],
    steps: readonly Step[] = [],
): CheckItem[] {
    const out: CheckItem[] = checks.map((check) => ({ key: check.check_id, check, watch: watchOf(check, jobs) }));
    const known = new Set(checks.map((c) => c.check_id));
    for (const j of jobs) {
        if (j.kind !== ASSESS_JOB_KIND || !j.ref || known.has(j.ref)) continue;
        known.add(j.ref);
        out.push({ key: j.ref, check: unseenCheck(j.ref, j), watch: j });
    }
    for (const s of steps) {
        const id = checkIdOfStep(s);
        if (!id || known.has(id)) continue;
        known.add(id);
        out.push({ key: id, check: expiredCheck(id, s) });
    }
    return out.sort((a, b) => createdMs(a.check) - createdMs(b.check));
}

const createdMs = (c: AssessCheck) => parseTime(c.created_at) ?? 0;

/** The check id a step's answer names (the tool `assess_status`); undefined for every other step. */
export function checkIdOfStep(step: Pick<Step, 'result'>): string | undefined {
    const text = step.result?.text;
    if (typeof text !== 'string') return undefined;
    const m = /"check_id"\s*:\s*"([^"]+)"/.exec(text);
    if (m) return m[1];
    // a check that is no longer known: "check not found in this chat" — the call still names the id
    const miss = /check\s+([0-9a-f-]{8,})\s+not found/i.exec(text);
    return miss?.[1];
}

/** A check only the watcher knows: everything but the id is unknown; the state comes from the observation. */
function unseenCheck(id: string, j: WatchJob): AssessCheck {
    return {
        check_id: id,
        kind: 'training_model',
        subject: '',
        final: false,
        state: j.state === JOB_RUNNING ? 'running' : j.state === JOB_FAILED ? 'failed' : 'finished',
        report: null,
        created_at: j.started_at ?? '',
        tool_call_id: j.tool_call_id,
    };
}

/** A check whose report the gateway no longer has (D16): the call named an id nothing answers for. */
function expiredCheck(id: string, step: Step): AssessCheck {
    return {
        check_id: id,
        kind: 'deployment',
        subject: subjectOfArgs(step),
        final: false,
        state: 'expired',
        report: null,
        // an expired card has no moment of its own; it stands where its call stands in the history
        created_at: '',
        tool_call_id: step.callId ?? step.id,
    };
}

/** What a step's arguments name, for the subtitle of a check without a report (D15). */
function subjectOfArgs(step: Step): string {
    const args = step.args;
    if (!args || typeof args !== 'object') return '';
    const a = args as Record<string, unknown>;
    const dep = a.deployment_id ?? a.deployment;
    const model = a.model_id ?? a.model;
    const parts: string[] = [];
    if (dep !== undefined) parts.push(`deployment #${String(dep)}`);
    if (model !== undefined) parts.push(`model #${String(model)}`);
    return parts.join(' · ');
}

/** The state the card shows (design *Zustände je Art*), derived from the row. */
export function checkCardState(check: AssessCheck): CardState {
    switch (check.state) {
        case 'queued':
            return 'queued';
        case 'running':
            return 'running';
        case 'failed':
            return 'failed';
        case 'expired':
            return 'expired';
        default:
            return 'finished';
    }
}

/** The checks of one run of tool calls, in their order, each at the step of the call that started it. */
export function checkCardsIn(steps: readonly Step[], items: readonly CheckItem[]): { key: string; item: CheckItem }[] {
    const out: { key: string; item: CheckItem }[] = [];
    for (const s of steps) {
        const call = s.callId ?? s.id;
        const item = items.find((i) => i.check.tool_call_id === call);
        if (item) out.push({ key: s.id, item });
    }
    return out;
}

// --- the subtitle of a check card -------------------------------------------------------------------------------

/** One piece of a subtitle line; a monospace piece is a name or a form. */
export type Seg = { text: string; mono?: boolean };

/** The subtitle of a card: one or two lines, and whether the deployment runs on a simulated device. */
export type Subtitle = { lines: Seg[][] };

// `mono` stays off the piece when it is false: the field is optional, and the cards' tests compare the pieces as they
// are written down.
const seg = (text: string, mono = false): Seg => (mono ? { text, mono } : { text });
const shortSha = (sha: string) => (sha.length > 8 ? `${sha.slice(0, 4)}…${sha.slice(-4)}` : sha);

/** The figures of a check, read as the type its kind carries; undefined while no report stands. */
export function figuresOf(check: AssessCheck): TrainingFigures | OwnModelFigures | DeploymentFigures | undefined {
    const f = check.report?.figures;
    return f && typeof f === 'object' ? (f as TrainingFigures | OwnModelFigures | DeploymentFigures) : undefined;
}

/**
 * The subtitle of a check: the names of what was checked and measured, in monospace, " (#id)" outside (so that
 * a shortened name keeps its number). While the check runs the report that names the model and the dataset does
 * not stand yet — the line then comes from the subject the route carries, never from a guessed name.
 */
export function checkSubtitle(check: AssessCheck): Subtitle {
    const fig = figuresOf(check);
    if (check.kind === 'deployment') {
        const d = fig as DeploymentFigures | undefined;
        const second: Seg[] = [];
        if (d?.image) second.push(seg('image '), seg(d.image, true));
        if (d?.model)
            second.push(seg(second.length ? ' · model ' : 'model '), seg(`${d.model.name} (#${d.model.id})`, true));
        return { lines: second.length ? [deploymentNameLine(d, check), second] : [deploymentNameLine(d, check)] };
    }
    if (check.kind === 'own_model') {
        const f = fig as OwnModelFigures | undefined;
        const first: Seg[] = [];
        if (f?.model?.name) first.push(seg('model '), seg(`${f.model.name} (#${f.model.id})`, true));
        else if (f?.file) {
            first.push(seg(f.file.name, true), seg(` · sha256 ${shortSha(f.file.sha256)}`));
            if (f.file.run_id) first.push(seg(` · from notebook run ${f.file.run_id}`));
        } else if (check.uploaded_model) {
            first.push(seg('model '), seg(`#${check.uploaded_model.id}`, true));
            if (check.uploaded_model.name) first.push(seg(` (${check.uploaded_model.name})`));
        } else if (check.subject.startsWith('sha:')) first.push(seg(`sha256 ${shortSha(check.subject.slice(4))}`));
        const second: Seg[] = [];
        if (f?.eval_dataset) second.push(seg('on '), seg(`${f.eval_dataset.name} (#${f.eval_dataset.id})`, true));
        return { lines: second.length ? [first, second] : [first] };
    }
    // training_model
    const f = fig as TrainingFigures | undefined;
    const first: Seg[] = [];
    if (f?.model?.name) first.push(seg(`${f.model.name} (#${f.model.id})`, true));
    // the id is a name like the ones above, so it stands in monospace
    else if (check.subject.startsWith('model:')) first.push(seg(`model #${check.subject.slice(6)}`, true));
    const second: Seg[] = [];
    if (f?.eval_dataset) second.push(seg('on '), seg(`${f.eval_dataset.name} (#${f.eval_dataset.id})`, true));
    return { lines: second.length ? [first, second] : [first] };
}

/** The first line of a deployment card: the deployment, its id and the device it runs on. */
function deploymentNameLine(d: DeploymentFigures | undefined, check: AssessCheck): Seg[] {
    const line: Seg[] = [];
    if (d?.deployment?.name) line.push(seg(d.deployment.name, true));
    else if (check.subject) line.push(seg(check.subject.replace(/^deployment:/, ''), true));
    if (d?.deployment?.id) line.push(seg(` (#${d.deployment.id})`));
    if (d?.device?.name) line.push(seg(' on '), seg(d.device.name, true));
    return line;
}

/** The datasets the model of an own-model check was seen on, as the value of the key/value row. */
export function seenDatasetsText(list: NamedRef[] | undefined): string {
    return list?.length ? list.map((d) => `${d.name} (#${d.id})`).join(', ') : 'none';
}

// --- the vocabulary of a card -----------------------------------------------------------------------------------
// The design draws one card for the pre-annotation run, the pre-annotation checks and the result checks; the
// sections below are what every one of them is built from, so that `AnnotationCard.tsx` lays out one shape and
// each builder (`assessCard`, `runCard`, `jobCard`) only decides what goes into it.

/** One cell of a table. */
export type Cell = {
    text: string;
    align?: 'right';
    bold?: boolean;
    mono?: boolean;
    /** A theme colour for the cell's text (red only where the gateway named a figure below its limit). */
    color?: string;
    italic?: boolean;
};

/** One row of a table as the design draws it: a fixed grid of column widths and cells. */
export type TableSection = {
    kind: 'table';
    title?: string;
    /** Grid template for `display: grid` (e.g. `minmax(0,1fr) 64px 64px`). */
    widths: string;
    columns: Cell[];
    rows: Cell[][];
};

/** One line of a step list (the image review while it runs). */
export type StepRow = { text: string; right?: string; done?: boolean; running?: boolean };

/** One image row of a list: the file, the top label, the confidence and the link into CVAT. */
export type ImageRow = {
    /** The file name as CVAT gave it; empty when the check did not name one. */
    file: string;
    label: string;
    confidence: number;
    /** The confidence bar turns to the warning colour below this threshold. */
    threshold?: number;
    /** The gateway's own line about this image (a suspicious image carries its reason here). */
    note?: string;
    /** The link into CVAT for exactly this image; only set when it is a CVAT link. */
    url?: string;
};

/** One section of a card, in the order the design fixes. */
export type Section =
    | { kind: 'verdict'; view: VerdictView; header: string }
    | { kind: 'sample'; text: string; sub?: string; captions?: string[]; icon?: 'image' | 'send' }
    | { kind: 'mode'; text: string; icon: 'stats' | 'image'; reason?: string }
    | { kind: 'basic'; items: BasicCheck[] }
    | { kind: 'progress'; percent: number | null; left: string; right: string }
    | { kind: 'steps'; items: StepRow[] }
    | { kind: 'round'; text: string; done: number; total: number }
    | { kind: 'warn'; text: string }
    | TableSection
    | { kind: 'kv'; rows: KvRow[]; boldLabels?: string[] }
    | { kind: 'list'; title: string; items: (string | { id: string; text: string })[] }
    | { kind: 'images'; title: string; rows: ImageRow[]; more?: string }
    | { kind: 'details'; label: string; rows: KvRow[] }
    /** A small block the design sets apart from the body (the platform figure, design E18). */
    | { kind: 'note'; label: string; text: string }
    | { kind: 'error'; text: string }
    | { kind: 'link'; pre: string; url?: string; text?: string }
    | { kind: 'hint'; icon: HintIcon; text: string };

/** The icons the hint rows use (design L8). */
export type HintIcon = 'lightbulb' | 'history' | 'down' | 'stats' | 'image' | 'undo';

/** The head of a card: what `AnnotationCard.tsx` renders above the sections. */
export type CardView = {
    title: string;
    /** The sort of the check behind the title (" · Calibrate", " · Trained model"). */
    kindLabel?: string;
    icon: 'run' | 'check';
    subtitle: Seg[][];
    /** The effect chip of the card. */
    effect: 'read' | 'write' | 'compute' | 'irreversible';
    state: CardState;
    /** The line on the right of the head ("running · 2:14"); empty: no line. */
    status: string;
    statusColor: 'secondary' | 'success' | 'error';
    /** The colour of the card's left border. */
    accent: string;
    /** A simulated device stands behind a deployment check (a small outlined chip). */
    simulated?: boolean;
    sections: Section[];
};

// --- the check card ---------------------------------------------------------------------------------------------

/** The chip of a status line's colour: finished green, failed red, everything else plain. */
function statusColorOf(state: CardState): 'secondary' | 'success' | 'error' {
    if (state === 'finished') return 'success';
    if (state === 'failed') return 'error';
    return 'secondary';
}

/** The status line of a card: the state and, while it is known, the duration (design L2). */
export function statusLine(state: CardState, seconds: number | undefined): string {
    if (state === 'expired') return 'expired';
    return seconds === undefined ? state : `${state} · ${fmtDuration(seconds)}`;
}

/** The duration a status line shows: since the start while it runs, the whole run once it ended. */
export function statusSeconds(
    from: string | undefined,
    to: string | undefined,
    now: number,
    running: boolean,
): number | undefined {
    if (running) return secondsBetween(from, now);
    const end = parseTime(to);
    const start = parseTime(from);
    if (end === undefined || start === undefined) return undefined;
    return Math.max(0, Math.round((end - start) / 1000));
}

/** One class row as table cells; `support` carries the images or the objects of the class. */
export function classCells(r: ClassRow, withSupport: boolean): Cell[] {
    const red = (name: string) => r.below.includes(name);
    const cells: Cell[] = [
        { text: r.name, mono: true },
        { text: fmt2(r.precision), align: 'right', color: red('precision') ? 'error.main' : undefined },
        { text: fmt2(r.recall), align: 'right', color: red('recall') ? 'error.main' : undefined },
        { text: fmt2(r.f1), align: 'right', color: red('f1') ? 'error.main' : undefined },
    ];
    if (withSupport) cells.push({ text: fmtNum(r.support), align: 'right' });
    return cells;
}

/** The table of a before/after comparison (design E16): the header cell and the three columns of figures. */
export function compareTable(
    title: string,
    rows: CompareRow[],
    widths = 'minmax(0,1fr) 72px 72px 64px',
): TableSection {
    return {
        kind: 'table',
        title,
        widths,
        columns: [{ text: 'Class' }, { text: 'Before', align: 'right' }, { text: 'After', align: 'right' }, { text: 'Change', align: 'right' }],
        rows: rows.map((r) => [
            { text: r.label, mono: true },
            { text: r.before, align: 'right' },
            { text: r.after, align: 'right' },
            { text: changeText(r.change), align: 'right', bold: true, color: changeColor(r.change) },
        ]),
    };
}

/** The reasons, hints and suggestions of a report as the three lists the design fixes (design E19). */
export function textLists(report: AssessReport): Section[] {
    const out: Section[] = [];
    const reasons = visibleReasons(report);
    if (reasons.length) out.push({ kind: 'list', title: 'Reasons', items: reasons });
    if (report.hints?.length) out.push({ kind: 'list', title: 'Hints', items: report.hints });
    const suggestions = suggestionLines(report);
    if (suggestions.length) out.push({ kind: 'list', title: 'Suggestions', items: suggestions });
    return out;
}

/** The card of one result check: head, figures and the gateway's own words, in the design's order. */
export function checkCard(check: AssessCheck, watch: WatchJob | undefined, now: number): CardView {
    const state = checkCardState(check);
    const report = check.report;
    const fig = figuresOf(check);
    const verdict = verdictView(report?.verdict);
    const deployment = check.kind === 'deployment';
    const running = state === 'queued' || state === 'running';
    const from = check.started_at ?? check.created_at;
    const seconds = statusSeconds(from, check.ended_at, now, running);
    const sections: Section[] = [];
    if (verdict) sections.push({ kind: 'verdict', view: verdict, header: report?.header ?? '' });

    if (check.kind === 'own_model') {
        const f = fig as OwnModelFigures | undefined;
        const checks = basicChecks(f?.basic);
        if (checks.length) sections.push({ kind: 'basic', items: checks });
        const extra: KvRow[] = [];
        const pre = preprocessText(f?.preprocess);
        if (pre) extra.push({ label: 'Preprocessing', value: pre });
        if (f?.seen_datasets) extra.push({ label: 'Seen in notebook runs', value: seenDatasetsText(f.seen_datasets) });
        if (extra.length) sections.push({ kind: 'kv', rows: extra });
    }

    if (report && verdict && verdict.verdict !== 'not_measured') {
        // the sample size is the most prominent figure of the card (W5); the caption is the gateway's note (D6)
        if (report.measured_images) {
            const captions = checkSampleCaptions(report);
            sections.push({
                kind: 'sample',
                text: sampleText(report.set, report.measured_images),
                // the image review stands next to the sample, the gateway's captions below it (D9, D6)
                sub: deployment ? undefined : checkImageReviewLine(report),
                captions: captions.length ? captions : undefined,
                icon: deployment ? 'send' : 'image',
            });
        }
        // a deployment check needs no real image and never sends one (R3); the other kinds say what they did
        const mode = modeLine(report);
        sections.push(
            deployment
                ? { kind: 'mode', text: 'Synthetic test requests, no images', icon: 'image' }
                : { kind: 'mode', text: mode.text, icon: mode.icon, reason: mode.reason },
        );
    }

    if (running) {
        // while a check runs the gateway reports the sample and the steps (D7, D8); without progress the
        // card shows only the bar and the watcher's line
        const progress = check.progress;
        if (progress && !deployment) {
            if (progress.set && progress.images)
                sections.push({ kind: 'sample', text: sampleText(progress.set, progress.images), icon: 'image' });
            sections.push(
                progress.review_model
                    ? { kind: 'mode', text: `Statistics and image review (${progress.review_model})`, icon: 'image' }
                    : { kind: 'mode', text: 'Statistics only, no image review', icon: 'stats' },
            );
            const steps = progressStepRows(progress);
            if (steps.length) sections.push({ kind: 'steps', items: steps });
        }
        // the state of a running check comes from the watcher; the card shows a bar and what the check said
        const reviewPercent = reviewStepPercent(progress);
        const left = deployment
            ? 'Sending test requests …'
            : (reviewPercent !== null ? progressReviewText(progress) : undefined) ??
              check.progress?.note ??
              (state === 'queued' ? 'Waiting for a free check container' : '');
        const right = state === 'queued' ? `queued ${fmtDuration(seconds ?? 0)}` : `${fmtDuration(seconds ?? 0)} elapsed`;
        sections.push({ kind: 'progress', percent: reviewPercent ?? jobPercent(watch), left, right });
    }

    if (verdict && verdict.verdict !== 'not_measured') {
        if (deployment) {
            sections.push({ kind: 'kv', rows: deploymentRows(fig as DeploymentFigures | undefined) });
        } else {
            const f = fig as TrainingFigures | OwnModelFigures | undefined;
            const rows = classRows(f?.per_class);
            if (rows.length)
                sections.push({
                    kind: 'table',
                    widths: 'minmax(0,1fr) 72px 60px 48px 64px',
                    columns: [
                        { text: 'Class' },
                        { text: 'Precision', align: 'right' },
                        { text: 'Recall', align: 'right' },
                        { text: 'F1', align: 'right' },
                        { text: 'Support', align: 'right' },
                    ],
                    rows: rows.map((r) => classCells(r, true)),
                });
            // with a previous check the before/after table replaces the two overall figures (design E16)
            const metrics = metricRows(f, !f?.previous);
            if (metrics.length) sections.push({ kind: 'kv', rows: metrics });
            const compare = f?.previous ? compareRows(f.previous, f.overall) : [];
            if (compare.length) sections.push(compareTable('Compared with the previous check', compare));
            const platform = check.kind === 'training_model' ? platformFigure(f as TrainingFigures) : undefined;
            if (platform) sections.push({ kind: 'note', label: platform.label, text: platform.text });
        }
    } else if (check.kind === 'training_model') {
        // a not measured check still shows the platform figure when the gateway read the log (D11, T-10)
        const platform = platformFigure(fig as TrainingFigures | undefined);
        if (platform) sections.push({ kind: 'note', label: platform.label, text: platform.text });
    }

    if (report) sections.push(...textLists(report));
    if (check.error) sections.push({ kind: 'error', text: check.error });
    if (state === 'expired')
        sections.push(
            { kind: 'kv', rows: [{ label: 'Started', value: fmtStarted(check.created_at, now) }, { label: 'Kind', value: kindWord(check.kind) }] },
            { kind: 'hint', icon: 'history', text: 'The gateway no longer has this report, so the result can’t be loaded.' },
            { kind: 'hint', icon: 'down', text: 'The agent’s summary below this card has the result.' },
        );

    return {
        title: check.kind === 'annotation' ? 'Annotation check' : deployment ? 'Deployment check' : 'Model check',
        kindLabel:
            check.kind === 'training_model'
                ? ' · Trained model'
                : check.kind === 'own_model'
                ? ' · Own model'
                : check.kind === 'deployment'
                ? ' · Edge'
                : '',
        icon: 'check',
        subtitle: checkSubtitle(check).lines,
        effect: deployment ? 'read' : 'write',
        state,
        status: statusLine(state, seconds),
        statusColor: statusColorOf(state),
        accent: borderOf(state, report?.verdict),
        simulated: deployment ? (fig as DeploymentFigures | undefined)?.device?.simulated : undefined,
        sections,
    };
}

/** The percent the watcher published for a check, while it runs. */
function jobPercent(watch: WatchJob | undefined): number | null {
    return typeof watch?.progress === 'number' ? Math.round(watch.progress) : null;
}

/** The image review step of a running check, if the gateway reports one with a counted set (R4, D8). */
function reviewStep(progress: AssessProgress | undefined): AssessProgressStep | undefined {
    return progress?.steps?.find((s) => s.name === 'image_review' && (s.m ?? 0) > 0);
}

/** The percent of the image review step; null while it has no counted set (the bar stays indeterminate). */
function reviewStepPercent(progress: AssessProgress | undefined): number | null {
    const step = reviewStep(progress);
    if (!step) return null;
    return Math.min(100, Math.max(0, Math.round(((step.k ?? 0) / (step.m ?? 1)) * 100)));
}

/** The line left of the progress bar while the image review counts its images (design T-03). */
export function progressReviewText(progress: AssessProgress | undefined): string | undefined {
    const step = reviewStep(progress);
    if (!step) return undefined;
    return `image ${fmtNum(step.k ?? 0)} of ${fmtNum(step.m ?? 0)}`;
}

/** The word the set of a check is named with in a step line ("12 validation images"). */
function setImagesWord(set: string | undefined): string {
    switch (set) {
        case 'validation':
            return 'validation images';
        case 'holdout':
            return 'held-out images';
        case 'synthetic':
            return 'test requests';
        default:
            return 'images';
    }
}

/**
 * The steps of a running check as the card shows them (design T-03): the statistics step names the counted set
 * and its duration, the image review step the model and "image k of m". Only the gateway's own steps stand here;
 * the card invents none.
 */
export function progressStepRows(progress: AssessProgress): StepRow[] {
    return (progress.steps ?? []).map((s) => {
        const right = s.seconds !== undefined && s.seconds > 0 ? fmtDuration(Math.round(s.seconds)) : undefined;
        if (s.name === 'image_review') {
            const model = progress.review_model ? ` (${progress.review_model})` : '';
            return {
                text: `Image review${model}`,
                right: s.m ? `image ${fmtNum(s.k ?? 0)} of ${fmtNum(s.m)}` : right,
                done: s.done,
                running: !s.done,
            };
        }
        if (s.name === 'statistics') {
            const counted = s.m ?? progress.images;
            return {
                text: counted ? `Statistics · ${fmtNum(counted)} ${setImagesWord(progress.set)}` : 'Statistics',
                right,
                done: s.done,
                running: !s.done,
            };
        }
        return { text: s.name, right, done: s.done, running: !s.done };
    });
}

/** The word a card names a check's kind with (design *expired*). */
export function kindWord(kind: AssessKind): string {
    switch (kind) {
        case 'training_model':
            return 'Trained model';
        case 'own_model':
            return 'Own model';
        case 'deployment':
            return 'Edge deployment';
        default:
            return 'Annotation check';
    }
}