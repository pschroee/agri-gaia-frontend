// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

/**
 * Page context (issue #13): the platform page the user is on and the object open or selected there, sent with a
 * message so the agent knows what "this dataset" means. The gateway checks it against the same fixed lists
 * (gateway API.md, *Page context*) and refuses anything else with 400, so everything here is mapped or cleaned
 * before sending. The context only says what the user looks at; it never grants the agent rights.
 */

/** Object kinds, named like the gateway's delegation resources. */
export type ContextKind = 'dataset' | 'model' | 'edge_device';

export type PageContext = {
    /** Page id from the gateway's fixed list. */
    page: string;
    object?: { kind: ContextKind; id: string; name?: string };
};

/** What a platform page publishes as open or selected (usePublishPageSelection). */
export type PageSelection = { kind: ContextKind; id: string | number; name?: string };

type PageDef = { id: string; label: string; re: RegExp; kind?: ContextKind; detail?: RegExp };

/** Platform routes in matching order (fixed paths before their prefixes). */
const PAGES: PageDef[] = [
    { id: 'datasets', label: 'Datasets', re: /^\/($|data(\/|$))/, kind: 'dataset' },
    { id: 'model-training', label: 'Model Training', re: /^\/train(\/|$)/ },
    { id: 'models', label: 'Models', re: /^\/models(\/|$)/, kind: 'model', detail: /^\/models\/([^/]+)\/?$/ },
    { id: 'container-templates', label: 'Container Templates', re: /^\/inference-container-templates(\/|$)/ },
    { id: 'container-registry', label: 'Container Registry', re: /^\/container-images(\/|$)/ },
    { id: 'edge-groups', label: 'Edge Groups', re: /^\/edge-groups(\/|$)/ },
    { id: 'edge-devices', label: 'Edge Devices', re: /^\/edge(\/|$)/, kind: 'edge_device', detail: /^\/edge\/([^/]+)\/?$/ },
    { id: 'applications', label: 'Applications', re: /^\/applications(\/|$)/ },
    { id: 'integrated-services', label: 'Integrated Services', re: /^\/integrated-services(\/|$)/ },
    { id: 'network', label: 'Network', re: /^\/network(\/|$)/ },
    { id: 'licenses', label: 'Licenses', re: /^\/licenses(\/|$)/ },
];

const KIND_LABEL: Record<ContextKind, string> = { dataset: 'Dataset', model: 'Model', edge_device: 'Edge device' };

/** Longest name the gateway accepts (characters). */
export const MAX_CONTEXT_NAME = 200;

/** The platform page of a route; undefined for pages without context (the agent page, debug pages). */
export function pageOf(pathname: string): { id: string; label: string } | undefined {
    const p = PAGES.find((d) => d.re.test(pathname));
    return p && { id: p.id, label: p.label };
}

/** Canonical integer id as the gateway wants it (no sign, no leading zero, at most 18 digits). */
export function canonicalId(id: string | number | undefined): string | undefined {
    const s = typeof id === 'number' ? (Number.isSafeInteger(id) && id >= 0 ? String(id) : '') : (id ?? '').trim();
    return /^(0|[1-9][0-9]{0,17})$/.test(s) ? s : undefined;
}

/**
 * Name cleaned for the gateway: control and formatting characters (line breaks, zero-width, bidi) become spaces,
 * runs of spaces collapse, at most MAX_CONTEXT_NAME characters (ellipsis). Empty: undefined.
 */
export function cleanName(name: string | undefined): string | undefined {
    if (!name) return undefined;
    // \p{Cc} control, \p{Cf} format (zero-width, bidi), \p{Zl}/\p{Zp} line and paragraph separators
    const s = name
        .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!s) return undefined;
    const chars = Array.from(s);
    return chars.length > MAX_CONTEXT_NAME ? `${chars.slice(0, MAX_CONTEXT_NAME - 1).join('')}…` : s;
}

/**
 * Context of a route: the page, and the object from a detail route (`/models/7`) or from what the page published
 * as open or selected. A selection of another kind than the page's, or naming another id than the route, is
 * ignored; the name only comes from a selection that matches the object.
 */
export function pageContextOf(pathname: string, selection?: PageSelection): PageContext | undefined {
    const def = PAGES.find((d) => d.re.test(pathname));
    if (!def) return undefined;
    const ctx: PageContext = { page: def.id };
    if (!def.kind) return ctx;
    const routeId = def.detail ? canonicalId(pathname.match(def.detail)?.[1]) : undefined;
    const sel = selection && selection.kind === def.kind ? selection : undefined;
    const selId = canonicalId(sel?.id);
    if (def.detail && pathname.match(def.detail) && !routeId) return ctx; // detail route with an odd id
    const id = routeId ?? selId;
    if (!id) return ctx;
    const name = sel && selId === id ? cleanName(sel.name) : undefined;
    ctx.object = name ? { kind: def.kind, id, name } : { kind: def.kind, id };
    return ctx;
}

/** Short label of a context: the object's name (or "Dataset 42"), else the page. */
export function contextLabel(ctx: PageContext): string {
    const o = ctx.object;
    if (o) return o.name || `${KIND_LABEL[o.kind] ?? o.kind} ${o.id}`;
    return PAGES.find((p) => p.id === ctx.page)?.label ?? ctx.page;
}

/** Longer description for tooltips: "Dataset 42 · smarttail · on Datasets". */
export function contextTitle(ctx: PageContext): string {
    const page = PAGES.find((p) => p.id === ctx.page)?.label ?? ctx.page;
    const o = ctx.object;
    if (!o) return `Page: ${page}`;
    return `${KIND_LABEL[o.kind] ?? o.kind} ${o.id}${o.name ? ` · ${o.name}` : ''} · on ${page}`;
}

/** Identity of a context (page and object id; a renamed object stays the same). */
export function contextKey(ctx: PageContext | undefined): string {
    if (!ctx) return '';
    return ctx.object ? `${ctx.page}:${ctx.object.kind}:${ctx.object.id}` : ctx.page;
}

/**
 * The context chip at the input: shown unless the user removed exactly this context. A new page or object brings it
 * back; removal is not remembered beyond the current context.
 */
export function visibleContext(ctx: PageContext | undefined, dismissed: string | undefined): PageContext | undefined {
    if (!ctx) return undefined;
    return dismissed !== undefined && dismissed === contextKey(ctx) ? undefined : ctx;
}

/** Is this a page context the frontend can show (structured data from the gateway, never parsed from text)? */
export function isPageContext(v: unknown): v is PageContext {
    if (!v || typeof v !== 'object') return false;
    const c = v as PageContext;
    if (typeof c.page !== 'string' || !c.page) return false;
    if (c.object === undefined || c.object === null) return true;
    return typeof c.object === 'object' && typeof c.object.kind === 'string' && typeof c.object.id === 'string';
}
