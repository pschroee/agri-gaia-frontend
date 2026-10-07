// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Inline forms of a line of an agent answer (Markdown.tsx renders them): code, bold, italic, Markdown links and
// bare http(s) URLs (GFM autolink literals, issue #61 of the thesis repository). Pure, so it can be unit-tested.

export type InlineToken =
    | { t: 'text'; s: string }
    | { t: 'code'; s: string }
    | { t: 'bold'; s: string }
    | { t: 'italic'; s: string }
    | { t: 'link'; label: string; href: string; auto?: boolean };

/** Only these schemes become links; anything else stays text. */
export const isWebUrl = (href: string) => /^https?:\/\/[^\s/?#]+/i.test(href);

/**
 * The URL part of a bare URL candidate, as GFM's autolink literal extension does it: trailing punctuation
 * (. , : ; ! ? ' " * _ ~) is not part of the link, nor is a closing bracket that has no opening one inside the
 * URL, so "(see https://a.org/x)" links "https://a.org/x" and "https://en.wikipedia.org/wiki/Foo_(bar)" stays
 * whole. Returns "" when nothing usable is left.
 */
export function trimAutolink(candidate: string): string {
    let url = candidate;
    for (;;) {
        const last = url.slice(-1);
        if (/[.,:;!?'"*_~]/.test(last)) {
            url = url.slice(0, -1);
            continue;
        }
        const pair = ({ ')': '(', ']': '[', '}': '{' } as Record<string, string>)[last];
        if (pair && count(url, last) > count(url, pair)) {
            url = url.slice(0, -1);
            continue;
        }
        break;
    }
    return isWebUrl(url) ? url : '';
}

const count = (s: string, c: string) => s.split(c).length - 1;

// code | bold | italic | link | <autolink> | bare URL. Underscores inside a word (snake_case, Card_counting in a URL)
// do not start or end emphasis, as in CommonMark. A bare URL starts after a non-word character only (not in
// the middle of "xhttps://…" or a path); backticks and angle brackets end it, as whitespace does.
const INLINE =
    /(`[^`]+`)|(\*\*[^*]+\*\*|(?<!\w)__[^_]+__(?!\w))|(\*[^*\s][^*]*\*|(?<!\w)_[^_\s][^_]*_(?!\w))|(\[[^\]]+\]\([^)\s]+\))|(<https?:\/\/[^\s<>`]+>)|((?<![\w/@.])https?:\/\/[^\s<>`]+)/gi;

export function inlineTokens(text: string): InlineToken[] {
    const out: InlineToken[] = [];
    const push = (s: string) => {
        if (!s) return;
        const prev = out[out.length - 1];
        if (prev?.t === 'text') prev.s += s;
        else out.push({ t: 'text', s });
    };
    const re = new RegExp(INLINE.source, INLINE.flags);
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
        const s = m[0];
        let end = m.index + s.length;
        if (m[6]) {
            const url = trimAutolink(s);
            if (!url) {
                // Not a usable URL ("https://" alone): leave it as text and go on after the scheme.
                re.lastIndex = m.index + 1;
                continue;
            }
            push(text.slice(last, m.index));
            out.push({ t: 'link', label: url, href: url, auto: true });
            end = m.index + url.length;
            re.lastIndex = end;
            last = end;
            continue;
        }
        push(text.slice(last, m.index));
        if (m[1]) out.push({ t: 'code', s: s.slice(1, -1) });
        else if (m[2]) out.push({ t: 'bold', s: s.slice(2, -2) });
        else if (m[3]) out.push({ t: 'italic', s: s.slice(1, -1) });
        else if (m[5]) {
            const url = s.slice(1, -1);
            if (isWebUrl(url)) out.push({ t: 'link', label: url, href: url, auto: true });
            else push(s);
        } else {
            const lm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(s);
            const href = lm?.[2] ?? '';
            if (lm && isWebUrl(href)) out.push({ t: 'link', label: lm[1], href });
            else push(lm?.[1] ?? s);
        }
        last = end;
    }
    push(text.slice(last));
    return out;
}
