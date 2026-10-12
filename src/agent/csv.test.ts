// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import { parseDelimited } from './csv';

describe('parseDelimited', () => {
    it('reads plain CSV records', () => {
        expect(parseDelimited('a,b\n1,2\n', ',', 10)).toEqual({ rows: [['a', 'b'], ['1', '2']], total: 2 });
    });

    it('keeps separators, doubled quotes and line breaks inside quoted fields', () => {
        expect(parseDelimited('"x, y","say ""hi"""\n', ',', 10)).toEqual({ rows: [['x, y', 'say "hi"']], total: 1 });
        expect(parseDelimited('"l1\nl2",z\r\n', ',', 10)).toEqual({ rows: [['l1\nl2', 'z']], total: 1 });
    });

    it('reads TSV with a tab and without a final line break', () => {
        expect(parseDelimited('a\tb\n1\t2', '\t', 10)).toEqual({ rows: [['a', 'b'], ['1', '2']], total: 2 });
    });

    it('handles CRLF line ends and empty input', () => {
        expect(parseDelimited('a,b\r\n1,2\r\n', ',', 10).total).toBe(2);
        expect(parseDelimited('', ',', 10)).toEqual({ rows: [], total: 0 });
    });

    it('skips a leading byte order mark', () => {
        expect(parseDelimited('﻿name,n\n', ',', 10).rows[0]).toEqual(['name', 'n']);
    });

    it('cuts the rows at maxRows but counts all of them', () => {
        const text = Array.from({ length: 600 }, (_, i) => `${i},x`).join('\n');
        const { rows, total } = parseDelimited(text, ',', 500);
        expect(rows).toHaveLength(500);
        expect(total).toBe(600);
        expect(rows[499]).toEqual(['499', 'x']);
    });
});
