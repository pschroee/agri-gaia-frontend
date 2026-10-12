// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// How a file of the chat is previewed (issue #74). The gateway decides the kind from the bytes and sends it as
// `preview`; without it (artifacts from before) the extension decides. HTML, HTM and SVG are always text: they are shown
// as source and never rendered. Pure logic, used by FilePreviewDialog and the attachment cards.

import { artifactUrl } from './api';
import type { ArtifactKind } from './types';

export type FilePreviewKind = 'image' | 'pdf' | 'table' | 'text' | 'none';

const KINDS: readonly string[] = ['image', 'pdf', 'table', 'text', 'none'];
const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);
const TEXT_EXT = new Set([
    'txt', 'md', 'json', 'jsonl', 'log', 'yaml', 'yml', 'xml', 'py', 'ts', 'js', 'sh', 'ipynb', 'html', 'htm', 'svg',
]);

function extensionOf(name: string): string {
    const dot = name.lastIndexOf('.');
    return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

/** Preview kind of a file: the gateway's `preview`, else the extension as a fallback. */
export function previewOf(file: { name: string; preview?: string }): FilePreviewKind {
    if (file.preview && KINDS.includes(file.preview)) return file.preview as FilePreviewKind;
    const ext = extensionOf(file.name);
    if (IMAGE_EXT.has(ext)) return 'image';
    if (ext === 'pdf') return 'pdf';
    if (ext === 'csv' || ext === 'tsv') return 'table';
    if (TEXT_EXT.has(ext)) return 'text';
    return 'none';
}

/** Address of the file for the preview (inline=1): the gateway's download address with the preview headers. */
export function inlineUrl(chatId: string, name: string, kind: ArtifactKind = 'output'): string {
    return `${artifactUrl(chatId, name, kind)}&inline=1`;
}
