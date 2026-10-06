// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import type { ActivityCall, ActivityChat, ActivityOutcome, ActivityPage } from './types';

/** Period of the activity view, counted in local days. */
export type Period = 'today' | '7d' | '30d' | 'all';

export const PERIODS: { value: Period; label: string }[] = [
    { value: 'today', label: 'Today' },
    { value: '7d', label: '7 days' },
    { value: '30d', label: '30 days' },
    { value: 'all', label: 'All' },
];

/** Wording of a period after a figure ("platform calls today"). */
export const PERIOD_PHRASE: Record<Period, string> = {
    today: 'today',
    '7d': 'in the last 7 days',
    '30d': 'in the last 30 days',
    all: 'in total',
};

export const OUTCOME_FILTERS: { value: ActivityOutcome | ''; label: string }[] = [
    { value: '', label: 'All results' },
    { value: 'ok', label: 'ok' },
    { value: 'error', label: 'error' },
    { value: 'blocked', label: 'blocked' },
    { value: 'logged', label: 'violation, logged only' },
    { value: 'rejected', label: 'rejected by you' },
    { value: 'refused', label: 'refused' },
];

/** Calls per page; the gateway allows up to 500. */
export const PAGE_SIZE = 100;

/** Start of a period: local midnight of today, 6 or 29 days before; undefined for all. */
export function periodSince(period: Period, now = new Date()): Date | undefined {
    const days = { today: 0, '7d': 6, '30d': 29, all: undefined }[period];
    if (days === undefined) return undefined;
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    d.setDate(d.getDate() - days);
    return d;
}

/** Query string of GET /activity ("?since=…&limit=100"); the time goes as RFC 3339 in UTC without milliseconds. */
export function activityQuery(
    opts: { period: Period; outcome?: ActivityOutcome | ''; before?: number; limit?: number },
    now = new Date(),
): string {
    const q = new URLSearchParams();
    const since = periodSince(opts.period, now);
    if (since) q.set('since', since.toISOString().replace(/\.\d{3}Z$/, 'Z'));
    if (opts.outcome) q.set('outcome', opts.outcome);
    if (opts.before) q.set('before', String(opts.before));
    q.set('limit', String(opts.limit ?? PAGE_SIZE));
    return `?${q.toString()}`;
}

/** Appends the next page: calls without duplicates, chats merged, summary and cursor of the newer page. */
export function mergePages(prev: ActivityPage, next: ActivityPage): ActivityPage {
    const seen = new Set(prev.calls.map((c) => c.id));
    return {
        calls: [...prev.calls, ...next.calls.filter((c) => !seen.has(c.id))],
        chats: { ...prev.chats, ...next.chats },
        next_before: next.next_before,
        summary: next.summary,
    };
}

/** One platform call of the agent with its chat and the other calls of the same tool call. */
export type ActivityRow = { call: ActivityCall; chat: ActivityChat; log: ActivityCall[] };

/** Rows of the table, newest first; calls of one tool call share their log (oldest first). */
export function activityRows(page: ActivityPage): ActivityRow[] {
    const byToolCall = new Map<string, ActivityCall[]>();
    for (const c of page.calls) {
        if (!c.tool_call_id) continue;
        const key = `${c.chat_id ?? ''}|${c.tool_call_id}`;
        byToolCall.set(key, [...(byToolCall.get(key) ?? []), c]);
    }
    return [...page.calls]
        .sort((a, b) => b.id - a.id)
        .map((call) => {
            const chatId = call.chat_id ?? '';
            const chat = page.chats[chatId] ?? { id: chatId, title: '', model: '', variant: '' };
            const log = call.tool_call_id
                ? [...(byToolCall.get(`${chatId}|${call.tool_call_id}`) ?? [call])].sort((a, b) => a.id - b.id)
                : [call];
            return { call, chat, log };
        });
}

/** "–" (not measured), "0.4 ms", "12 ms", "1.2 s". */
export function formatDuration(ms: number | undefined | null): string {
    if (ms === undefined || ms === null || !Number.isFinite(ms) || ms < 0) return '–';
    if (ms < 10) return `${(Math.round(ms * 10) / 10).toString()} ms`;
    if (ms < 1000) return `${Math.round(ms)} ms`;
    if (ms < 60000) return `${(Math.round(ms / 100) / 10).toString()} s`;
    return `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s`;
}

/** Key figures of the summary; counts missing from an older gateway count as 0. */
export function activityFigures(page: ActivityPage) {
    const s = page.summary;
    const n = (o: ActivityOutcome) => s.outcomes?.[o] ?? 0;
    return {
        total: s.total ?? 0,
        chats: s.chats ?? 0,
        runs: s.runs ?? 0,
        blocked: n('blocked'),
        rejected: n('rejected'),
        failed: n('error') + n('refused'),
        avg: s.duration?.count ? s.duration.avg_ms : undefined,
        p95: s.duration?.count ? s.duration.p95_ms : undefined,
        measured: s.duration?.count ?? 0,
    };
}
