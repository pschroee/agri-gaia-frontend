// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Context usage and tokens of a chat and of single answers, prepared for display. The gateway reports the context
// per chat (pi's get_session_stats) and the tokens per chat and per stored answer (pi's usage). It records costs as
// well; the platform does not show them (issue #43).

import type { ContextUsage, PiEvent, StoredMessage, Usage } from './types';

/** normal: plenty of room; warn: auto-compaction comes soon; danger: at or beyond the compaction threshold. */
export type ContextLevel = 'normal' | 'warn' | 'danger';

/** The ring turns amber this share of the window before the compaction threshold … */
export const WARN_MARGIN = 0.15;
/** … and red this share before it. */
export const DANGER_MARGIN = 0.05;

const intFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export const formatTokens = (v: number | null | undefined): string => intFmt.format(v ?? 0);

/** 950, 12.3k, 128k, 1.2M: tokens for tight places. */
export function formatTokensShort(v: number | null | undefined): string {
    const n = v ?? 0;
    if (n < 1000) return intFmt.format(n);
    if (n < 1_000_000) {
        const k = n / 1000;
        return `${k < 100 ? Math.round(k * 10) / 10 : Math.round(k)}k`;
    }
    const m = n / 1_000_000;
    return `${m < 100 ? Math.round(m * 10) / 10 : Math.round(m)}M`;
}

/** Percentage 0–100 as an integer; small values above 0 as "< 1 %". */
export function formatPercent(p: number | null | undefined): string {
    if (p === null || p === undefined || Number.isNaN(p)) return '–';
    if (p > 0 && p < 1) return '< 1 %';
    return `${Math.round(p)} %`;
}

/** Compaction threshold in tokens; without a usable value the full window. */
function thresholdOf(c: Pick<ContextUsage, 'window' | 'threshold_tokens'>): number {
    const t = c.threshold_tokens;
    return t > 0 && t <= c.window ? t : c.window;
}

/** Level by the distance of the used tokens to the compaction threshold, measured in shares of the window. */
export function contextLevel(tokens: number | null | undefined, window: number, threshold: number): ContextLevel {
    if (tokens === null || tokens === undefined || window <= 0) return 'normal';
    const t = threshold > 0 && threshold <= window ? threshold : window;
    if (tokens >= t - DANGER_MARGIN * window) return 'danger';
    if (tokens >= t - WARN_MARGIN * window) return 'warn';
    return 'normal';
}

export type ContextView = {
    /** false right after a compaction, until the next answer measures again. */
    measured: boolean;
    /** "42 %" or "–". */
    percent: string;
    /** Share of the window used, 0–1, for the ring. */
    ratio: number;
    /** Position of the compaction threshold on the ring, 0–1. */
    thresholdRatio: number;
    level: ContextLevel;
    /** Lines for the tooltip. */
    used: string;
    window: string;
    threshold: string;
    reserve: string;
    /** "12,000 tokens until auto-compaction", "auto-compaction is due", or with auto-compaction off the free rest. */
    headroom: string;
};

/** Prepares the context usage; autoCompact decides how the headroom is described. */
export function describeContext(c: ContextUsage, autoCompact = true): ContextView {
    const threshold = thresholdOf(c);
    const base = {
        window: `${formatTokens(c.window)} tokens`,
        threshold: `${formatTokens(threshold)} tokens`,
        reserve: `${formatTokens(c.reserve_tokens)} tokens`,
        thresholdRatio: c.window > 0 ? Math.min(1, threshold / c.window) : 1,
    };
    if (c.tokens === null || c.window <= 0) {
        return {
            ...base,
            measured: false,
            percent: '–',
            ratio: 0,
            level: 'normal',
            used: 'measured again after the next answer',
            headroom: '',
        };
    }
    const percent = c.percent ?? (c.tokens / c.window) * 100;
    const toThreshold = threshold - c.tokens;
    let headroom: string;
    if (!autoCompact) headroom = `${formatTokens(Math.max(0, c.window - c.tokens))} tokens free, auto-compaction off`;
    else if (toThreshold > 0) headroom = `${formatTokens(toThreshold)} tokens until auto-compaction`;
    else headroom = 'auto-compaction is due with the next answer';
    return {
        ...base,
        measured: true,
        percent: formatPercent(percent),
        ratio: Math.min(1, Math.max(0, c.tokens / c.window)),
        level: contextLevel(c.tokens, c.window, threshold),
        used: `${formatTokens(c.tokens)} / ${formatTokens(c.window)} tokens`,
        headroom,
    };
}

/** A compaction seen live in the SSE stream (compaction_start until compaction_end). */
export type Compacting = { reason: string; since: number };

/**
 * Next compaction state after a pi event: compaction_start opens it, compaction_end closes it; a new turn
 * (agent_start) closes one whose end got lost.
 */
export function compactingAfter(state: Compacting | undefined, ev: PiEvent, now: number): Compacting | undefined {
    if (ev.type === 'compaction_start') {
        return { reason: typeof ev.reason === 'string' ? ev.reason : 'manual', since: now };
    }
    if (ev.type === 'compaction_end' || ev.type === 'agent_start') return undefined;
    return state;
}

const REASON_LABEL: Record<string, string> = {
    manual: 'on request',
    threshold: 'context near its limit',
    overflow: 'context overflowed',
};

/** "context near its limit" for a compaction reason; unknown reasons as given. */
export const compactionReason = (reason: string | undefined): string =>
    (reason && REASON_LABEL[reason]) ?? reason ?? '';

/** Tokens of one answer (all assistant messages of a turn). */
export type AnswerUsage = {
    input: number;
    output: number;
    cacheRead: number;
    /** Model calls (assistant messages) in the answer. */
    calls: number;
};

/** Sums the usage of the assistant messages of one answer. */
export function answerUsage(messages: Pick<StoredMessage, 'message'>[]): AnswerUsage | undefined {
    const answers = messages.filter((m) => m.message.role === 'assistant');
    if (!answers.length) return undefined;
    const u: AnswerUsage = { input: 0, output: 0, cacheRead: 0, calls: answers.length };
    for (const m of answers) {
        const us: Usage | undefined = m.message.usage;
        u.input += us?.input ?? 0;
        u.output += us?.output ?? 0;
        u.cacheRead += us?.cacheRead ?? 0;
    }
    return u;
}

/** "1,234 in · 567 out · 8,900 cache" for the muted line under an answer. */
export function formatAnswerUsage(u: AnswerUsage): string {
    const parts = [`${formatTokens(u.input)} in`, `${formatTokens(u.output)} out`];
    if (u.cacheRead) parts.push(`${formatTokens(u.cacheRead)} cache`);
    return parts.join(' · ');
}

/** Share of input served from the cache, cacheRead / (input + cacheRead); undefined without input. */
export function cacheHitRate(input: number | undefined, cacheRead: number | undefined): number | undefined {
    const total = (input ?? 0) + (cacheRead ?? 0);
    return total > 0 ? (cacheRead ?? 0) / total : undefined;
}
