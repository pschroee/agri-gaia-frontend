// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { ReactNode } from 'react';

import Box from '@mui/material/Box';
import Link from '@mui/material/Link';

import { imageSource, MARKDOWN_IMAGE, parseMarkdownImage } from '../images';
import ImagePreview, { ImageNote } from './ImagePreview';

// A small Markdown renderer for agent answers: paragraphs, headings, lists, block quotes, fenced code,
// tables and the inline forms code, bold, italic, links and images. It builds React elements, never HTML strings.

/** Where images of this text may come from: the chat and the ID of the stored answer (images.ts). */
export type ImageContext = { chatId?: string; msgId?: string };

/**
 * An image of the answer. Foreign addresses are never loaded, only named: through the address, data from the
 * sandbox could reach a foreign server (Markdown image exfiltration). Local paths go through the gateway once the
 * answer is stored; data: raster images stay in the browser.
 */
function AnswerImage({ alt, src, ctx }: { alt: string; src: string; ctx?: ImageContext }) {
    const s = imageSource(src, ctx);
    switch (s.kind) {
        case 'data':
            return <ImagePreview src={s.url} alt={alt} label={alt || 'embedded image'} />;
        case 'sandbox':
            return <ImagePreview src={s.url} alt={alt} label={s.path} />;
        case 'pending':
            return (
                <ImageNote
                    text={`Image${alt ? `: ${alt}` : ''} · ${s.path}`}
                    title="Shows once the answer is finished"
                />
            );
        default:
            return (
                <ImageNote
                    text={`Image not loaded${alt ? `: ${alt}` : ''} · ${s.src}`}
                    title="Only images from the chat's sandbox are shown; other addresses are never loaded."
                />
            );
    }
}

const MONO = '"Roboto Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

/**
 * Inline forms of a line. Images are split off first, so that an underscore in an image path cannot start an
 * italic run that swallows the image.
 */
function inline(text: string, keyBase: string, img?: ImageContext): ReactNode[] {
    const re = new RegExp(MARKDOWN_IMAGE.source, 'g');
    const out: ReactNode[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    let i = 0;
    while ((m = re.exec(text))) {
        if (m.index > last) out.push(...inlineText(text.slice(last, m.index), `${keyBase}-t${i}`));
        const im = parseMarkdownImage(m[0]);
        out.push(im ? <AnswerImage key={`${keyBase}-i${i}`} alt={im.alt} src={im.src} ctx={img} /> : m[0]);
        i++;
        last = m.index + m[0].length;
    }
    if (last < text.length) out.push(...inlineText(last ? text.slice(last) : text, `${keyBase}-t${i}`));
    return out;
}

function inlineText(text: string, keyBase: string): ReactNode[] {
    const out: ReactNode[] = [];
    // code | bold | italic | link
    const re = /(`[^`]+`)|(\*\*[^*]+\*\*|__[^_]+__)|(\*[^*\s][^*]*\*|_[^_\s][^_]*_)|(\[[^\]]+\]\([^)\s]+\))/g;
    let last = 0;
    let m: RegExpExecArray | null;
    let i = 0;
    while ((m = re.exec(text))) {
        if (m.index > last) out.push(text.slice(last, m.index));
        const k = `${keyBase}-${i++}`;
        const s = m[0];
        if (m[1]) {
            out.push(
                <Box
                    key={k}
                    component="code"
                    sx={{ fontFamily: MONO, fontSize: '0.9em', bgcolor: 'action.hover', px: 0.5, borderRadius: 0.5 }}
                >
                    {s.slice(1, -1)}
                </Box>,
            );
        } else if (m[2]) {
            out.push(<strong key={k}>{inlineText(s.slice(2, -2), k)}</strong>);
        } else if (m[3]) {
            out.push(<em key={k}>{inlineText(s.slice(1, -1), k)}</em>);
        } else {
            const lm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(s);
            const href = lm?.[2] ?? '';
            if (lm && /^https?:\/\//i.test(href)) {
                out.push(
                    <Link key={k} href={href} target="_blank" rel="noopener noreferrer">
                        {lm[1]}
                    </Link>,
                );
            } else {
                out.push(lm?.[1] ?? s);
            }
        }
        last = m.index + s.length;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
}

const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const isTableSep = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
const cells = (l: string) =>
    l
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((c) => c.trim());

export default function Markdown({
    text,
    dense = false,
    images,
}: {
    text: string;
    dense?: boolean;
    /** Chat and answer for local images; without it they stay a note. */
    images?: ImageContext;
}) {
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    const blocks: ReactNode[] = [];
    let i = 0;
    let n = 0;
    const gap = dense ? 0.75 : 1;

    while (i < lines.length) {
        const line = lines[i];
        const key = `b${n++}`;

        if (/^\s*```/.test(line)) {
            const body: string[] = [];
            i++;
            while (i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i++]);
            i++;
            blocks.push(
                <Box
                    key={key}
                    component="pre"
                    sx={{
                        fontFamily: MONO,
                        fontSize: 12,
                        lineHeight: 1.6,
                        bgcolor: '#fafafa',
                        border: 1,
                        borderColor: 'divider',
                        borderRadius: 1,
                        p: 1.25,
                        m: 0,
                        mb: gap,
                        overflowX: 'auto',
                        whiteSpace: 'pre',
                    }}
                >
                    {body.join('\n')}
                </Box>,
            );
            continue;
        }

        if (!line.trim()) {
            i++;
            continue;
        }

        const h = /^(#{1,6})\s+(.*)$/.exec(line);
        if (h) {
            blocks.push(
                <Box
                    key={key}
                    sx={{ fontWeight: 500, fontSize: h[1].length <= 2 ? '1.1em' : '1em', mt: 0.5, mb: gap * 0.5 }}
                >
                    {inline(h[2], key, images)}
                </Box>,
            );
            i++;
            continue;
        }

        if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
            const head = cells(line);
            const rows: string[][] = [];
            i += 2;
            while (i < lines.length && isTableRow(lines[i])) rows.push(cells(lines[i++]));
            blocks.push(
                <Box key={key} sx={{ overflowX: 'auto', mb: gap }}>
                    <Box
                        component="table"
                        sx={{
                            borderCollapse: 'collapse',
                            fontSize: '0.92em',
                            '& th, & td': {
                                borderBottom: 1,
                                borderColor: 'divider',
                                px: 1,
                                py: 0.5,
                                textAlign: 'left',
                            },
                            '& th': { fontWeight: 500 },
                        }}
                    >
                        <thead>
                            <tr>
                                {head.map((c, j) => (
                                    <th key={j}>{inline(c, `${key}h${j}`, images)}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r, ri) => (
                                <tr key={ri}>
                                    {r.map((c, j) => (
                                        <td key={j}>{inline(c, `${key}r${ri}c${j}`, images)}</td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </Box>
                </Box>,
            );
            continue;
        }

        const ul = /^\s*[-*+]\s+/;
        const ol = /^\s*\d+[.)]\s+/;
        if (ul.test(line) || ol.test(line)) {
            const ordered = ol.test(line);
            const re = ordered ? ol : ul;
            const items: string[] = [];
            while (i < lines.length && (re.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
                if (re.test(lines[i])) items.push(lines[i].replace(re, ''));
                else items[items.length - 1] += ` ${lines[i].trim()}`;
                i++;
            }
            blocks.push(
                <Box key={key} component={ordered ? 'ol' : 'ul'} sx={{ m: 0, mb: gap, pl: 2.5 }}>
                    {items.map((it, j) => (
                        <li key={j}>{inline(it, `${key}-${j}`, images)}</li>
                    ))}
                </Box>,
            );
            continue;
        }

        if (/^\s*>/.test(line)) {
            const body: string[] = [];
            while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ''));
            blocks.push(
                <Box
                    key={key}
                    sx={{ borderLeft: 3, borderColor: 'divider', pl: 1.5, color: 'text.secondary', mb: gap }}
                >
                    {inline(body.join(' '), key, images)}
                </Box>,
            );
            continue;
        }

        const para: string[] = [];
        while (
            i < lines.length &&
            lines[i].trim() &&
            !/^\s*```/.test(lines[i]) &&
            !/^#{1,6}\s/.test(lines[i]) &&
            !ul.test(lines[i]) &&
            !ol.test(lines[i]) &&
            !/^\s*>/.test(lines[i]) &&
            !(isTableRow(lines[i]) && i + 1 < lines.length && isTableSep(lines[i + 1]))
        ) {
            para.push(lines[i++]);
        }
        blocks.push(
            <Box key={key} component="p" sx={{ m: 0, mb: gap }}>
                {inline(para.join(' '), key, images)}
            </Box>,
        );
    }

    return <Box sx={{ '& > :last-child': { mb: 0 }, overflowWrap: 'anywhere' }}>{blocks}</Box>;
}
