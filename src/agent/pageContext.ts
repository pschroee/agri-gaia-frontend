// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

/**
 * Page context (issue #13): the platform page the user is on and the objects open or selected there, sent with a
 * message so the agent knows what "this dataset" or "the selected ones" means. The page goes with every message
 * silently; the input shows a chip only for selected objects (issue #45). The gateway checks the context against the
 * same fixed lists (gateway API.md, *Page context*) and refuses anything else with 400, so everything here is mapped
 * or cleaned before sending. The context only says what the user looks at; it never grants the agent rights.
 */

/** Object kinds, named like the gateway's delegation resources. */
export type ContextKind = 'dataset' | 'model' | 'edge_device';

export type ContextObject = { kind: ContextKind; id: string; name?: string };

export type PageContext = {
    /** Page id from the gateway's fixed list. */
    page: string;
    /** The single object (the form before issue #45; gateways set it too when there is exactly one). */
    object?: ContextObject;
    /** All open or selected objects (issue #45). Read both through contextObjects. */
    objects?: ContextObject[];
};

/** What a platform page publishes as open or selected (usePublishPageSelection), one entry per object. */
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
const KIND_PLURAL: Record<ContextKind, string> = { dataset: 'datasets', model: 'models', edge_device: 'edge devices' };

/** Longest name the gateway accepts (characters). */
export const MAX_CONTEXT_NAME = 200;

/** Most objects the gateway accepts in one context. */
export const MAX_CONTEXT_OBJECTS = 50;

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
 * Context of a route: the page, and the objects from a detail route (`/models/7`) or from what the page published
 * as open or selected (several on the datasets page). On a detail route the route's id decides, and a selection
 * only lends its name when it names the same object. Selections of another kind than the page's or with an odd id
 * are ignored, the same id counts once, and at most MAX_CONTEXT_OBJECTS go along.
 */
export function pageContextOf(
    pathname: string,
    selection?: PageSelection | readonly PageSelection[],
): PageContext | undefined {
    const def = PAGES.find((d) => d.re.test(pathname));
    if (!def) return undefined;
    const ctx: PageContext = { page: def.id };
    const kind = def.kind;
    if (!kind) return ctx;
    const list = (Array.isArray(selection) ? selection : selection ? [selection] : []) as readonly PageSelection[];
    const sels = list.filter((s) => s.kind === kind);
    const detail = def.detail && pathname.match(def.detail);
    if (detail) {
        const id = canonicalId(detail[1]);
        if (!id) return ctx; // detail route with an odd id
        const name = cleanName(sels.find((s) => canonicalId(s.id) === id)?.name);
        ctx.objects = [name ? { kind, id, name } : { kind, id }];
        return ctx;
    }
    const objects: ContextObject[] = [];
    const seen = new Set<string>();
    for (const s of sels) {
        const id = canonicalId(s.id);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const name = cleanName(s.name);
        objects.push(name ? { kind, id, name } : { kind, id });
        if (objects.length === MAX_CONTEXT_OBJECTS) break;
    }
    if (objects.length) ctx.objects = objects;
    return ctx;
}

/** The objects of a context: `objects`, or the single `object` of an older gateway or stored row. */
export function contextObjects(ctx: PageContext | undefined): ContextObject[] {
    if (!ctx) return [];
    if (ctx.objects?.length) return ctx.objects;
    return ctx.object ? [ctx.object] : [];
}

/**
 * The context as the gateway takes it: one object as `object` (understood by every gateway since issue #13),
 * several as `objects` (gateways since issue #45), none without either.
 */
export function wireContext(ctx: PageContext): PageContext {
    const objs = contextObjects(ctx);
    if (objs.length === 0) return { page: ctx.page };
    if (objs.length === 1) return { page: ctx.page, object: objs[0] };
    return { page: ctx.page, objects: objs };
}

/** The context without its objects: only the page (what goes along after the chip's cross). */
export function pageOnly(ctx: PageContext): PageContext {
    return { page: ctx.page };
}

function objectLabel(o: ContextObject): string {
    return o.name || `${KIND_LABEL[o.kind] ?? o.kind} ${o.id}`;
}

function pageLabel(ctx: PageContext): string {
    return PAGES.find((p) => p.id === ctx.page)?.label ?? ctx.page;
}

/** "2 datasets", "1 model". */
function countLabel(objs: ContextObject[]): string {
    const kind = objs[0].kind;
    const plural = KIND_PLURAL[kind] ?? `${kind}s`;
    return objs.length === 1 ? `1 ${(KIND_LABEL[kind] ?? kind).toLowerCase()}` : `${objs.length} ${plural}`;
}

/** Short label of a context: the object's name (or "Dataset 42"), "2 datasets" for several, else the page. */
export function contextLabel(ctx: PageContext): string {
    const objs = contextObjects(ctx);
    if (objs.length === 1) return objectLabel(objs[0]);
    if (objs.length > 1) return countLabel(objs);
    return pageLabel(ctx);
}

/** Longer description for tooltips: "Dataset 42 · smarttail · on Datasets", several objects one per line. */
export function contextTitle(ctx: PageContext): string {
    const page = pageLabel(ctx);
    const objs = contextObjects(ctx);
    if (objs.length === 0) return `Page: ${page}`;
    if (objs.length === 1) {
        const o = objs[0];
        return `${KIND_LABEL[o.kind] ?? o.kind} ${o.id}${o.name ? ` · ${o.name}` : ''} · on ${page}`;
    }
    return `${countLabel(objs)} on ${page}:\n${objs.map((o) => `${objectLabel(o)}${o.name ? ` (${o.id})` : ''}`).join('\n')}`;
}

/** Identity of a context (page and object ids; a renamed object stays the same). */
export function contextKey(ctx: PageContext | undefined): string {
    if (!ctx) return '';
    const objs = contextObjects(ctx);
    if (!objs.length) return ctx.page;
    return `${ctx.page}:${objs[0].kind}:${objs
        .map((o) => o.id)
        .sort()
        .join(',')}`;
}

/** Does the context name objects, i.e. does the input show a chip for it? The page alone never does. */
export function hasSelection(ctx: PageContext | undefined): boolean {
    return contextObjects(ctx).length > 0;
}

/**
 * The context that goes with the next message (issue #45): the page always; the objects unless the user removed
 * exactly this selection with the chip's cross (`dismissed` is its contextKey). A new selection brings them back,
 * and after sending the removal ends (it applies to one message).
 */
export function visibleContext(ctx: PageContext | undefined, dismissed: string | undefined): PageContext | undefined {
    if (!ctx) return undefined;
    if (!hasSelection(ctx)) return ctx;
    return dismissed !== undefined && dismissed === contextKey(ctx) ? pageOnly(ctx) : ctx;
}

/** Placeholder of the input: neutral, or naming the selection that goes with the message. */
export function inputPlaceholder(ctx: PageContext | undefined, fallback = 'Message Agent …'): string {
    const objs = contextObjects(ctx);
    if (objs.length === 0) return fallback;
    const kind = objs[0].kind;
    if (objs.length === 1) return `Ask about this ${(KIND_LABEL[kind] ?? kind).toLowerCase()} …`;
    return `Ask about the ${objs.length} selected ${KIND_PLURAL[kind] ?? `${kind}s`} …`;
}

function isContextObject(v: unknown): v is ContextObject {
    if (!v || typeof v !== 'object') return false;
    const o = v as ContextObject;
    return typeof o.kind === 'string' && typeof o.id === 'string' && (o.name === undefined || typeof o.name === 'string');
}

/** Is this a page context the frontend can show (structured data from the gateway, never parsed from text)? */
export function isPageContext(v: unknown): v is PageContext {
    if (!v || typeof v !== 'object') return false;
    const c = v as PageContext;
    if (typeof c.page !== 'string' || !c.page) return false;
    if (c.object !== undefined && c.object !== null && !isContextObject(c.object)) return false;
    if (c.objects !== undefined && c.objects !== null && !(Array.isArray(c.objects) && c.objects.every(isContextObject)))
        return false;
    return true;
}
