// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import type {
    ActivityCall,
    ActivityChat,
    ActivityInternet,
    ActivityKind,
    ActivityOutcome,
    ActivityPage,
} from './types';

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

/** What the table lists: everything, only platform calls or only internet switches (gateway issue #37). */
export type KindFilter = 'all' | ActivityKind;

export const KIND_FILTERS: { value: KindFilter; label: string }[] = [
    { value: 'all', label: 'Everything' },
    { value: 'platform', label: 'Platform calls' },
    { value: 'internet', label: 'Internet switches' },
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
    opts: { period: Period; kind?: KindFilter; outcome?: ActivityOutcome | ''; before?: number; limit?: number },
    now = new Date(),
): string {
    const q = new URLSearchParams();
    // kind=platform is the gateway's default; an outcome is about platform calls only, so it asks for those.
    const kind = opts.outcome ? 'platform' : opts.kind ?? 'platform';
    if (kind !== 'platform') q.set('kind', kind);
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

/** Kind of an entry; a gateway before issue #37 sends none, and all its entries are platform calls. */
export const kindOf = (c: ActivityCall): ActivityKind => c.kind ?? 'platform';

/** One platform call of the agent with its chat and the other calls of the same tool call, or one internet entry. */
export type ActivityRow = { call: ActivityCall; chat: ActivityChat; log: ActivityCall[] };

/**
 * Rows of the table, newest first; platform calls of one tool call share their log (oldest first), an internet
 * entry stands alone. With a kind other than all, entries of the other kind are left out (an older gateway ignores
 * kind=internet and answers with platform calls).
 */
export function activityRows(page: ActivityPage, kind: KindFilter = 'all'): ActivityRow[] {
    const calls = kind === 'all' ? page.calls : page.calls.filter((c) => kindOf(c) === kind);
    const byToolCall = new Map<string, ActivityCall[]>();
    for (const c of calls) {
        if (!c.tool_call_id || kindOf(c) !== 'platform') continue;
        const key = `${c.chat_id ?? ''}|${c.tool_call_id}`;
        byToolCall.set(key, [...(byToolCall.get(key) ?? []), c]);
    }
    return [...calls]
        .sort((a, b) => b.id - a.id)
        .map((call) => {
            const chatId = call.chat_id ?? '';
            const chat = page.chats[chatId] ?? { id: chatId, title: '', model: '', variant: '' };
            const log =
                call.tool_call_id && kindOf(call) === 'platform'
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

/** Action, origin and result of an internet entry; from the gateway's internet field, else from op and result. */
export function internetOf(c: ActivityCall): ActivityInternet {
    if (c.internet) return c.internet;
    const r = c.result.toLowerCase();
    if (c.op === 'internet_set') {
        const result = (['on', 'off', 'already on', 'already off'].includes(r) ? r.replace(' ', '_') : 'error') as
            | 'on'
            | 'off'
            | 'already_on'
            | 'already_off'
            | 'error';
        return { action: 'switch', origin: 'user', result };
    }
    if (c.op === 'internet_off') {
        return {
            action: 'off',
            origin: 'agent',
            result: r === 'off' ? 'off' : r === 'already off' ? 'already_off' : 'error',
        };
    }
    const result = r.startsWith('approved')
        ? 'approved'
        : r.startsWith('already on')
        ? 'already_on'
        : r.startsWith('expired')
        ? 'expired'
        : r.startsWith('rejected')
        ? 'rejected'
        : 'error';
    return { action: 'request', origin: 'agent', result };
}

export type InternetTone = 'ok' | 'bad' | 'warn' | 'muted';

/** What a row of the table says about an internet entry. */
export type InternetEvent = {
    /** "Internet requested", "Internet switched off by the agent", "Internet switched on by you". */
    title: string;
    /** The agent's reason of a request. */
    reason?: string;
    /** Result column: "approved", "rejected by you", "no decision in time", "switched off", … */
    result: string;
    tone: InternetTone;
    /** Who acted: "Agent", "Subagent" or "You". */
    by: string;
};

/** Texts of an internet entry for the activity table. */
export function internetEvent(c: ActivityCall): InternetEvent {
    const i = internetOf(c);
    const sub = i.origin === 'agent' && !!c.session && c.session !== 'main';
    const by = i.origin === 'user' ? 'You' : sub ? 'Subagent' : 'Agent';
    const actor = sub ? 'a subagent' : 'the agent';
    if (i.action === 'request') {
        const reason = c.detail.trim();
        const results: Record<string, [string, InternetTone]> = {
            approved: ['approved', 'ok'],
            already_on: ['already on, not asked', 'muted'],
            rejected: ['rejected by you', 'bad'],
            expired: ['no decision in time', 'warn'],
        };
        const [result, tone] = results[i.result] ?? ['failed', 'bad'];
        return {
            title: `Internet requested by ${actor}`,
            reason: reason && reason !== '(no reason given)' ? reason : undefined,
            result,
            tone,
            by,
        };
    }
    if (i.action === 'off') {
        const [result, tone]: [string, InternetTone] =
            i.result === 'off'
                ? ['switched off', 'muted']
                : i.result === 'already_off'
                ? ['was already off', 'muted']
                : ['failed', 'bad'];
        return { title: `Internet switched off by ${actor}`, result, tone, by };
    }
    const on = i.result === 'on' || i.result === 'already_on';
    const [result, tone]: [string, InternetTone] =
        i.result === 'on'
            ? ['on', 'ok']
            : i.result === 'off'
            ? ['off', 'muted']
            : i.result === 'error'
            ? ['failed', 'bad']
            : [on ? 'was already on' : 'was already off', 'muted'];
    return {
        title: i.result === 'error' ? 'Internet switched by you' : `Internet switched ${on ? 'on' : 'off'} by you`,
        result,
        tone,
        by,
    };
}

/** Footer of the table: how many platform calls of the period and how many internet switches are shown. */
export function shownText(rows: ActivityRow[], total: number | undefined, kind: KindFilter, outcome: string): string {
    const platform = rows.filter((r) => kindOf(r.call) === 'platform').length;
    const internet = rows.length - platform;
    const switches = `${internet} internet ${internet === 1 ? 'switch' : 'switches'}`;
    if (kind === 'internet') return `Shows ${switches}.`;
    if (outcome) return `Shows ${platform} ${platform === 1 ? 'call' : 'calls'} with this result.`;
    const calls = `Shows ${platform} of ${total ?? platform} platform ${(total ?? platform) === 1 ? 'call' : 'calls'}`;
    return internet > 0 ? `${calls} and ${switches}.` : `${calls}.`;
}
