// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

/**
 * Links from the agent's answers to platform pages (issue #118, L1). The gateway tells the agent in every binding to
 * write relative paths (`/models/12`); the panel and the platform share one origin, so such a link opens the page in
 * the same tab, without a reload and without losing the chat panel. What is not a platform page stays plain text.
 * Pure, so the rules can be unit-tested.
 */

import { pageOf } from './pageContext';

/** Splits at the first occurrence of `sep`; without one, the second part is empty. */
function splitOnce(s: string, sep: string): [string, string] {
    const i = s.indexOf(sep);
    return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)];
}

/**
 * The platform path a link target names, or undefined when it is not a platform page (issue #118, DL1.5). Allowed
 * are the paths of the pages in `pageOf` — among them the detail pages `/models/<id>` and `/edge/<id>` — plus at
 * most one search parameter `dataset=<digits>`, which the datasets page reads. An absolute address of the same
 * origin loses its origin first and is checked the same way. Everything else stays without a link: another origin
 * (`//host`), another scheme (`javascript:`), the agent's own pages (`/agent…`, `/ai-agent`, which `pageOf` does not
 * know) and unknown paths. The safe failure is no link.
 */
export function platformPath(href: string, origin?: string): string | undefined {
    const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : undefined);
    let rest = href.trim();
    if (base && rest.startsWith(base)) {
        rest = rest.slice(base.length); // absolute address of the same origin: keep the path
    } else if (/^[a-z][a-z0-9+.-]*:/i.test(rest) || rest.startsWith('//')) {
        return undefined; // another scheme or another origin
    }
    if (!rest.startsWith('/') || rest.startsWith('//')) return undefined;
    const [pathAndQuery] = splitOnce(rest, '#');
    const [pathname, query] = splitOnce(pathAndQuery, '?');
    // No dot segments and no empty segments: they only shift the path after the check (a click would land elsewhere).
    if (pathname.includes('//') || pathname.split('/').some((s) => s === '.' || s === '..')) return undefined;
    if (!pageOf(pathname)) return undefined;
    const dataset = new URLSearchParams(query).get('dataset');
    return /^[0-9]+$/.test(dataset ?? '') ? `${pathname}?dataset=${dataset}` : pathname;
}

/**
 * The dataset id from a query string when it is one the list knows (issue #118, DL1.4): the datasets page selects
 * the dataset named in `/data?dataset=<id>`. Only digits count as an id, and only one that is in `ids`; everything
 * else (another value, an unknown or already deleted dataset): undefined.
 */
export function datasetFromQuery(search: string, ids: readonly number[]): number | undefined {
    const raw = new URLSearchParams(search).get('dataset');
    if (!raw || !/^[0-9]+$/.test(raw)) return undefined;
    const id = Number(raw);
    return ids.includes(id) ? id : undefined;
}
