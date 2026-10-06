// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from 'vitest';

import {
    autoRender,
    createMermaidRenderer,
    diagramView,
    isFenceOpen,
    isLargeDiagram,
    MERMAID_AUTO_MAX,
    MERMAID_LARGE_CHARS,
    MERMAID_LARGE_EDGES,
    mermaidBlocks,
    mermaidErrorNote,
    mermaidReady,
    mermaidSize,
    readFence,
    svgDataUrl,
} from './mermaid';
import type { MermaidApi } from './mermaid';

const lines = (t: string) => t.split('\n');

describe('readFence', () => {
    it('reads a closed mermaid block with its language and the line after it', () => {
        const f = readFence(lines('```mermaid\ngraph TD\n  A-->B\n```\nafter'), 0);
        expect(f).toEqual({ lang: 'mermaid', body: 'graph TD\n  A-->B', closed: true, next: 4 });
    });
    it('takes the first word of the info string, case-insensitively', () => {
        expect(readFence(lines('~~~ Mermaid title\nx\n~~~'), 0)?.lang).toBe('mermaid');
        expect(readFence(lines('```mermaidx\nx\n```'), 0)?.lang).toBe('mermaidx');
        expect(readFence(lines('```\nx\n```'), 0)?.lang).toBe('');
    });
    it('reports a block that is still open at the end of the text (streaming)', () => {
        const f = readFence(lines('```mermaid\ngraph TD\n  A-->'), 0);
        expect(f).toMatchObject({ closed: false, body: 'graph TD\n  A-->', next: 3 });
    });
    it('closes only with the same character, at least the same length and no info string', () => {
        expect(readFence(lines('````mermaid\n```\nstill open'), 0)?.closed).toBe(false);
        expect(readFence(lines('```mermaid\n~~~\n'), 0)?.closed).toBe(false);
        expect(readFence(lines('```mermaid\nx\n```js'), 0)?.closed).toBe(false);
        expect(readFence(lines('```mermaid\nx\n`````'), 0)?.closed).toBe(true);
    });
    it('opens no block for a line without a fence or with backticks in the info string', () => {
        expect(readFence(lines('text with ``` inside'), 0)).toBeUndefined();
        expect(readFence(lines('```a`b'), 0)).toBeUndefined();
        expect(isFenceOpen('  ```mermaid')).toBe(true);
        expect(isFenceOpen('``x`')).toBe(false);
    });
    it('tolerates Windows line ends', () => {
        expect(readFence(['```mermaid\r', 'graph TD\r', '```\r'], 0)).toMatchObject({ lang: 'mermaid', closed: true });
    });
});

describe('mermaidBlocks and mermaidReady', () => {
    it('finds the complete mermaid blocks of a message and skips other code', () => {
        const text = 'a\n```mermaid\ngraph TD\nA-->B\n```\n\n```js\n```mermaid in js\n```\n\n~~~mermaid\nsequenceDiagram\n~~~\n';
        const blocks = mermaidBlocks(text);
        expect(blocks.map((b) => b.body)).toEqual(['graph TD\nA-->B', 'sequenceDiagram']);
        expect(blocks.every((b) => b.closed)).toBe(true);
    });
    it('marks the last block of a streaming answer as incomplete until its fence arrives', () => {
        const partial = 'Here:\n\n```mermaid\nflowchart LR\n  A --> B';
        const [open] = mermaidBlocks(partial);
        expect(open.closed).toBe(false);
        expect(mermaidReady(open, true)).toBe(false);
        const [done] = mermaidBlocks(`${partial}\n\`\`\``);
        expect(mermaidReady(done, true)).toBe(true);
    });
    it('renders an unclosed block once the answer is stored', () => {
        const [open] = mermaidBlocks('```mermaid\ngraph TD\nA-->B');
        expect(mermaidReady(open, false)).toBe(true);
    });
});

describe('diagramView', () => {
    it('shows the code while the block is incomplete', () => {
        expect(diagramView({ ready: false })).toBe('source');
        expect(diagramView({ ready: false, outcome: { ok: true, svg: '<svg/>' } })).toBe('source');
    });
    it('waits for the result once the block is complete', () => {
        expect(diagramView({ ready: true })).toBe('loading');
    });
    it('shows the diagram, or the code with a note on errors', () => {
        expect(diagramView({ ready: true, outcome: { ok: true, svg: '<svg/>' } })).toBe('diagram');
        expect(diagramView({ ready: true, outcome: { ok: false, error: 'Parse error' } })).toBe('error');
    });
    it('shows the code instead of the diagram on request', () => {
        expect(diagramView({ ready: true, outcome: { ok: true, svg: '<svg/>' }, showSource: true })).toBe('source');
    });
});

describe('mermaidErrorNote', () => {
    it('names the line of a syntax error', () => {
        expect(mermaidErrorNote('Parse error on line 3:\n...A-->\n----^\nExpecting ...')).toBe(
            'Diagram could not be rendered (syntax error in line 3)',
        );
    });
    it('stays short for other errors', () => {
        expect(mermaidErrorNote('No diagram type detected matching given configuration')).toBe(
            'Diagram could not be rendered',
        );
        expect(mermaidErrorNote('')).toBe('Diagram could not be rendered');
    });
});

describe('svgDataUrl', () => {
    it('encodes the SVG as a data: address (for <img>, where no script runs)', () => {
        const url = svgDataUrl('<svg xmlns="http://www.w3.org/2000/svg"><text>Ä & #</text></svg>');
        expect(url.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
        expect(url).not.toContain('#');
        expect(decodeURIComponent(url.slice(url.indexOf(',') + 1))).toContain('<text>Ä & #</text>');
    });
});

describe('createMermaidRenderer (library mocked)', () => {
    const fake = (render: MermaidApi['render']) => {
        const api: MermaidApi = { initialize: vi.fn(), render: vi.fn(render) };
        const load = vi.fn(async () => ({ api, sanitize: (svg: string) => `clean:${svg}` }));
        return { api, load };
    };

    it('loads the library only at the first diagram and only once', async () => {
        const { api, load } = fake(async (id, code) => ({ svg: `<svg id="${id}">${code}</svg>` }));
        const r = createMermaidRenderer(load);
        expect(load).not.toHaveBeenCalled();
        await r.render('graph TD\nA-->B');
        await r.render('graph TD\nB-->C');
        expect(load).toHaveBeenCalledTimes(1);
        expect(api.initialize).toHaveBeenCalledTimes(1);
        expect(api.render).toHaveBeenCalledTimes(2);
    });

    it('sets securityLevel strict, no HTML labels and the platform theme, which the diagram cannot override', async () => {
        const { api, load } = fake(async () => ({ svg: '<svg/>' }));
        await createMermaidRenderer(load).render('graph TD\nA-->B');
        const cfg = vi.mocked(api.initialize).mock.calls[0][0];
        expect(cfg.securityLevel).toBe('strict');
        expect(cfg.htmlLabels).toBe(false);
        expect(cfg.startOnLoad).toBe(false);
        expect(cfg.theme).toBe('base');
        expect(cfg.themeVariables?.primaryBorderColor).toBe('#0f5432');
        expect(cfg.secure).toEqual(
            expect.arrayContaining(['securityLevel', 'htmlLabels', 'themeCSS', 'startOnLoad', 'theme', 'themeVariables']),
        );
    });

    it('sanitizes the result and caches it per source', async () => {
        const { api, load } = fake(async () => ({ svg: '<svg/>' }));
        const r = createMermaidRenderer(load);
        expect(await r.render('graph TD\nA-->B')).toEqual({ ok: true, svg: 'clean:<svg/>' });
        await r.render('graph TD\nA-->B');
        expect(api.render).toHaveBeenCalledTimes(1);
    });

    it('reports a syntax error as a result instead of an exception (fallback to code)', async () => {
        const { load } = fake(async () => {
            throw new Error('Parse error on line 2');
        });
        const out = await createMermaidRenderer(load).render('graph TD\nA-->');
        expect(out).toEqual({ ok: false, error: 'Parse error on line 2' });
        expect(diagramView({ ready: true, outcome: out })).toBe('error');
    });

    it('reports a failed load and loads again at the next diagram', async () => {
        let fail = true;
        const { api } = fake(async () => ({ svg: '<svg/>' }));
        const load = vi.fn(async () => {
            if (fail) throw new Error('chunk not loaded');
            return { api, sanitize: (s: string) => s };
        });
        const r = createMermaidRenderer(load);
        expect(await r.render('graph TD')).toEqual({ ok: false, error: 'chunk not loaded' });
        fail = false;
        expect(await r.render('graph TD')).toEqual({ ok: true, svg: '<svg/>' });
        expect(load).toHaveBeenCalledTimes(2);
    });

    it('draws one after another, never concurrently (mermaid has global state)', async () => {
        let active = 0;
        let max = 0;
        const { load } = fake(async () => {
            active++;
            max = Math.max(max, active);
            await new Promise((res) => setTimeout(res, 5));
            active--;
            return { svg: '<svg/>' };
        });
        const r = createMermaidRenderer(load);
        await Promise.all([r.render('a'), r.render('b'), r.render('c')]);
        expect(max).toBe(1);
    });
});

describe('large and many diagrams', () => {
    const graph = (edges: number) =>
        ['graph TD', ...Array.from({ length: edges }, (_, i) => `  n${i} --> n${i + 1}`)].join('\n');
    it('measures characters and edges', () => {
        expect(mermaidSize(graph(3))).toEqual({ chars: graph(3).length, edges: 3 });
        expect(mermaidSize('sequenceDiagram\n  A->>B: hi\n  B-->>A: ok\n  A-)B: x')).toMatchObject({ edges: 3 });
        expect(isLargeDiagram(graph(20))).toBe(false);
        expect(isLargeDiagram(graph(MERMAID_LARGE_EDGES + 1))).toBe(true);
        expect(isLargeDiagram(`graph TD\n%% ${'x'.repeat(MERMAID_LARGE_CHARS)}`)).toBe(true);
    });
    it('draws at most MERMAID_AUTO_MAX per message on its own, large ones never', () => {
        expect(autoRender({ index: 0, large: false })).toBe(true);
        expect(autoRender({ index: MERMAID_AUTO_MAX - 1, large: false })).toBe(true);
        expect(autoRender({ index: MERMAID_AUTO_MAX, large: false })).toBe(false);
        expect(autoRender({ index: 0, large: true })).toBe(false);
        expect(diagramView({ ready: true, deferred: true })).toBe('deferred');
        expect(diagramView({ ready: false, deferred: true })).toBe('source');
    });
});
