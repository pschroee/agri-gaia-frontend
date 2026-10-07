// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import { inlineTokens, InlineToken, trimAutolink } from './inline';

const auto = (url: string): InlineToken => ({ t: 'link', label: url, href: url, auto: true });
const text = (s: string): InlineToken => ({ t: 'text', s });

describe('bare URLs (autolink)', () => {
    it('links a bare URL after a colon, as the agent cited sources', () => {
        expect(inlineTokens('Card counting (Wikipedia, 2026): https://en.wikipedia.org/wiki/Card_counting')).toEqual([
            text('Card counting (Wikipedia, 2026): '),
            auto('https://en.wikipedia.org/wiki/Card_counting'),
        ]);
    });

    it('leaves trailing punctuation outside the link', () => {
        for (const p of ['.', ',', ';', ':', '!', '?', '"', "'", '...', '?!']) {
            expect(inlineTokens(`See https://a.org/x${p} Next`)).toEqual([
                text('See '),
                auto('https://a.org/x'),
                text(`${p} Next`),
            ]);
        }
    });

    it('handles brackets: an unbalanced closing bracket ends the link, a balanced one stays', () => {
        expect(inlineTokens('(see https://a.org/x)')).toEqual([text('(see '), auto('https://a.org/x'), text(')')]);
        expect(inlineTokens('(see https://a.org/x).')).toEqual([text('(see '), auto('https://a.org/x'), text(').')]);
        expect(inlineTokens('https://en.wikipedia.org/wiki/Poker_(card_game)')).toEqual([
            auto('https://en.wikipedia.org/wiki/Poker_(card_game)'),
        ]);
        expect(inlineTokens('(https://en.wikipedia.org/wiki/Poker_(card_game))')).toEqual([
            text('('),
            auto('https://en.wikipedia.org/wiki/Poker_(card_game)'),
            text(')'),
        ]);
        expect(inlineTokens('[https://a.org/x]')).toEqual([text('['), auto('https://a.org/x'), text(']')]);
    });

    it('keeps query, fragment and underscores in the URL, without italics', () => {
        expect(inlineTokens('https://a.org/a_b_c?q=1&r=two#part_2 done')).toEqual([
            auto('https://a.org/a_b_c?q=1&r=two#part_2'),
            text(' done'),
        ]);
        expect(inlineTokens('snake_case and https://a.org/b_c')).toEqual([
            text('snake_case and '),
            auto('https://a.org/b_c'),
        ]);
    });

    it('links several URLs and http as well as https', () => {
        expect(inlineTokens('http://a.org and HTTPS://b.org/')).toEqual([
            auto('http://a.org'),
            text(' and '),
            auto('HTTPS://b.org/'),
        ]);
    });

    it('links the GFM angle form <https://…> without the brackets', () => {
        expect(inlineTokens('at <https://a.org/x>.')).toEqual([text('at '), auto('https://a.org/x'), text('.')]);
    });

    it('does not link other schemes, a scheme without host or a URL glued to a word', () => {
        for (const s of [
            'javascript:alert(1)',
            'ftp://a.org/x',
            'file:///etc/passwd',
            'mailto:a@b.org',
            'data:text/html,x',
            'only https:// here',
            'xhttps://a.org',
            'see <javascript:alert(1)>',
        ]) {
            expect(inlineTokens(s).every((t) => t.t !== 'link')).toBe(true);
        }
    });

    it('does not link inside inline code', () => {
        expect(inlineTokens('run `curl https://a.org/x` now')).toEqual([
            text('run '),
            { t: 'code', s: 'curl https://a.org/x' },
            text(' now'),
        ]);
    });

    it('stops at a backtick, so code after a URL stays code', () => {
        expect(inlineTokens('https://a.org/x`y`')).toEqual([auto('https://a.org/x'), { t: 'code', s: 'y' }]);
    });

    it('keeps Markdown links as they are and links bare URLs inside bold', () => {
        expect(inlineTokens('[Card counting - Wikipedia](https://en.wikipedia.org/wiki/Card_counting)')).toEqual([
            { t: 'link', label: 'Card counting - Wikipedia', href: 'https://en.wikipedia.org/wiki/Card_counting' },
        ]);
        expect(inlineTokens('[https://a.org](https://a.org)')).toEqual([
            { t: 'link', label: 'https://a.org', href: 'https://a.org' },
        ]);
        expect(inlineTokens('**https://a.org/x**')).toEqual([{ t: 'bold', s: 'https://a.org/x' }]);
        expect(inlineTokens('https://a.org/x')).toEqual([auto('https://a.org/x')]);
    });

    it('never makes a link of a Markdown link with another scheme', () => {
        expect(inlineTokens('[click](javascript:alert(1))').some((t) => t.t === 'link')).toBe(false);
    });
});

describe('emphasis', () => {
    it('keeps bold, italic and code', () => {
        expect(inlineTokens('a **b** *c* _d_ `e`')).toEqual([
            text('a '),
            { t: 'bold', s: 'b' },
            text(' '),
            { t: 'italic', s: 'c' },
            text(' '),
            { t: 'italic', s: 'd' },
            text(' '),
            { t: 'code', s: 'e' },
        ]);
    });

    it('does not start italics inside a word', () => {
        expect(inlineTokens('snake_case_name')).toEqual([text('snake_case_name')]);
    });
});

describe('trimAutolink', () => {
    it('trims punctuation and unbalanced brackets, and refuses an empty host', () => {
        expect(trimAutolink('https://a.org/x).')).toBe('https://a.org/x');
        expect(trimAutolink('https://a.org/x_(y)')).toBe('https://a.org/x_(y)');
        expect(trimAutolink('https://a.org/x}')).toBe('https://a.org/x');
        expect(trimAutolink('https://.')).toBe('');
        expect(trimAutolink('https://')).toBe('');
    });
});
