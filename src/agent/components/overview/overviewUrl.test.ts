// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import { isDefault, readOverview, writeOverview } from './overviewUrl';
import type { OverviewState } from './overviewUrl';

const defaults: OverviewState = { period: 'all', filters: { status: '', kind: '', in_chat: '' }, sort: undefined, page: 0, size: 25 };
const keys = ['status', 'kind', 'in_chat'];

describe('overview address', () => {
    it('writes nothing for the default state', () => {
        expect(writeOverview(new URLSearchParams(), defaults, defaults).toString()).toBe('');
        expect(isDefault(defaults, defaults)).toBe(true);
    });

    it('round-trips a state', () => {
        const s: OverviewState = {
            period: '7d',
            filters: { status: 'running', kind: '', in_chat: 'c1' },
            sort: { by: 'duration', order: 'desc' },
            page: 2,
            size: 50,
        };
        const p = writeOverview(new URLSearchParams(), s, defaults);
        expect(p.get('period')).toBe('7d');
        expect(p.get('status')).toBe('running');
        expect(p.has('kind')).toBe(false);
        expect(p.get('sort')).toBe('duration');
        expect(p.get('order')).toBe('desc');
        expect(p.get('page')).toBe('2');
        expect(p.get('size')).toBe('50');
        expect(readOverview(p, keys, defaults)).toEqual(s);
        expect(isDefault(s, defaults)).toBe(false);
    });

    it('keeps parameters of other owners and removes values back at the default', () => {
        const start = new URLSearchParams('tab=experiments&chat=c1&run=s1&status=running&page=3');
        const out = writeOverview(start, defaults, defaults);
        expect(out.get('tab')).toBe('experiments');
        expect(out.get('chat')).toBe('c1');
        expect(out.get('run')).toBe('s1');
        expect(out.has('status')).toBe(false);
        expect(out.has('page')).toBe(false);
    });

    it('falls back to the default for invalid values', () => {
        const p = new URLSearchParams('period=year&sort=started&order=sideways&page=-1&size=0');
        expect(readOverview(p, keys, defaults)).toEqual(defaults);
        expect(readOverview(new URLSearchParams('page=abc&size=99999999'), keys, defaults)).toEqual(defaults);
    });

    it('treats a sort without a valid order as the default', () => {
        const d: OverviewState = { ...defaults, sort: { by: 'started', order: 'desc' } };
        expect(readOverview(new URLSearchParams('sort=title'), keys, d).sort).toEqual({ by: 'started', order: 'desc' });
    });

    it('writes an empty filter value when the default is not empty', () => {
        const d: OverviewState = { ...defaults, filters: { ...defaults.filters, status: 'open' } };
        const s: OverviewState = { ...d, filters: { ...d.filters, status: '' } };
        const p = writeOverview(new URLSearchParams(), s, d);
        expect(p.has('status')).toBe(true);
        expect(readOverview(p, keys, d).filters.status).toBe('');
    });
});
