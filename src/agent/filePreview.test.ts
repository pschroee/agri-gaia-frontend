// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import { inlineUrl, previewOf } from './filePreview';

describe('previewOf', () => {
    it('trusts the gateway when it sends a kind', () => {
        expect(previewOf({ name: 'plot.png', preview: 'image' })).toBe('image');
        expect(previewOf({ name: 'page.html', preview: 'text' })).toBe('text');
        expect(previewOf({ name: 'data.csv', preview: 'none' })).toBe('none');
    });

    it('falls back to the extension without a kind from the gateway', () => {
        expect(previewOf({ name: 'a.png' })).toBe('image');
        expect(previewOf({ name: 'A.JPG' })).toBe('image');
        expect(previewOf({ name: 'a.pdf' })).toBe('pdf');
        expect(previewOf({ name: 'a.csv' })).toBe('table');
        expect(previewOf({ name: 'a.tsv' })).toBe('table');
        expect(previewOf({ name: 'a.json' })).toBe('text');
        expect(previewOf({ name: 'a.md' })).toBe('text');
    });

    it('shows HTML and SVG only as text', () => {
        expect(previewOf({ name: 'page.html' })).toBe('text');
        expect(previewOf({ name: 'page.htm' })).toBe('text');
        expect(previewOf({ name: 'logo.svg' })).toBe('text');
        expect(previewOf({ name: 'LOGO.SVG' })).toBe('text');
    });

    it('answers none for unknown types and names without extension', () => {
        expect(previewOf({ name: 'archive.zip' })).toBe('none');
        expect(previewOf({ name: 'noext' })).toBe('none');
    });

    it('ignores an unknown kind from the gateway and uses the extension', () => {
        expect(previewOf({ name: 'a.txt', preview: 'html' })).toBe('text');
    });
});

describe('inlineUrl', () => {
    it('adds inline=1 to the download address', () => {
        const url = inlineUrl('c1', 'a b.png', 'output');
        expect(url).toContain('/artifacts/a%20b.png?kind=output');
        expect(url.endsWith('&inline=1')).toBe(true);
    });
});
