// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import { chatTitle } from './format';

describe('chatTitle', () => {
    it('keeps the full title, however long', () => {
        const long = 'Supercalifragilisticexpialidocious'.repeat(6);
        expect(chatTitle({ title: long })).toBe(long);
    });

    it('names a chat without a title "Untitled chat"', () => {
        expect(chatTitle({ title: '' })).toBe('Untitled chat');
        expect(chatTitle({ title: '   ' })).toBe('Untitled chat');
        expect(chatTitle({})).toBe('Untitled chat');
        expect(chatTitle(undefined)).toBe('Untitled chat');
    });
});
