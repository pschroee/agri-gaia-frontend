// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import type { DelegationRule, SocketCall, Variant } from './types';

/** Effect class of a platform call, as in the prototype (read, write, compute, irreversible). */
export type Effect = 'read' | 'write' | 'compute' | 'irreversible';

export const EFFECT_LABEL: Record<Effect, string> = {
    read: 'Read',
    write: 'Write',
    compute: 'Compute',
    irreversible: 'Irreversible',
};

/** Labels for the gateway's connection variants, more descriptive than the gateway's own. */
const VARIANT_LABEL: Record<string, string> = {
    cli: 'Command line (bash, artifacts, subagents)',
    mcp: 'MCP (MCP tools only, read/write/ls, no bash)',
    api: 'REST API (platform_http only, no bash, no file tools)',
    both: 'MCP and command line',
};

/** Label of a connection variant; unknown ids keep the gateway's text. */
export function variantLabel(v: Pick<Variant, 'id' | 'label'>): string {
    return VARIANT_LABEL[v.id] ?? v.label;
}

/** Splits the detail of a platform call ("METHOD /path?query") into method and path. */
export function splitCall(detail: string): { method: string; path: string } {
    const m = /^([A-Z]+)\s+(\S+)/.exec(detail.trim());
    if (!m) return { method: '', path: detail.trim() };
    return { method: m[1], path: m[2] };
}

/**
 * Derives the effect from method and path: GET reads, DELETE is irreversible, starting a training
 * container uses compute, every other method writes.
 */
export function effectOf(method: string, path: string): Effect | undefined {
    const p = path.split('?')[0];
    switch (method.toUpperCase()) {
        case 'GET':
        case 'HEAD':
            return 'read';
        case 'DELETE':
            return 'irreversible';
        case 'POST':
            if (/^\/train\/containers\/[^/]+\/run\/?$/.test(p)) return 'compute';
            return 'write';
        case 'PUT':
        case 'PATCH':
            return 'write';
        default:
            return undefined;
    }
}

/** Outcome of a platform call, from the result column of the socket log. */
export type Outcome = 'ok' | 'error' | 'blocked' | 'rejected' | 'refused' | 'logged';

export const OUTCOME_LABEL: Record<Outcome, string> = {
    ok: 'ok',
    error: 'error',
    blocked: 'blocked',
    rejected: 'rejected by you',
    refused: 'refused',
    logged: 'violation, logged only',
};

export function outcomeOf(result: string): Outcome {
    const r = result.toLowerCase();
    if (r.startsWith('violation blocked')) return 'blocked';
    if (r.includes('violation, logged only')) return 'logged';
    if (r.startsWith('rejected')) return 'rejected';
    if (r.startsWith('refused') || r.startsWith('not configured')) return 'refused';
    if (r.startsWith('ok')) return 'ok';
    return 'error';
}

/** Reason after the colon of a refused or blocked call (gateway text). */
export function outcomeReason(result: string): string | undefined {
    const i = result.indexOf(':');
    return i >= 0 ? result.slice(i + 1).trim() : undefined;
}

export const isPlatformCall = (c: SocketCall) => c.op === 'platform';
export const isBlocked = (c: SocketCall) => /violation/i.test(c.result ?? '');

/** Platform section for the context chip, derived from the route. */
export function sectionOf(pathname: string): string | undefined {
    const sections: [RegExp, string][] = [
        [/^\/($|data)/, 'Datasets'],
        [/^\/train/, 'Model Training'],
        [/^\/models/, 'Models'],
        [/^\/inference-container-templates/, 'Container Templates'],
        [/^\/container-images/, 'Container Registry'],
        [/^\/edge-groups/, 'Edge Groups'],
        [/^\/edge/, 'Edge Devices'],
        [/^\/applications/, 'Applications'],
        [/^\/integrated-services/, 'Integrated Services'],
        [/^\/network/, 'Network'],
        [/^\/licenses/, 'Licenses'],
    ];
    return sections.find(([re]) => re.test(pathname))?.[1];
}

export function formatMs(ms: number | undefined): string | undefined {
    if (ms === undefined || ms < 0 || Number.isNaN(ms)) return undefined;
    if (ms < 1000) return `${Math.round(ms)} ms`;
    const s = ms / 1000;
    if (s < 60) return `${s.toFixed(1)} s`;
    const m = Math.floor(s / 60);
    return `${m} min ${Math.round(s % 60)} s`;
}

const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
const timeSecFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long' });

export const formatClock = (iso: string, seconds = false) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : (seconds ? timeSecFmt : timeFmt).format(d);
};

export const isToday = (iso: string, now = new Date()) => {
    const d = new Date(iso);
    return d.toDateString() === now.toDateString();
};

/** "today, 09:06", "yesterday", "4 September". */
export function formatRelativeDay(iso: string, now = new Date()): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    if (isToday(iso, now)) return `today, ${timeFmt.format(d)}`;
    const y = new Date(now);
    y.setDate(now.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return 'yesterday';
    return dayFmt.format(d);
}

/** Remaining validity of a delegation, e.g. "expires in 7 h 12 min" or "expired". */
export function formatExpiry(iso: string | undefined, now = Date.now()): string {
    if (!iso) return 'no expiry';
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return 'no expiry';
    const mins = Math.round((t - now) / 60000);
    if (mins <= 0) return 'expired';
    if (mins < 60) return `expires in ${mins} min`;
    return `expires in ${Math.floor(mins / 60)} h ${mins % 60} min`;
}

const ACTION_LABEL: Record<string, string> = {
    read: 'read',
    create: 'create',
    update: 'update',
    delete: 'delete',
    run: 'run',
};

/** "read dataset (all)", "update dataset (own)", "create training". */
export function formatRule(r: DelegationRule): string {
    const resource = r.resource.replace(/_/g, ' ');
    const ids = r.ids?.length ? ` (${r.ids.map((i) => (i === '*' ? 'all' : i)).join(', ')})` : '';
    return `${ACTION_LABEL[r.action] ?? r.action} ${resource}${ids}`;
}

/** Groups rules with the same action and ids: "read: dataset, model, … (all)". */
export function summarizeRules(rules: DelegationRule[]): string[] {
    const groups = new Map<string, string[]>();
    for (const r of rules) {
        const ids = r.ids?.length ? ` (${r.ids.map((i) => (i === '*' ? 'all' : i)).join(', ')})` : '';
        const key = `${ACTION_LABEL[r.action] ?? r.action}|${ids}`;
        groups.set(key, [...(groups.get(key) ?? []), r.resource.replace(/_/g, ' ')]);
    }
    return Array.from(groups.entries()).map(([key, resources]) => {
        const [action, ids] = key.split('|');
        return `${action} ${resources.join(', ')}${ids}`;
    });
}
