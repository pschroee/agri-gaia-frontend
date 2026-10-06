// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import { imageSource, messageImageKey, parseMarkdownImage, sandboxImagePath } from './images';

describe('sandboxImagePath', () => {
    it('accepts paths under /workspace, /tmp and /home/agent; relative ones start at /workspace', () => {
        expect(sandboxImagePath('/workspace/plot.png')).toBe('/workspace/plot.png');
        expect(sandboxImagePath('plot.png')).toBe('/workspace/plot.png');
        expect(sandboxImagePath('./out/a.png')).toBe('/workspace/out/a.png');
        expect(sandboxImagePath('/tmp/x.gif')).toBe('/tmp/x.gif');
        expect(sandboxImagePath('/home/agent/b.webp')).toBe('/home/agent/b.webp');
        expect(sandboxImagePath('/workspace/a/../b.png')).toBe('/workspace/b.png');
        expect(sandboxImagePath('file:///workspace/plot.png')).toBe('/workspace/plot.png');
        expect(sandboxImagePath('/workspace//double//x.png')).toBe('/workspace/double/x.png');
    });

    it('decodes percent encoding, keeps broken sequences', () => {
        expect(sandboxImagePath('my%20image.png')).toBe('/workspace/my image.png');
        expect(sandboxImagePath('/workspace/%C3%A4.png')).toBe('/workspace/ä.png');
        expect(sandboxImagePath('/workspace/%E0%A4%A.png')).toBe('/workspace/%E0%A4%A.png');
    });

    it('rejects foreign addresses, other locations and escapes', () => {
        for (const src of [
            '',
            'https://attacker.example/p.png',
            'http://x/y.png',
            'HTTPS://X/Y.PNG',
            '//attacker.example/p.png',
            'data:image/png;base64,AAAA',
            'javascript:alert(1)',
            'blob:http://x/1',
            'file://attacker/x.png',
            '/etc/passwd',
            '/agent/config/models.json',
            '/workspace',
            '/workspace/',
            '../etc/passwd',
            '/workspace/../../etc/passwd',
            '/workspacex/a.png',
            '/workspace/a\u0000.png',
            '%2F%2Fattacker.example/p.png',
            'a'.repeat(1100),
        ]) {
            expect(sandboxImagePath(src), src).toBeUndefined();
        }
    });
});

describe('imageSource', () => {
    const ctx = { chatId: 'c 1', msgId: 'resp-1' };

    it("resolves local paths to the gateway's image endpoint", () => {
        expect(imageSource('plot.png', ctx)).toEqual({
            kind: 'sandbox',
            path: '/workspace/plot.png',
            url: '/agent/api/chats/c%201/images?path=%2Fworkspace%2Fplot.png&msg=resp-1',
        });
    });

    it('holds local images back until the answer is finished (no ID)', () => {
        expect(imageSource('/workspace/plot.png', { chatId: 'c' })).toEqual({
            kind: 'pending',
            path: '/workspace/plot.png',
        });
        expect(imageSource('/workspace/plot.png')).toEqual({ kind: 'pending', path: '/workspace/plot.png' });
    });

    it('shows data: images only as PNG, JPEG, GIF or WebP in base64', () => {
        const png = 'data:image/png;base64,iVBORw0KGgo=';
        expect(imageSource(png, ctx)).toEqual({ kind: 'data', url: png });
        expect(imageSource('data:image/svg+xml;base64,PHN2Zz4=', ctx).kind).toBe('blocked');
        expect(imageSource('data:image/png,rawdata', ctx).kind).toBe('blocked');
        expect(imageSource('data:text/html;base64,PGI+', ctx).kind).toBe('blocked');
    });

    it('never loads foreign addresses, even with a finished answer', () => {
        for (const src of ['https://attacker.example/x.png?d=secret', '//attacker.example/x.png', '/etc/hosts']) {
            expect(imageSource(src, ctx), src).toEqual({ kind: 'blocked', src });
        }
        expect(imageSource(undefined, ctx)).toEqual({ kind: 'blocked', src: '' });
    });
});

describe('messageImageKey', () => {
    it('takes the responseId, otherwise ts-<timestamp>', () => {
        expect(messageImageKey({ responseId: 'chatcmpl-1:2', timestamp: 5 })).toBe('chatcmpl-1:2');
        expect(messageImageKey({ timestamp: 1759700000123 })).toBe('ts-1759700000123');
    });

    it('drops IDs the gateway would refuse', () => {
        expect(messageImageKey({ responseId: 'bad id/1', timestamp: 7 })).toBe('ts-7');
        expect(messageImageKey({ responseId: 'x'.repeat(129) })).toBeUndefined();
        expect(messageImageKey({ timestamp: 0 })).toBeUndefined();
        expect(messageImageKey({ timestamp: Number.NaN })).toBeUndefined();
        expect(messageImageKey(undefined)).toBeUndefined();
    });
});

describe('parseMarkdownImage', () => {
    it('reads alt text and address, also in angle brackets and with a title', () => {
        expect(parseMarkdownImage('![Chart](/workspace/plot.png)')).toEqual({ alt: 'Chart', src: '/workspace/plot.png' });
        expect(parseMarkdownImage('![](<my plot.png>)')).toEqual({ alt: '', src: 'my plot.png' });
        expect(parseMarkdownImage('![a](b.png "Title")')).toEqual({ alt: 'a', src: 'b.png' });
    });

    it('is not a link and not text', () => {
        expect(parseMarkdownImage('[Chart](/workspace/plot.png)')).toBeUndefined();
        expect(parseMarkdownImage('see ![a](b.png)')).toBeUndefined();
    });
});
