// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import type { ActivityGrant, ConnectionFilter, InternetKind } from './internet';
import {
    accessList,
    accessSummaryText,
    endInfo,
    formatData,
    KIND_NAME,
    limitText,
    parsePackage,
    viaText,
    versionText,
    cardTexts,
    limitsLine,
} from './internetView';
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

/**
 * What the view lists: everything, only platform calls, the internet access entries (requests, ends, switches; gateway
 * issues #37 and #175) or the connections through the web proxy (own route, own table).
 */
export type KindFilter = 'all' | ActivityKind | 'connections';

export const KIND_FILTERS: { value: KindFilter; label: string }[] = [
    { value: 'all', label: 'Everything' },
    { value: 'platform', label: 'Platform calls' },
    { value: 'internet', label: 'Internet access' },
    { value: 'connections', label: 'Internet connections' },
];

/** The two internet views show a summary line instead of the figure tiles and the effect legend. */
export const isInternetKind = (k: KindFilter): boolean => k === 'internet' || k === 'connections';

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

/** The start of a period as RFC 3339 in UTC without milliseconds; undefined for all. */
export function sinceOf(period: Period, now = new Date()): string | undefined {
    const since = periodSince(period, now);
    return since ? since.toISOString().replace(/\.\d{3}Z$/, 'Z') : undefined;
}

/** Query string of GET /activity ("?since=…&limit=100"); the time goes as RFC 3339 in UTC without milliseconds. */
export function activityQuery(
    opts: {
        period: Period;
        kind?: KindFilter;
        outcome?: ActivityOutcome | '';
        /** One chat (the link from a step detail, issue L6/#123). */
        chat?: string;
        /** One tool call: only the calls it produced (same link). */
        call?: string;
        before?: number;
        limit?: number;
    },
    now = new Date(),
): string {
    const q = new URLSearchParams();
    // kind=platform is the gateway's default; an outcome is about platform calls only, so it asks for those.
    // The connections have their own route (`connectionsQuery`); asked here they mean the platform default.
    const kind = opts.outcome || opts.kind === 'connections' ? 'platform' : opts.kind ?? 'platform';
    if (kind !== 'platform') q.set('kind', kind);
    const since = sinceOf(opts.period, now);
    if (since) q.set('since', since);
    if (opts.outcome) q.set('outcome', opts.outcome);
    if (opts.chat) q.set('chat', opts.chat);
    if (opts.call) q.set('call', opts.call);
    if (opts.before) q.set('before', String(opts.before));
    q.set('limit', String(opts.limit ?? PAGE_SIZE));
    return `?${q.toString()}`;
}

/**
 * Where a step detail links to its own entries in the activity (issue L6/#123, F6). A tool call id is unique, so the
 * call alone finds the entry; the chat narrows it. The tool call decides which row the view opens.
 */
export function activityLinkOf(chatId: string, callId?: string): string {
    const q = new URLSearchParams({ tab: 'activity' });
    if (chatId) q.set('chat', chatId);
    if (callId) q.set('call', callId);
    return `/ai-agent?${q.toString()}`;
}

/**
 * A tool call id the gateway accepts as `?call=` (its `validToolCallID`): at most 256 bytes, no control characters.
 * The step detail links with the id as pi gave it; a hand-made link with anything else is dropped here instead of
 * making the gateway answer 400.
 */
function usableCallId(id: string): boolean {
    // eslint-disable-next-line no-control-regex
    return id.length > 0 && id.length <= 256 && !/[\u0000- \u007f]/.test(id);
}

/**
 * The filter a link into the activity carries (issue L6/#123): the chat and/or the tool call of one step. Anything
 * unusable is left out, so a hand-made link shows the plain activity instead of an error.
 */
export function activityParams(search: string): { chat?: string; call?: string } {
    const q = new URLSearchParams(search);
    const chat = (q.get('chat') ?? '').trim();
    const call = (q.get('call') ?? '').trim();
    return { chat: chat || undefined, call: usableCallId(call) ? call : undefined };
}

/** The way into the internet views of the Activity (issue #175): `kind` and, for the connections, their result. */
export type InternetActivityParams = { kind?: 'internet' | 'connections'; result?: 'allowed' | 'blocked' };

/**
 * Reads `?kind=internet|connections&result=allowed|blocked` of a link into the Activity; anything else is dropped.
 * The chat of the link comes from `activityParams` (`chat`).
 */
export function internetActivityParams(search: string): InternetActivityParams {
    const q = new URLSearchParams(search);
    const kind = q.get('kind');
    const result = q.get('result');
    return {
        kind: kind === 'internet' || kind === 'connections' ? kind : undefined,
        result: result === 'allowed' || result === 'blocked' ? result : undefined,
    };
}

/**
 * Link to the connections of a chat in the Activity, by default the blocked ones ("Show in Activity" of the popover):
 * `/ai-agent?tab=activity&kind=connections&result=blocked&chat=<id>`.
 */
export function internetActivityLink(chatId: string, result: 'allowed' | 'blocked' | '' = 'blocked'): string {
    const q = new URLSearchParams({ tab: 'activity', kind: 'connections' });
    if (result) q.set('result', result);
    if (chatId) q.set('chat', chatId);
    return `/ai-agent?${q.toString()}`;
}

/** The filter of the connection table: the period, the chat of a link, the result and the origin ("From"). */
export function connectionFilterOf(opts: {
    period: Period;
    chat?: string;
    result?: 'allowed' | 'blocked' | '';
    origin?: 'pi' | 'exec' | 'pkg' | '';
    limit?: number;
}): ConnectionFilter {
    return {
        since: sinceOf(opts.period),
        chat: opts.chat || undefined,
        result: opts.result || undefined,
        origin: opts.origin || undefined,
        limit: opts.limit,
    };
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

/**
 * How the table names who made a call (gateway issue L2/#119): the gateway's own reads and the user's switches are not
 * the agent. Bindings stay in the gateway's capitals (CLI, MCP, API); `orchestrator` reads "System" and `user` "UI" —
 * no infrastructure term in the interface (issue #78).
 */
export function viaLabel(via: string): string {
    const v = via.trim().toLowerCase();
    if (v === 'orchestrator') return 'System';
    if (v === 'user') return 'UI';
    return via.toUpperCase();
}

/**
 * The gateway's own read for the summary of an approval (gateway issue L2/#119): op `summary_read`, via
 * `orchestrator`. It is an entry of the system, not a call of the agent, and it never counts in the figures.
 */
export const isSystemRead = (c: ActivityCall): boolean => c.op === 'summary_read';

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

/**
 * The chat's name in the table: a chat deleted since keeps its anonymised record and reads "Deleted chat" (issue #76);
 * otherwise its title, or "Untitled chat".
 */
export function activityChatName(chat: Pick<ActivityChat, 'title' | 'deleted'>): string {
    return chat.deleted ? 'Deleted chat' : chat.title?.trim() || 'Untitled chat';
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
    if (c.op === 'internet_end') {
        const result = (['time', 'bytes', 'installed', 'user', 'agent'].includes(r) ? r : 'error') as
            | 'time'
            | 'bytes'
            | 'installed'
            | 'user'
            | 'agent'
            | 'error';
        return { action: 'end', origin: r === 'user' ? 'user' : r === 'agent' ? 'agent' : 'system', result };
    }
    const result = r.startsWith('approved')
        ? 'approved'
        : r.startsWith('already on')
        ? 'already_on'
        : r.startsWith('expired')
        ? 'expired'
        : r.startsWith('rejected')
        ? 'rejected'
        : r.startsWith('refused')
        ? 'refused'
        : 'error';
    return { action: 'request', origin: 'agent', result };
}

export type InternetTone = 'ok' | 'bad' | 'warn' | 'muted';

/** MUI icons of the Result column (A3, A10, A20); `none` for a result without a symbol. */
export type ResultIcon =
    | 'Check'
    | 'Close'
    | 'HourglassEmpty'
    | 'TaskAlt'
    | 'TimerOff'
    | 'DataUsage'
    | 'PublicOff'
    | 'ErrorOutline'
    | 'none';

/** What a row of the Internet access view says about an entry. */
export type InternetEvent = {
    /** "Sites approved for the agent", "Packages installed, access ended", "Full access switched on by you". */
    title: string;
    /** The agent's reason of a request. */
    reason?: string;
    /** Result column: "approved", "rejected by you", "no decision in time", "ended: time", "refused", … */
    result: string;
    resultIcon: ResultIcon;
    tone: InternetTone;
    /** Who acted: "Agent", "Helper", "You" or "System". */
    by: string;
    /** Icon in front of the title: `Public` where access starts, `PublicOff` where it ends. */
    icon: 'Public' | 'PublicOff';
    /** Kind of the access when the gateway sent the grant. */
    kind?: InternetKind;
    /** Second line: the hosts, the packages, "web tools" or "any address". */
    list?: string;
    /** Via column (A14): CLI, MCP, API; UI only for the user's own switch; "–" otherwise. */
    via: string;
    /** Data column: what the grant moved, for an end and a switch-off; "–" otherwise. */
    data: string;
};

/** Texts of an internet entry for the Internet access view. */
export function internetEvent(c: ActivityCall): InternetEvent {
    const i = internetOf(c);
    const g = c.grant;
    const helper = i.origin === 'agent' && !!c.session && c.session !== 'main';
    const by = i.origin === 'user' ? 'You' : i.origin === 'system' ? 'System' : helper ? 'Helper' : 'Agent';
    const actor = helper ? 'a helper of the agent' : 'the agent';
    const name = g ? KIND_NAME[g.kind] : 'Internet access';
    const via = i.origin === 'user' ? 'UI' : i.origin === 'system' ? '–' : viaText(c.via);
    const base = {
        by,
        via,
        kind: g?.kind,
        list: g ? accessList(g) : undefined,
        data: '–',
    };
    const moved = g ? formatData(g.bytes) : '–';
    const reason = c.detail.trim();
    const hasReason = !!reason && reason !== '(no reason given)';
    const ev = (
        title: string,
        result: string,
        resultIcon: ResultIcon,
        tone: InternetTone,
        icon: 'Public' | 'PublicOff' = 'Public',
        extra: Partial<InternetEvent> = {},
    ): InternetEvent => ({ ...base, title, result, resultIcon, tone, icon, ...extra });

    if (i.action === 'request') {
        const withReason = hasReason ? { reason } : {};
        switch (i.result) {
            case 'approved':
                return ev(`${name} approved for ${actor}`, 'approved', 'Check', 'ok', 'Public', withReason);
            case 'rejected':
                return ev(`${name} rejected by you`, 'rejected', 'Close', 'bad', 'Public', withReason);
            case 'expired':
                return ev(
                    `${name} requested by ${actor}`,
                    'no decision in time',
                    'HourglassEmpty',
                    'warn',
                    'Public',
                    withReason,
                );
            case 'already_on':
                return ev(
                    `${name} requested by ${actor}`,
                    'already on, not asked',
                    'none',
                    'muted',
                    'Public',
                    withReason,
                );
            case 'refused':
                return ev('Internet access request refused', 'refused', 'ErrorOutline', 'bad', 'Public', withReason);
            default:
                return ev('Internet access request failed', 'failed', 'ErrorOutline', 'bad', 'Public', withReason);
        }
    }
    if (i.action === 'off') {
        const title = `${name} switched off by ${actor}`;
        if (i.result === 'off') return ev(title, 'switched off', 'PublicOff', 'muted', 'PublicOff', { data: moved });
        if (i.result === 'already_off') return ev(title, 'was already off', 'none', 'muted', 'PublicOff');
        return ev(title, 'failed', 'ErrorOutline', 'bad', 'PublicOff');
    }
    if (i.action === 'end') {
        const e = endInfo(i.result);
        const data = { data: moved };
        if (i.result === 'user') return ev(`${name} switched off by you`, e.short, e.icon, 'muted', 'PublicOff', data);
        if (i.result === 'agent')
            return ev(`${name} switched off by the agent`, e.short, e.icon, 'muted', 'PublicOff', data);
        const title = i.result === 'installed' ? 'Packages installed, access ended' : `${name} ended: ${e.long}`;
        return ev(title, e.short, e.icon, i.result === 'error' ? 'bad' : 'muted', 'PublicOff', data);
    }
    const on = i.result === 'on' || i.result === 'already_on';
    if (i.result === 'on') return ev(`${name} switched on by you`, 'switched on', 'Check', 'ok');
    if (i.result === 'off')
        return ev(`${name} switched off by you`, 'switched off', 'PublicOff', 'muted', 'PublicOff', { data: moved });
    if (i.result === 'error') return ev('Internet switched by you', 'failed', 'ErrorOutline', 'bad');
    return ev(
        `${name} switched ${on ? 'on' : 'off'} by you`,
        on ? 'was already on' : 'was already off',
        'none',
        'muted',
        on ? 'Public' : 'PublicOff',
    );
}

/** Approvals and data over the entries of the Internet access view (A16): approved requests and switch-ons, once per grant. */
export function accessTotals(calls: ActivityCall[]): { approvals: number; bytes: number } {
    const internet = calls.filter((c) => kindOf(c) === 'internet');
    const approvals = internet.filter((c) => {
        const i = internetOf(c);
        return (i.action === 'request' && i.result === 'approved') || (i.action === 'switch' && i.result === 'on');
    }).length;
    const grants = new Map<number, number>();
    for (const c of internet) if (c.grant) grants.set(c.grant.id, c.grant.bytes);
    return { approvals, bytes: [...grants.values()].reduce((a, b) => a + b, 0) };
}

/** The summary line of the Internet access view: "{n} approvals · {x} GB · {n} blocked"; `blocked` from the connections. */
export function accessSummaryOf(calls: ActivityCall[], blocked: number): string {
    const t = accessTotals(calls);
    return accessSummaryText(t.approvals, t.bytes, blocked);
}

/** "pip torch any version · pip torchvision any version · and the packages these need" (the Allowed row, A19). */
export function allowedLine(g: Pick<ActivityGrant, 'kind' | 'domains' | 'packages'>): string {
    switch (g.kind) {
        case 'search':
            return cardTexts('search').allowText ?? '';
        case 'domains':
            return (g.domains ?? []).join(' · ');
        case 'packages':
            return [
                ...(g.packages ?? []).map((s) => {
                    const p = parsePackage(s);
                    return p ? `${p.ecosystem} ${p.name} ${versionText(p.version)}` : s;
                }),
                'and the packages these need',
            ].join(' · ');
        default:
            return cardTexts('full').allowText ?? '';
    }
}

/** The Limits row of a grant, from what the gateway clamped: minutes between start and expiry, the data limit. */
export function grantLimitsText(g: Pick<ActivityGrant, 'kind' | 'max_bytes' | 'started_at' | 'expires_at'>): string {
    const start = g.started_at ? Date.parse(g.started_at) : NaN;
    const end = g.expires_at ? Date.parse(g.expires_at) : NaN;
    const megabytes = Math.round(g.max_bytes / (1 << 20));
    if (Number.isNaN(start) || Number.isNaN(end) || g.max_bytes <= 0) {
        return g.max_bytes > 0 ? `Data limit ${limitText(g.max_bytes)}.` : '';
    }
    return limitsLine({ kind: g.kind, minutes: Math.max(1, Math.round((end - start) / 60000)), megabytes });
}

/** Footer of the table: how many platform calls of the period and how many internet switches are shown. */
export function shownText(rows: ActivityRow[], total: number | undefined, kind: KindFilter, outcome: string): string {
    // The gateway's own summary reads (issue L2/#119) are rows of the platform kind but no calls of the agent: they
    // stay out of the count that matches the figures and are named separately.
    const system = rows.filter((r) => isSystemRead(r.call)).length;
    const platform = rows.filter((r) => kindOf(r.call) === 'platform' && !isSystemRead(r.call)).length;
    const internet = rows.length - platform - system;
    const switches = `${internet} internet ${internet === 1 ? 'entry' : 'entries'}`;
    const reads = `${system} read${system === 1 ? '' : 's'} by the system`;
    if (kind === 'internet') return `Shows ${switches}.`;
    if (outcome) return `Shows ${platform} ${platform === 1 ? 'call' : 'calls'} with this result.`;
    const calls = `Shows ${platform} of ${total ?? platform} platform ${(total ?? platform) === 1 ? 'call' : 'calls'}`;
    const rest = [internet > 0 ? switches : '', system > 0 ? reads : ''].filter(Boolean);
    return rest.length > 0 ? `${calls} and ${rest.join(' and ')}.` : `${calls}.`;
}
