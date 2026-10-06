// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Mermaid diagrams in agent answers: fenced code blocks, their state while streaming, the configuration and a
// renderer that loads the library only at the first diagram (separate chunk, see mermaidLoad.ts). Port of the
// gateway's web/src/lib/mermaid.ts, adapted to the platform theme and the Markdown parser of this UI. Without React.
import { agentColors } from './components/tokens';

/** The configuration keys the UI sets (subset of mermaid's MermaidConfig, see mermaid-module.d.ts). */
export type MermaidConfig = {
    startOnLoad: boolean;
    securityLevel: 'strict';
    htmlLabels: boolean;
    theme: 'base';
    themeVariables: Record<string, string>;
    darkMode: boolean;
    fontFamily: string;
    suppressErrorRendering: boolean;
    maxTextSize: number;
    flowchart: { htmlLabels: boolean; nodeSpacing: number; rankSpacing: number; padding: number };
    sequence: { width: number; actorMargin: number; messageMargin: number; boxMargin: number };
    secure: string[];
};

export type MermaidOutcome = { ok: true; svg: string } | { ok: false; error: string };

/** The part of the mermaid API the UI uses (mocked in tests). */
export type MermaidApi = {
    initialize: (config: MermaidConfig) => void;
    render: (id: string, code: string) => Promise<{ svg: string }>;
};
export type MermaidModule = { api: MermaidApi; sanitize: (svg: string) => string };

/** Opening or closing fence: at least three ` or ~, then the info string. Indentation is tolerated (list items). */
const FENCE = /^(\s*)(`{3,}|~{3,})(.*)$/;

/** Does the line open a fenced code block? For backtick fences the info string must not contain backticks. */
export function isFenceOpen(line: string): boolean {
    const m = FENCE.exec(line.replace(/\r$/, ''));
    return !!m && !(m[2][0] === '`' && m[3].includes('`'));
}

export type Fence = {
    /** First word of the info string, lower case ('' without one). */
    lang: string;
    body: string;
    /** A closing fence was found; false when the text ends inside the block (streaming). */
    closed: boolean;
    /** Index of the first line after the block. */
    next: number;
};

/**
 * Reads the fenced code block that starts at line `start`, or undefined if that line opens none. As in CommonMark,
 * the block is closed only by a fence of the same character, at least as long and without an info string.
 */
export function readFence(lines: string[], start: number): Fence | undefined {
    const m = FENCE.exec((lines[start] ?? '').replace(/\r$/, ''));
    if (!m || (m[2][0] === '`' && m[3].includes('`'))) return undefined;
    const char = m[2][0];
    const len = m[2].length;
    const lang = (m[3].trim().split(/\s+/)[0] ?? '').toLowerCase();
    const body: string[] = [];
    let i = start + 1;
    while (i < lines.length) {
        const c = FENCE.exec(lines[i].replace(/\r$/, ''));
        if (c && c[2][0] === char && c[2].length >= len && c[3].trim() === '') {
            return { lang, body: body.join('\n'), closed: true, next: i + 1 };
        }
        body.push(lines[i]);
        i++;
    }
    return { lang, body: body.join('\n'), closed: false, next: i };
}

/** A diagram is drawn once its block is complete: closed, or the answer is no longer streaming. */
export function mermaidReady(fence: Pick<Fence, 'closed'>, streaming: boolean): boolean {
    return fence.closed || !streaming;
}

/** The Mermaid blocks of a text in order (for tests and for counting the diagrams of a message). */
export function mermaidBlocks(text: string): Fence[] {
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    const out: Fence[] = [];
    let i = 0;
    while (i < lines.length) {
        const f = readFence(lines, i);
        if (!f) {
            i++;
            continue;
        }
        if (f.lang === 'mermaid') out.push(f);
        i = f.next;
    }
    return out;
}

/**
 * Limits against blocking diagrams (gateway review 3, N4: about 3.4 s per large diagram on the main thread): from
 * MERMAID_LARGE_CHARS characters or MERMAID_LARGE_EDGES edges, drawing happens only on click, and per message at
 * most MERMAID_AUTO_MAX diagrams are drawn on their own.
 */
export const MERMAID_AUTO_MAX = 5;
export const MERMAID_LARGE_CHARS = 4000;
export const MERMAID_LARGE_EDGES = 150;

// Edges: arrows and lines of the common diagram types (flowchart, sequence, class, state, er).
const EDGE = /<?(?:-{2,}|={2,}|-\.+-?|~{3})[->xo)|]*|->>?|-[x)]|\|\|--|\}o--/g;

/** Size of a diagram: characters and (estimated) edges. */
export function mermaidSize(code: string): { chars: number; edges: number } {
    let edges = 0;
    for (const line of code.split('\n')) {
        const l = line.trim();
        if (!l || l.startsWith('%%')) continue;
        const m = l.match(EDGE);
        if (m) edges += m.length;
    }
    return { chars: code.length, edges };
}

export function isLargeDiagram(code: string): boolean {
    const s = mermaidSize(code);
    return s.chars > MERMAID_LARGE_CHARS || s.edges > MERMAID_LARGE_EDGES;
}

/** Is a diagram drawn without a click? index: position in the message (from 0). */
export function autoRender(p: { index: number; large: boolean }): boolean {
    return !p.large && p.index < MERMAID_AUTO_MAX;
}

export type DiagramView = 'source' | 'deferred' | 'loading' | 'diagram' | 'error';

/**
 * What a Mermaid block shows: the source while the block is still open during streaming or the user wants to see
 * it; a deferred diagram (large or too many) as source with a button; otherwise the diagram, "rendering" until
 * then, and on errors the source with a note.
 */
export function diagramView(p: {
    ready: boolean;
    outcome?: MermaidOutcome;
    showSource?: boolean;
    deferred?: boolean;
}): DiagramView {
    if (!p.ready) return 'source';
    if (p.deferred) return 'deferred';
    if (!p.outcome) return 'loading';
    if (!p.outcome.ok) return 'error';
    return p.showSource ? 'source' : 'diagram';
}

/** Short note for a failed diagram; the full message goes into the tooltip. */
export function mermaidErrorNote(error: string): string {
    const first = error.split('\n').find((l) => l.trim()) ?? '';
    const line = /line (\d+)/i.exec(first)?.[1];
    return line ? `Diagram could not be rendered (syntax error in line ${line})` : 'Diagram could not be rendered';
}

/**
 * SVG as a data: address for <img>. Embedded as an image, the browser runs no script in the SVG and loads no
 * external resources (image context).
 */
export function svgDataUrl(svg: string): string {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Diagram colours from the platform theme (primary #0f5432), on mermaid's neutral `base` theme. */
export const MERMAID_THEME_VARIABLES: Record<string, string> = {
    background: '#ffffff',
    primaryColor: agentColors.greenTint,
    primaryBorderColor: agentColors.green,
    primaryTextColor: '#1f2a24',
    secondaryColor: agentColors.amberTint,
    secondaryBorderColor: agentColors.amberLine,
    secondaryTextColor: '#1f2a24',
    tertiaryColor: '#f5f7f6',
    tertiaryBorderColor: agentColors.greenLine,
    tertiaryTextColor: '#1f2a24',
    lineColor: '#4f6b5c',
    textColor: '#1f2a24',
    mainBkg: agentColors.greenTint,
    nodeBorder: agentColors.green,
    clusterBkg: '#f5f7f6',
    clusterBorder: agentColors.greenLine,
    edgeLabelBackground: '#ffffff',
    actorBkg: agentColors.greenTint,
    actorBorder: agentColors.green,
    actorTextColor: '#1f2a24',
    signalColor: '#1f2a24',
    signalTextColor: '#1f2a24',
    labelBoxBkgColor: agentColors.greenTint,
    labelBoxBorderColor: agentColors.green,
    noteBkgColor: agentColors.amberTint,
    noteBorderColor: agentColors.amberLine,
    noteTextColor: '#1f2a24',
    activationBkgColor: agentColors.greenLine,
    activationBorderColor: agentColors.green,
    fontSize: '16px',
};

/**
 * Configuration: `securityLevel: 'strict'` (labels are sanitized, no click directives, no JS), no HTML labels
 * (otherwise <foreignObject> with HTML), no fonts from the network. `secure` forbids the diagram to override these
 * keys via `%%{init: …}%%`.
 */
export function mermaidConfig(): MermaidConfig {
    return {
        startOnLoad: false,
        securityLevel: 'strict',
        htmlLabels: false,
        theme: 'base',
        themeVariables: MERMAID_THEME_VARIABLES,
        darkMode: false,
        // A system font: the SVG is shown as <img>, which cannot use the page's web fonts, and mermaid measures the
        // labels in the page. With a web font the measured and the shown text would differ in width.
        fontFamily: 'Helvetica, Arial, sans-serif',
        suppressErrorRendering: true,
        maxTextSize: 50_000,
        // Tighter than mermaid's defaults: the 400 px panel shrinks a diagram to its width, and every pixel of
        // spacing costs font size there.
        flowchart: { htmlLabels: false, nodeSpacing: 32, rankSpacing: 36, padding: 10 },
        sequence: { width: 120, actorMargin: 32, messageMargin: 30, boxMargin: 8 },
        secure: [
            'secure',
            'securityLevel',
            'startOnLoad',
            'maxTextSize',
            'suppressErrorRendering',
            'maxEdges',
            'htmlLabels',
            'themeCSS',
            'fontFamily',
            'altFontFamily',
            'theme',
            'themeVariables',
            'darkMode',
        ],
    };
}

/**
 * Renderer with a cache per source. `load` fetches the library on the first call; drawing happens one after another
 * because mermaid has global state (initialize, temporary nodes in the document).
 */
export function createMermaidRenderer(load: () => Promise<MermaidModule>) {
    let mod: Promise<MermaidModule> | undefined;
    let queue: Promise<unknown> = Promise.resolve();
    let initialized = false;
    let seq = 0;
    const cache = new Map<string, Promise<MermaidOutcome>>();

    const draw = async (code: string): Promise<MermaidOutcome> => {
        try {
            mod ??= load();
            const { api, sanitize } = await mod;
            if (!initialized) {
                api.initialize(mermaidConfig());
                initialized = true;
            }
            const { svg } = await api.render(`agent-mermaid-${++seq}`, code);
            return { ok: true, svg: sanitize(svg) };
        } catch (e) {
            // retry a failed load at the next diagram
            if (
                mod &&
                (await mod.then(
                    () => false,
                    () => true,
                ))
            ) {
                mod = undefined;
                cache.clear();
            }
            return { ok: false, error: e instanceof Error ? e.message : String(e) };
        }
    };

    return {
        render(code: string): Promise<MermaidOutcome> {
            let p = cache.get(code);
            if (!p) {
                p = queue.then(() => draw(code));
                queue = p;
                cache.set(code, p);
            }
            return p;
        },
    };
}

/** Shared renderer of the UI; the library comes as a separate chunk (dynamic import). */
export const mermaidRenderer = createMermaidRenderer(() => import('./mermaidLoad').then((m) => m.loadMermaid()));
