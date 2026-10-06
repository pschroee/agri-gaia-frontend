// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Images in the agent's answers (gateway API.md, "Display images"; port of the gateway's web/src/lib/images.ts).
// The UI never loads foreign addresses: through an image address, data from the sandbox could reach a foreign server
// without the user having allowed internet access (Markdown image exfiltration). Local paths in the sandbox are
// fetched by the gateway, which checks and serves them; data: raster images stay in the browser; SVG never.
// The rules match the gateway's internal/chat/images.go (NormalizeImagePath, MessageImageKey).

import { imageUrl } from './api';

const ROOTS = ['/workspace', '/tmp', '/home/agent'];
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const DATA_IMAGE = /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=\s]+$/;
const MSG_ID = /^[A-Za-z0-9._:-]{1,128}$/;
// control characters are rejected on purpose
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;

function decode(s: string): string {
    if (!s.includes('%')) return s;
    try {
        return decodeURIComponent(s);
    } catch {
        return s;
    }
}

/** Cleans an absolute POSIX path (`.`, `..`, double `/`). */
function cleanPath(p: string): string {
    const out: string[] = [];
    for (const part of p.split('/')) {
        if (part === '' || part === '.') continue;
        if (part === '..') out.pop();
        else out.push(part);
    }
    return `/${out.join('/')}`;
}

/**
 * Local image path in the sandbox, absolute and cleaned; relative paths start at /workspace. `undefined` for foreign
 * addresses (any scheme, `//host`) and for locations outside /workspace, /tmp and /home/agent.
 */
export function sandboxImagePath(src: string): string | undefined {
    let p = decode(src.trim());
    if (p.startsWith('file://')) {
        p = p.slice('file://'.length);
        if (!p.startsWith('/')) return undefined;
    }
    if (!p || p.length > 1024 || p.startsWith('//') || SCHEME.test(p) || CONTROL.test(p)) return undefined;
    if (!p.startsWith('/')) p = `/workspace/${p}`;
    p = cleanPath(p);
    return ROOTS.some((r) => p.startsWith(`${r}/`)) ? p : undefined;
}

export type ImageSource =
    /** From the sandbox, through the gateway. */
    | { kind: 'sandbox'; url: string; path: string }
    /** Embedded (data:), raster formats only. */
    | { kind: 'data'; url: string }
    /** Local path, but the answer is not finished yet (no ID to fetch it by). */
    | { kind: 'pending'; path: string }
    /** Not loaded (foreign address, SVG, outside the allowed locations). */
    | { kind: 'blocked'; src: string };

/** Where an image of an answer may be loaded from; ctx: the chat and the answer's ID (messageImageKey). */
export function imageSource(src: string | undefined, ctx?: { chatId?: string; msgId?: string }): ImageSource {
    const s = (src ?? '').trim();
    if (DATA_IMAGE.test(s)) return { kind: 'data', url: s };
    const path = s ? sandboxImagePath(s) : undefined;
    if (!path) return { kind: 'blocked', src: s };
    if (!ctx?.chatId || !ctx.msgId) return { kind: 'pending', path };
    return { kind: 'sandbox', path, url: imageUrl(ctx.chatId, path, ctx.msgId) };
}

/** ID of an answer for its images: responseId, otherwise ts-<timestamp> (as the gateway). */
export function messageImageKey(m: { responseId?: unknown; timestamp?: unknown } | undefined): string | undefined {
    if (!m) return undefined;
    if (typeof m.responseId === 'string' && MSG_ID.test(m.responseId)) return m.responseId;
    if (typeof m.timestamp === 'number' && Number.isFinite(m.timestamp) && m.timestamp > 0) return `ts-${m.timestamp}`;
    return undefined;
}

/** Markdown image `![alt](src "title")` inside a line. */
export const MARKDOWN_IMAGE = /!\[([^\]]*)\]\(\s*(<[^>]*>|[^)\s]+)(?:\s+"[^"]*")?\s*\)/;

/** Parses one Markdown image; the address may stand in angle brackets. */
export function parseMarkdownImage(s: string): { alt: string; src: string } | undefined {
    const m = new RegExp(`^${MARKDOWN_IMAGE.source}$`).exec(s);
    if (!m) return undefined;
    const raw = m[2];
    return { alt: m[1], src: raw.startsWith('<') ? raw.slice(1, -1) : raw };
}
