// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import { copyText } from './clipboard';

function fakeDocument(copyWorks: boolean) {
    const copied: string[] = [];
    let removed = 0;
    const doc = {
        body: { appendChild: (n: unknown) => n },
        createElement: () => {
            const area = {
                value: '',
                style: {} as Record<string, string>,
                setAttribute: () => undefined,
                select: () => undefined,
                remove: () => {
                    removed++;
                },
            };
            last = area;
            return area;
        },
        execCommand: () => {
            if (copyWorks) copied.push(last.value);
            return copyWorks;
        },
    };
    let last = { value: '' };
    return { doc: doc as never, copied, removed: () => removed };
}

describe('copyText', () => {
    it('uses the Clipboard API', async () => {
        const written: string[] = [];
        const ok = await copyText('**a**', { clipboard: { writeText: async (t) => void written.push(t) } });
        expect(ok).toBe(true);
        expect(written).toEqual(['**a**']);
    });

    it('falls back to a hidden field when the API refuses, and cleans up', async () => {
        const f = fakeDocument(true);
        const ok = await copyText('text', {
            clipboard: { writeText: () => Promise.reject(new Error('denied')) },
            document: f.doc,
        });
        expect(ok).toBe(true);
        expect(f.copied).toEqual(['text']);
        expect(f.removed()).toBe(1);
    });

    it('reports failure when nothing works', async () => {
        expect(await copyText('x', { document: fakeDocument(false).doc })).toBe(false);
        expect(await copyText('x', {})).toBe(false);
    });
});
