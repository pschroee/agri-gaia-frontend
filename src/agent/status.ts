// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Derivations of the Status tab on /ai-agent: warm pool per variant, models, approvals and reachability.

import { AgentApiError } from './api';
import { variantLabel } from './format';
import { levelsByModel } from './modelChoice';
import type { Approval, Chat, Config, Me, Model, PlatformStatus, Pool, Slot, SlotActivity, Variant } from './types';

/**
 * Subagents a chat may run at the same time, fixed in the gateway. Older gateways sent only the default and upper
 * bound of the former per-chat setting; their default is shown then.
 */
export function subagentsAtOnce(cfg: Pick<Config, 'max_subagents' | 'max_subagents_default'>): string {
    const n = cfg.max_subagents ?? cfg.max_subagents_default;
    return n === undefined ? '–' : `at most ${n}`;
}

/** How often the Status tab reloads. */
export const STATUS_REFRESH_MS = 15000;

/** A slot of the pool that holds one of the user's chats. */
export type PoolChat = { slotId: string; chatId: string; title: string; chat?: Chat; activity?: SlotActivity };

export type VariantPool = {
    variant: string;
    label: string;
    target: number;
    free: number;
    busy: number;
    starting: number;
    stopping: number;
    /** Busy slots that hold other users' chats (the gateway hides id and title). */
    others: number;
    /** Images of the variant's slots (pi container), without duplicates. */
    images: string[];
    mine: PoolChat[];
    /** The combination new chats get (AGW_TOOLSETS); the others only hold older chats. */
    active: boolean;
};

/**
 * The connection every new chat gets, fixed by the gateway (AGW_TOOLSETS, gateway issue #29): from GET /config,
 * else the active entry of GET /variants; undefined for a gateway that still lets the user choose.
 */
export function activeConnection(cfg: Config | undefined, variants: Variant[]): Variant | undefined {
    return cfg?.toolsets ?? variants.find((v) => v.active);
}

/** The bindings of a connection key for display: 'cli,api' → 'CLI + REST API'; 'both' is cli,mcp. */
export function bindingsText(id: string): string {
    const names: Record<string, string> = { cli: 'CLI', mcp: 'MCP', api: 'REST API' };
    return (id === 'both' ? 'cli,mcp' : id)
        .split(',')
        .map((b) => b.trim())
        .filter(Boolean)
        .map((b) => names[b] ?? b)
        .join(' + ');
}

/**
 * Groups the pool's slots by variant, in the order of the gateway's variant list, then variants that only the pool
 * names. Busy slots with a chat id are the user's own chats (the gateway hides foreign ones).
 */
export function poolByVariant(pool: Pool | undefined, variants: Variant[], chats: Chat[]): VariantPool[] {
    if (!pool) return [];
    const slots = Array.isArray(pool.slots) ? pool.slots : [];
    const targets = pool.targets ?? {};
    const ids: string[] = variants.map((v) => v.id);
    for (const id of [...Object.keys(targets), ...slots.map((s) => s.variant)]) if (!ids.includes(id)) ids.push(id);
    const byId = new Map(chats.map((c) => [c.id, c]));
    return ids
        .map((id): VariantPool => {
            const own = slots.filter((s) => s.variant === id);
            const count = (st: Slot['state']) => own.filter((s) => s.state === st).length;
            const busy = own.filter((s) => s.state === 'assigned');
            const v = variants.find((x) => x.id === id);
            return {
                active: pool.toolsets === id || (!pool.toolsets && !!v?.active),
                variant: id,
                label: v ? variantLabel(v) : variantLabel({ id: id as Variant['id'], label: id }),
                target: (targets as Record<string, number | undefined>)[id] ?? 0,
                free: count('idle'),
                busy: busy.length,
                starting: count('starting'),
                stopping: count('stopping'),
                others: busy.filter((s) => !s.chat_id).length,
                images: [...new Set(own.map((s) => s.image).filter((i): i is string => !!i))],
                mine: busy
                    .filter((s) => !!s.chat_id)
                    .map((s) => {
                        const chat = byId.get(s.chat_id as string);
                        return {
                            slotId: s.id,
                            chatId: s.chat_id as string,
                            title: chat?.title || s.chat_title || 'Untitled chat',
                            chat,
                            activity: s.activity,
                        };
                    }),
            };
        })
        .filter((p) => p.target > 0 || p.free + p.busy + p.starting + p.stopping > 0);
}

/** Totals over all variants. */
export function poolTotals(list: VariantPool[]) {
    return list.reduce(
        (t, p) => ({
            target: t.target + p.target,
            free: t.free + p.free,
            busy: t.busy + p.busy,
            starting: t.starting + p.starting,
            mine: t.mine + p.mine.length,
        }),
        { target: 0, free: 0, busy: 0, starting: 0, mine: 0 },
    );
}

const ACTIVITY_LABEL: Record<string, string> = {
    idle: 'Idle',
    thinking: 'Thinking',
    writing: 'Writing',
    waiting_approval: 'Waiting for approval',
    starting: 'Starting',
    preparing: 'Preparing',
    compacting: 'Compacting',
};

/** What the agent in a slot is doing ("Running bash", "Thinking"). */
export function activityText(a: SlotActivity | undefined): string {
    if (!a) return 'Idle';
    if (a.kind === 'tool') return a.tool ? `Running ${a.tool}` : 'Running a tool';
    return ACTIVITY_LABEL[a.kind] ?? a.kind;
}

/** Last path part of an image reference, shorter for tight cells ("registry/agwpoc/agw-pi:dev" → "agw-pi:dev"). */
export const shortImage = (image: string) => image.split('/').pop() || image;

export type TariffNow = 'peak' | 'off-peak';

export type ModelRow = {
    id: string;
    name: string;
    provider: string;
    isDefault: boolean;
    /** Context window in tokens; undefined when unknown. */
    window?: number;
    /** Prices per 1 M tokens in the tariff in effect now (off-peak: peak price × factor). */
    input?: number;
    output?: number;
    cacheRead?: number;
    tariff?: TariffNow;
    offpeakFactor?: number;
    /** Peak hours in local time, e.g. "daily 18:30–02:30". */
    peakHours?: string;
    /** Thinking levels the gateway reported for the user's chats on this model (empty: not known yet). */
    levels: string[];
};

const round = (n: number) => Math.round(n * 1e6) / 1e6;

/** Rows of the model table; prices follow the tariff in effect now. */
export function modelRows(models: Model[], chats: Chat[], timeZone?: string, at: Date = new Date()): ModelRow[] {
    const levels = levelsByModel(chats);
    return models.map((m) => {
        const p = m.pricing;
        const tariff: TariffNow | undefined =
            m.tariff && m.peak_now !== undefined ? (m.peak_now ? 'peak' : 'off-peak') : undefined;
        const factor = tariff === 'off-peak' ? m.tariff?.offpeak_factor ?? 1 : 1;
        const peakHours =
            m.tariff && m.tariff.peak_windows_utc?.length
                ? formatPeakWindows(m.tariff.peak_windows_utc, timeZone, at)
                : undefined;
        return {
            id: m.id,
            name: m.name || m.id,
            provider: m.provider,
            isDefault: !!m.default,
            window: m.context_window && m.context_window > 0 ? m.context_window : undefined,
            input: p ? round(p.input * factor) : undefined,
            output: p ? round(p.output * factor) : undefined,
            cacheRead: p ? round(p.cache_read * factor) : undefined,
            tariff,
            offpeakFactor: m.tariff?.offpeak_factor,
            peakHours,
            levels: levels[m.id] ?? [],
        };
    });
}

/** Price per 1 M tokens without rounding away digits: "$0.028", "$1.095", "$2.50"; "–" without one. */
export function formatPrice(v: number | undefined): string {
    if (v === undefined) return '–';
    const r = parseFloat(v.toFixed(4));
    const decimals = (String(r).split('.')[1] ?? '').length;
    return `$${r >= 1 && decimals < 2 ? r.toFixed(2) : String(r)}`;
}

// --- peak hours (port of the gateway's web/src/lib/tariff.ts) ---

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function parseDays(days: string): number[] | undefined {
    const d = days.trim().toLowerCase();
    if (d === 'daily' || d === 'all' || d === '*' || d === 'mon-sun') return [0, 1, 2, 3, 4, 5, 6];
    const out = new Set<number>();
    for (const part of d.split(',').map((p) => p.trim())) {
        const range = part.split('-').map((p) => DAY_KEYS.indexOf(p.slice(0, 3)));
        if (range.some((i) => i < 0) || range.length > 2 || part === '') return undefined;
        const [a, b = a] = range;
        for (let i = a; ; i = (i + 1) % 7) {
            out.add(i);
            if (i === b) break;
        }
    }
    return [...out].sort((x, y) => x - y);
}

function formatDays(set: number[]): string {
    if (set.length === 7) return 'daily';
    if (set.length === 1) return DAY_NAMES[set[0]];
    const inSet = new Set(set);
    const start = set.find((d) => !inSet.has((d + 6) % 7));
    if (start !== undefined) {
        let len = 0;
        while (inSet.has((start + len) % 7)) len++;
        if (len === set.length && len >= 2) return `${DAY_NAMES[start]}–${DAY_NAMES[(start + len - 1) % 7]}`;
    }
    return set.map((d) => DAY_NAMES[d]).join(', ');
}

function tzOffsetMinutes(timeZone: string | undefined, at: Date): number {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).formatToParts(at);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
    return Math.round((asUtc - Math.floor(at.getTime() / 60000) * 60000) / 60000);
}

const toMin = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + (m || 0);
};
const fmtMin = (min: number) => {
    const m = ((min % 1440) + 1440) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/**
 * Peak hours (UTC windows of the tariff) in local time, e.g. "Mon–Fri 03:00–06:00 and 08:00–12:00". The offset applies
 * at `at`; a window that starts on another day in local time shifts its weekdays along. Without `timeZone` the
 * browser's time zone applies.
 */
export function formatPeakWindows(
    windows: { days: string; from: string; to: string }[],
    timeZone?: string,
    at: Date = new Date(),
): string {
    const offset = tzOffsetMinutes(timeZone, at);
    const groups = new Map<string, string[]>();
    for (const w of windows) {
        const from = toMin(w.from) + offset;
        const to = toMin(w.to) + offset;
        const shift = Math.floor(from / 1440);
        const days = parseDays(w.days);
        const label = days ? formatDays(days.map((d) => (((d + shift) % 7) + 7) % 7).sort((a, b) => a - b)) : w.days;
        groups.set(label, [...(groups.get(label) ?? []), `${fmtMin(from)}–${fmtMin(to)}`]);
    }
    return [...groups].map(([days, ranges]) => `${days} ${ranges.join(' and ')}`).join('; ');
}

// --- approvals ---

export const APPROVAL_KIND_LABEL: Record<Approval['kind'], string> = {
    platform_write: 'Platform write',
    artifact_upload: 'File handover',
    internet_access: 'Internet access',
};

/** What an approval is about: the call, the file or the reason for internet access. */
export function approvalSubject(a: Approval): string {
    if (a.kind === 'internet_access') {
        const reason = a.name?.trim();
        return reason && reason !== '(no reason given)' ? reason : 'No reason given';
    }
    return a.name;
}

/** Pending approvals, oldest first (the one waiting longest on top). */
export const sortApprovals = (list: Approval[]) =>
    [...list].filter((a) => a.state === 'pending').sort((a, b) => a.created_at.localeCompare(b.created_at));

// --- reachability ---

export type Tone = 'ok' | 'warn' | 'bad' | 'off';

export type Check = { key: string; label: string; tone: Tone; text: string; detail?: string };

/** "just now", "4 min ago", "2 h ago", "3 d ago". */
export function formatAgo(iso: string, now = Date.now()): string {
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return '';
    const s = Math.max(0, Math.round((now - t) / 1000));
    if (s < 45) return 'just now';
    const min = Math.round(s / 60);
    if (min < 60) return `${min} min ago`;
    const h = Math.round(min / 60);
    if (h < 48) return `${h} h ago`;
    return `${Math.round(h / 24)} d ago`;
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Who is signed in at the gateway: "Test User (test)", the username alone, or the mode. */
export function signedInAs(me: Me | undefined): string {
    if (!me) return 'unknown';
    if (me.mode === 'token') return 'API token (no platform user)';
    const user = me.username || me.sub || 'unknown user';
    return me.name && me.name !== user ? `${me.name} (${user})` : user;
}

/** Gateway row: reachable with round-trip time and the signed-in user, or the error. */
export function gatewayCheck(result: { ms?: number; error?: unknown }, me: Me | undefined): Check {
    if (result.error !== undefined) {
        return { key: 'gateway', label: 'Agent gateway', tone: 'bad', text: `Unreachable: ${errText(result.error)}` };
    }
    return {
        key: 'gateway',
        label: 'Agent gateway',
        tone: 'ok',
        text: `Reachable${result.ms !== undefined ? ` · ${result.ms} ms` : ''} · signed in as ${signedInAs(me)}`,
    };
}

/**
 * Rows for the platform API: reachability, how the agent logs in, and the last token exchange. `error` is the
 * failure of GET /platform; a 404 means the gateway predates the endpoint.
 */
export function platformChecks(
    p: PlatformStatus | undefined,
    error: unknown,
    me: Me | undefined,
    now = Date.now(),
): Check[] {
    if (!p) {
        const old = error instanceof AgentApiError && error.status === 404;
        return [
            {
                key: 'platform',
                label: 'Platform API',
                tone: old ? 'off' : error === undefined ? 'off' : 'bad',
                text: old
                    ? 'Not reported by this gateway version'
                    : error === undefined
                    ? 'Loading …'
                    : `Status unavailable: ${errText(error)}`,
            },
        ];
    }
    if (!p.configured) {
        return [
            {
                key: 'platform',
                label: 'Platform API',
                tone: 'off',
                text: 'Binding off: the agent has no platform tools',
            },
        ];
    }
    const out: Check[] = [];
    const pr = p.probe;
    out.push(
        !pr
            ? { key: 'platform', label: 'Platform API', tone: 'off', text: 'Not checked', detail: p.api_url }
            : pr.reachable
            ? {
                  key: 'platform',
                  label: 'Platform API',
                  tone: 'ok',
                  text: `Reachable · ${pr.latency_ms} ms`,
                  detail: `${p.api_url ?? ''}${pr.http_status ? ` · HTTP ${pr.http_status} without login` : ''}`,
              }
            : {
                  key: 'platform',
                  label: 'Platform API',
                  tone: 'bad',
                  text: `Unreachable${pr.error ? `: ${pr.error}` : ''}`,
                  detail: p.api_url,
              },
    );
    out.push({
        key: 'login',
        label: 'Platform login',
        tone: 'ok',
        text:
            p.login === 'user'
                ? `As the chat's owner · ${signedInAs(me)}`
                : `Shared account${p.account ? ` "${p.account}"` : ''}`,
        detail: p.client_id ? `Keycloak client ${p.client_id}` : undefined,
    });
    const x = p.last_exchange;
    out.push(
        !p.token_exchange
            ? {
                  key: 'exchange',
                  label: 'Token exchange',
                  tone: 'warn',
                  text: 'Off: the platform sees the login token itself, not the agent',
              }
            : !x
            ? {
                  key: 'exchange',
                  label: 'Token exchange',
                  tone: 'off',
                  text: 'No exchange yet',
                  detail: 'Happens at the first platform call of a chat (the gateway keeps it in memory only).',
              }
            : x.ok
            ? {
                  key: 'exchange',
                  label: 'Token exchange',
                  tone: 'ok',
                  text: `Last ok · ${formatAgo(x.at, now)}`,
                  detail: new Date(x.at).toLocaleString('en-GB'),
              }
            : {
                  key: 'exchange',
                  label: 'Token exchange',
                  tone: 'bad',
                  text: `Last failed · ${formatAgo(x.at, now)}`,
                  detail: x.error,
              },
    );
    return out;
}
