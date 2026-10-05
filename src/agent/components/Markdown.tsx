// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { ReactNode } from 'react';

import Box from '@mui/material/Box';
import Link from '@mui/material/Link';

// A small Markdown renderer for agent answers: paragraphs, headings, lists, block quotes, fenced code,
// tables and the inline forms code, bold, italic and links. It builds React elements, never HTML strings.

const MONO = '"Roboto Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

function inline(text: string, keyBase: string): ReactNode[] {
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
            out.push(<strong key={k}>{inline(s.slice(2, -2), k)}</strong>);
        } else if (m[3]) {
            out.push(<em key={k}>{inline(s.slice(1, -1), k)}</em>);
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

export default function Markdown({ text, dense = false }: { text: string; dense?: boolean }) {
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
                    {inline(h[2], key)}
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
                                    <th key={j}>{inline(c, `${key}h${j}`)}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r, ri) => (
                                <tr key={ri}>
                                    {r.map((c, j) => (
                                        <td key={j}>{inline(c, `${key}r${ri}c${j}`)}</td>
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
                        <li key={j}>{inline(it, `${key}-${j}`)}</li>
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
                    {inline(body.join(' '), key)}
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
                {inline(para.join(' '), key)}
            </Box>,
        );
    }

    return <Box sx={{ '& > :last-child': { mb: 0 }, overflowWrap: 'anywhere' }}>{blocks}</Box>;
}
