// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// State of an overview (filters, sort, page) in the address, shared by the overview tabs (issues #222, #223).
// Names: period, sort, order, page (from 0), size, and one parameter per filter key. Defaults are not written;
// parameters of other owners (tab, chat, run, ...) stay as they are.

import type { Period } from '../../activity';
import type { OverviewSort } from './OverviewTable';

export type OverviewState = {
    period: Period;
    filters: Record<string, string>;
    sort: OverviewSort;
    /** From 0. */
    page: number;
    size: number;
};

const PERIOD_VALUES: Period[] = ['today', '7d', '30d', 'all'];
const MAX_SIZE = 500;

const OWN_KEYS = ['period', 'sort', 'order', 'page', 'size'];

function wholeNumber(raw: string | null, min: number, max: number): number | undefined {
    if (raw === null || !/^[0-9]{1,6}$/.test(raw)) return undefined;
    const n = Number(raw);
    return n >= min && n <= max ? n : undefined;
}

/** The state an address describes; whatever is missing or invalid falls back to the default. */
export function readOverview(p: URLSearchParams, filterKeys: string[], defaults: OverviewState): OverviewState {
    const period = p.get('period') as Period | null;
    const filters: Record<string, string> = {};
    for (const k of filterKeys) {
        const v = p.get(k);
        filters[k] = v === null ? defaults.filters[k] ?? '' : v;
    }
    const by = p.get('sort');
    const order = p.get('order');
    const sort: OverviewSort =
        by && (order === 'asc' || order === 'desc') ? { by, order } : defaults.sort;
    return {
        period: period && PERIOD_VALUES.includes(period) ? period : defaults.period,
        filters,
        sort,
        page: wholeNumber(p.get('page'), 0, 100000) ?? defaults.page,
        size: wholeNumber(p.get('size'), 1, MAX_SIZE) ?? defaults.size,
    };
}

const sameSort = (a: OverviewSort, b: OverviewSort): boolean => a?.by === b?.by && a?.order === b?.order;

/** True when the state is the default one (nothing to reset). */
export const isDefault = (s: OverviewState, d: OverviewState): boolean => {
    const keys = new Set([...Object.keys(s.filters), ...Object.keys(d.filters)]);
    for (const k of keys) if ((s.filters[k] ?? '') !== (d.filters[k] ?? '')) return false;
    return s.period === d.period && sameSort(s.sort, d.sort) && s.page === d.page && s.size === d.size;
};

/** A copy of `p` with the state written into it; values equal to the default are removed. */
export function writeOverview(p: URLSearchParams, s: OverviewState, defaults: OverviewState): URLSearchParams {
    const out = new URLSearchParams(p);
    for (const k of [...OWN_KEYS, ...Object.keys(s.filters), ...Object.keys(defaults.filters)]) out.delete(k);
    if (s.period !== defaults.period) out.set('period', s.period);
    for (const [k, v] of Object.entries(s.filters)) {
        if (v !== (defaults.filters[k] ?? '')) out.set(k, v);
    }
    if (!sameSort(s.sort, defaults.sort) && s.sort) {
        out.set('sort', s.sort.by);
        out.set('order', s.sort.order);
    }
    if (s.page !== defaults.page) out.set('page', String(s.page));
    if (s.size !== defaults.size) out.set('size', String(s.size));
    return out;
}
