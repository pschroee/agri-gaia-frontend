// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import { searchHintOf } from './transcript';

describe('the hint of a search', () => {
    it('is read from the metadata of the message, not from its text', () => {
        expect(searchHintOf([{ kind: 'user', search_hint: { search_id: 's1' } }])).toBe('s1');
        expect(searchHintOf([{ kind: 'user' }])).toBeUndefined();
        expect(searchHintOf(undefined)).toBeUndefined();
    });
});
