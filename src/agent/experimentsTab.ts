// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// What the tab "Experiments" shows, derived from the data of `experiments.ts` in pure functions (gateway issue #168,
// Welle 2 W2-b): the table (columns strictly from the search space, G9), the comparison
// chart (direction from the objective, G7), the curves of one trial and their captions, and the menu of a row (G8).
// The words of the states and the numbers come from `searchView.ts`.

import type { EpochRow, GpuPoint, Search, SearchPath, Trial } from './experiments';
import { compactNumber, isOpen, metricWords, paramValue, scoreText, trialsOf } from './searchView';

// ---------------------------------------------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------------------------------------------

/** The parameter columns: the names of the search space, in its order; nothing is invented (G9, G12). */
export const spaceColumns = (search: Pick<Search, 'space'> | undefined): string[] => Object.keys(search?.space ?? {});

/** The base configuration of a search (template way) as the gateway stored it: `base.config`. */
function baseConfig(search: Search): Record<string, unknown> | undefined {
    const cfg = search.base?.config;
    return cfg && typeof cfg === 'object' && !Array.isArray(cfg) ? (cfg as Record<string, unknown>) : undefined;
}

/** "pretrained yes · optimizer AdamW": the settings every trial shares (the base without the searched keys), as a
 *  line above the table instead of a hover (G19). Empty without a base (notebook way). */
export function fixedSettings(search: Search): string {
    const cfg = baseConfig(search);
    if (!cfg) return '';
    const searched = new Set(spaceColumns(search));
    return Object.keys(cfg)
        .filter((k) => !searched.has(k))
        .map((k) => `${k} ${paramValue(cfg[k])}`)
        .join(' · ');
}

/** One row: a trial with the label of its first column ("1" for a trial, "S2" for a single run). */
export type TrialRow = { trial: Trial; label: string; best: boolean; winner: boolean };

export type RowGroup = {
    key: string;
    /** The heading of the group in "All runs": the search, or "Single runs". */
    title: string;
    search?: Search;
    rows: TrialRow[];
};

const trialLabelOf = (t: Trial): string => (t.idx > 0 ? String(t.idx) : `S${t.seq}`);

/** The rows of one search, with the best trial and the winner marked. */
export function rowsOf(search: Search, trials: Trial[], best?: Trial): TrialRow[] {
    return trialsOf(trials, search.id).map((t) => ({
        trial: t,
        label: trialLabelOf(t),
        best: !!best && best.id === t.id,
        winner: typeof search.winner_idx === 'number' && search.winner_idx === t.idx,
    }));
}

/** The title of a trial: "Trial 4", with the architecture only when the trial has one (G9). */
export function trialTitle(t: Trial): string {
    const arch = t.params?.architecture;
    const head = t.idx > 0 ? `Trial ${t.idx}` : `Single run ${t.seq}`;
    if (typeof arch === 'string' && arch) return `${head} · ${arch}`;
    return t.idx === 0 && t.name ? `${head} · ${t.name}` : head;
}

/** The address of the run for "Open in JupyterHub": only what the gateway gave, and only https. */
export function trialLink(t: Pick<Trial, 'link'>): string | undefined {
    if (!t.link) return undefined;
    try {
        return new URL(t.link).protocol === 'https:' ? t.link : undefined;
    } catch {
        return undefined;
    }
}

export const pathWord = (p: SearchPath): string => (p === 'notebook' ? 'notebook' : 'template');

/** The hint for the tooltip of the score: the epoch of the saved model (A1). */
export function scoreTitle(t: Pick<Trial, 'score' | 'score_epoch'>): string | undefined {
    if (typeof t.score !== 'number') return undefined;
    return typeof t.score_epoch === 'number' ? `Value of the saved model, epoch ${t.score_epoch}` : 'Value of the saved model';
}

/** The explanation line below the table. */
export function tableFooter(search: Search | undefined, rows: TrialRow[], singles: number): string {
    if (!search) return `${rows.length + singles} runs · ★ marks the best validation value of a search`;
    const words = metricWords(search.objective);
    return `${rows.length} trial${rows.length === 1 ? '' : 's'} · ★ best ${words.short} so far · the winner is chosen by ${words.short} only`;
}

// The row menu (G8): Adopt only for a finished trial of the running search, Stop only for the open trial of a
// running search, otherwise just "Show details".
export type RowMenu = { adopt: boolean; stop: boolean; open: boolean };

export function rowMenu(row: TrialRow, search: Search | undefined): RowMenu {
    const running = search?.state === 'running';
    return {
        adopt: !!running && row.trial.state === 'done' && row.trial.idx > 0,
        stop: !!running && isOpen(row.trial),
        open: !!trialLink(row.trial),
    };
}

// ---------------------------------------------------------------------------------------------------------------
// The comparison chart
// ---------------------------------------------------------------------------------------------------------------

export type ComparePoint = {
    name: string;
    idx: number;
    /** The score of a finished trial, the current value of a running one. */
    score?: number;
    /** The best finished value up to and including this trial, in the direction of the objective (G7). */
    bestSoFar?: number;
    state: Trial['state'];
    best: boolean;
    running: boolean;
    failed: boolean;
};

const better = (mode: 'max' | 'min' | undefined, a: number, b: number): boolean => (mode === 'min' ? a < b : a > b);

/** One point per trial of the search, in order; failed and stopped trials do not count for "best so far". */
export function compareData(search: Search, list: Trial[], best?: Trial): ComparePoint[] {
    let run: number | undefined;
    return list.map((t) => {
        const finished = t.state === 'done' && typeof t.score === 'number';
        if (finished && (run === undefined || better(search.objective?.mode, t.score as number, run))) run = t.score as number;
        const hasScore = typeof t.score === 'number' && t.state !== 'failed' && t.state !== 'refused';
        return {
            name: `Trial ${t.idx}`,
            idx: t.idx,
            score: hasScore ? (t.score as number) : undefined,
            bestSoFar: run,
            state: t.state,
            best: !!best && best.id === t.id,
            running: isOpen(t),
            failed: t.state === 'failed',
        };
    });
}

/** The text below the chart, which is also its accessible name: every value as words (no value only in colour). */
export function compareCaption(search: Search, list: Trial[], best?: Trial): string {
    const o = search.objective;
    const words = metricWords(o);
    const parts: string[] = [];
    if (best && typeof best.score === 'number') parts.push(`${search.state === 'ended' ? 'Best' : 'Best so far'}: trial ${best.idx} with ${scoreText(best.score, o)}.`);
    else parts.push('No finished trial yet.');
    const others = list.filter((t) => !best || t.id !== best.id);
    const done = others.filter((t) => t.state === 'done' && typeof t.score === 'number');
    const running = others.filter(isOpen);
    const failed = others.filter((t) => t.state === 'failed');
    const stopped = others.filter((t) => t.state === 'stopped');
    const bits: string[] = [];
    for (const t of running)
        bits.push(`trial ${t.idx} is running${typeof t.score === 'number' ? ` (${scoreText(t.score, o)}${typeof t.epoch === 'number' ? ` at epoch ${t.epoch}` : ''})` : ''}`);
    if (done.length === 1) bits.push(`trial ${done[0].idx} reached ${scoreText(done[0].score, o)}`);
    else if (done.length > 1)
        bits.push(
            `trials ${done.slice(0, -1).map((t) => t.idx).join(', ')} and ${done[done.length - 1].idx} reached ${done.map((t) => scoreText(t.score, o)).join(', ')}`,
        );
    if (failed.length) bits.push(`trial${failed.length > 1 ? 's' : ''} ${failed.map((t) => t.idx).join(', ')} failed`);
    if (stopped.length) bits.push(`trial${stopped.length > 1 ? 's' : ''} ${stopped.map((t) => t.idx).join(', ')} stopped`);
    if (bits.length) parts.push(`${bits.join('; ').replace(/^./, (c) => c.toUpperCase())}.`);
    const target = search.budget?.target;
    if (typeof target === 'number') {
        const reached = !!best && typeof best.score === 'number' && (o?.mode === 'min' ? best.score <= target : best.score >= target);
        parts.push(`Target ${compactNumber(target)}${reached ? ' reached' : ' not reached'}.`);
    }
    return `${words.label} per trial. ${parts.join(' ')}`;
}

// ---------------------------------------------------------------------------------------------------------------
// The curves of one trial
// ---------------------------------------------------------------------------------------------------------------

export type CurveKind = 'loss' | 'acc';

const CURVE_KEYS: Record<CurveKind, { train: string; val: string }> = {
    loss: { train: 'train_loss', val: 'val_loss' },
    acc: { train: 'train_acc', val: 'val_acc' },
};

export const curveKeys = (kind: CurveKind) => CURVE_KEYS[kind];

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

export type CurvePoint = { epoch: number; train?: number; val?: number };

/** The rows of one curve chart; a chart without any value of its two series is not drawn at all. */
export function curveData(rows: EpochRow[], kind: CurveKind): CurvePoint[] {
    const k = CURVE_KEYS[kind];
    return rows
        .map((r) => ({ epoch: r.epoch, train: num(r[k.train]), val: num(r[k.val]) }))
        .filter((p) => p.train !== undefined || p.val !== undefined);
}

const fixed = (kind: CurveKind, v: number): string => v.toFixed(kind === 'loss' ? 3 : 2);

/** "Last (epoch 7): training 0.58, validation 0.87 · lowest validation 0.87 (epoch 7)" (the best is the lowest loss
 *  or the highest accuracy). */
export function curveCaption(points: CurvePoint[], kind: CurveKind): string {
    if (points.length === 0) return '';
    const last = points[points.length - 1];
    const vals = [`${last.train !== undefined ? `training ${fixed(kind, last.train)}` : ''}`, `${last.val !== undefined ? `validation ${fixed(kind, last.val)}` : ''}`].filter(Boolean);
    let text = `Last (epoch ${last.epoch}): ${vals.join(', ')}`;
    const withVal = points.filter((p) => p.val !== undefined) as (CurvePoint & { val: number })[];
    if (withVal.length > 0) {
        const pick = withVal.reduce((a, b) => (kind === 'loss' ? (b.val < a.val ? b : a) : b.val > a.val ? b : a));
        text += ` · ${kind === 'loss' ? 'lowest' : 'best'} validation ${fixed(kind, pick.val)} (epoch ${pick.epoch})`;
    }
    return text;
}

export type GpuRow = { min: number; util: number; memGb: number };

const MB_PER_GB = 1024;

/** The GPU samples as minutes since the first sample, utilisation in percent and memory in GB. */
export function gpuData(points: GpuPoint[]): { rows: GpuRow[]; totalGb: number } {
    if (points.length === 0) return { rows: [], totalGb: 0 };
    const t0 = Date.parse(points[0].at);
    const rows = points.map((p) => ({
        min: Math.round(((Date.parse(p.at) - t0) / 60000) * 100) / 100,
        util: p.util,
        memGb: Math.round((p.mem_used_mb / MB_PER_GB) * 10) / 10,
    }));
    const total = Math.max(...points.map((p) => p.mem_total_mb));
    return { rows, totalGb: Math.round(total / MB_PER_GB) };
}

/** "Now: utilisation 90 %, memory 10.2 of 32 GB · peak 91 %" while the trial runs, "Range: …" afterwards. */
export function gpuCaption(rows: GpuRow[], totalGb: number, running: boolean): string {
    if (rows.length === 0) return '';
    const utils = rows.map((r) => r.util);
    const mems = rows.map((r) => r.memGb);
    const last = rows[rows.length - 1];
    if (running) return `Now: utilisation ${Math.round(last.util)} %, memory ${last.memGb} of ${totalGb} GB · peak ${Math.round(Math.max(...utils))} %`;
    return `Range: utilisation ${Math.round(Math.min(...utils))}–${Math.round(Math.max(...utils))} %, memory ${Math.min(...mems)}–${Math.max(...mems)} of ${totalGb} GB`;
}

/** Where the figures come from (D17): the template of the platform or the run's own code. */
export function sourceText(t: Trial, search: Search | undefined): string {
    if (t.path !== 'notebook') return 'Figures written by the platform template';
    const entry = search?.code?.entry;
    const file = search?.code?.files?.find((f) => f.name === entry) ?? search?.code?.files?.[0];
    const sha = file?.sha256 ? ` ${file.sha256.slice(0, 4)}…${file.sha256.slice(-4)}` : '';
    const ver = typeof t.code_version === 'number' && t.code_version > 0 ? `code version ${t.code_version}${sha ? `,${sha}` : ''}` : sha.trim();
    return `Figures written by the run's code${ver ? ` (${ver})` : ''}`;
}
