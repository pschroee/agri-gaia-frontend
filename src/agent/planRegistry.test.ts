// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import { countReducer } from './planRegistry';

describe('countReducer', () => {
    it('keeps a plan shown until every card of it is gone', () => {
        let c = new Map<string, number>();
        c = countReducer(c, 'p1', 1);
        c = countReducer(c, 'p1', 1);
        c = countReducer(c, 'p1', -1);
        expect(c.has('p1')).toBe(true);
        c = countReducer(c, 'p1', -1);
        expect(c.has('p1')).toBe(false);
        expect(countReducer(c, 'p2', -1).has('p2')).toBe(false);
    });
});
