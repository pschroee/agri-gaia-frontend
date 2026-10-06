// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Files of a chat: attachments the user uploads for the agent (inputs, POST /chats/{id}/files) and results the agent
// hands over (outputs, after approval). Attachments go with a message by name; the gateway appends them to its text
// as a fixed block (API.md, "Attachments to messages"), which the transcript splits off again.
// Pure logic, used by ChatInput, useChatStream, Conversation and ArtifactStrip.

import type { Approval, Artifact } from './types';

/** Head of the attachments block the gateway appends to a user message (internal/chat/manager.go). */
export const ATTACHMENTS_HEADER = '[Attachments in /workspace/inputs/]';
/** Text the gateway sends for a message with attachments only. */
const ONLY_ATTACHMENTS = 'See attachments.';

/** Splits the attachments block off a stored user message: the text before it and the file names in it. */
export function splitAttachments(message: string): { text: string; files: string[] } {
    const at = message.lastIndexOf(ATTACHMENTS_HEADER);
    if (at < 0) return { text: message, files: [] };
    const lines = message
        .slice(at + ATTACHMENTS_HEADER.length)
        .replace(/\s+$/, '')
        .split('\n')
        .slice(1);
    if (lines.length === 0 || !lines.every((l) => l.startsWith('- ') && l.length > 2)) {
        return { text: message, files: [] };
    }
    let text = message.slice(0, at).replace(/\s+$/, '');
    if (text === ONLY_ATTACHMENTS) text = '';
    return { text, files: lines.map((l) => l.slice(2)) };
}

/** Text of a message with attachments as the gateway hands it to pi (for the pending bubble and the queue). */
export function withAttachments(text: string, files: string[]): string {
    const t = text.trim();
    if (files.length === 0) return t;
    return `${t || ONLY_ATTACHMENTS}\n\n${ATTACHMENTS_HEADER}\n${files.map((f) => `- ${f}`).join('\n')}`;
}

/** Bytes as "512 B", "1.4 KB", "12.3 MB" (base 1024, as the gateway's limit). */
export function formatBytes(n: number | undefined): string {
    if (n === undefined || !Number.isFinite(n) || n < 0) return '–';
    if (n < 1024) return `${n} B`;
    const units = ['KB', 'MB', 'GB'];
    let v = n / 1024;
    let u = 0;
    while (v >= 1024 && u < units.length - 1) {
        v /= 1024;
        u++;
    }
    return `${v >= 100 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, '')} ${units[u]}`;
}

/**
 * Size check before uploading: files above the gateway's limit per file (artifact_max_mb) are left out and named.
 * Without a known limit everything goes; the gateway checks again. Empty files are allowed.
 */
export function checkSizes<F extends { name: string; size: number }>(
    files: F[],
    maxMb: number | undefined,
): { ok: F[]; tooBig: F[]; error?: string } {
    if (!maxMb || maxMb <= 0) return { ok: files, tooBig: [] };
    const limit = maxMb * 1024 * 1024;
    const tooBig = files.filter((f) => f.size > limit);
    const ok = files.filter((f) => f.size <= limit);
    const error = tooBig.length
        ? `Too large (at most ${maxMb} MB per file): ${tooBig.map((f) => f.name).join(', ')}`
        : undefined;
    return { ok, tooBig, error };
}

/** Attachments of the message being written: uploaded inputs, an upload in flight and its last failure. */
export type StagedState = { files: Artifact[]; uploading: number; error?: string };

export const emptyStaged: StagedState = { files: [], uploading: 0 };

export type StagedAction =
    | { type: 'upload_start' }
    /** Uploaded: replaces staged files of the same name (the gateway overwrites the input as well). */
    | { type: 'upload_done'; files: Artifact[] }
    | { type: 'upload_failed'; error: string }
    /** Files refused before uploading (size check); the others go on. */
    | { type: 'refused'; error: string }
    | { type: 'remove'; name: string }
    /** Sent: the attachments went with the message. */
    | { type: 'clear' }
    /** Sending failed: the attachments come back (in front of ones staged meanwhile). */
    | { type: 'restore'; files: Artifact[] };

const mergeByName = (base: Artifact[], add: Artifact[]) => [
    ...base.filter((b) => !add.some((a) => a.name === b.name)),
    ...add,
];

export function stagedReducer(state: StagedState, action: StagedAction): StagedState {
    switch (action.type) {
        case 'upload_start':
            return { ...state, uploading: state.uploading + 1, error: undefined };
        case 'upload_done':
            return {
                ...state,
                uploading: Math.max(0, state.uploading - 1),
                files: mergeByName(state.files, action.files),
            };
        case 'upload_failed':
            return { ...state, uploading: Math.max(0, state.uploading - 1), error: action.error };
        case 'refused':
            return { ...state, error: action.error };
        case 'remove':
            return { ...state, files: state.files.filter((f) => f.name !== action.name), error: undefined };
        case 'clear':
            return { ...state, files: [], error: undefined };
        case 'restore':
            return { ...state, files: mergeByName(action.files, state.files) };
        default:
            return state;
    }
}

/** Can the message be sent? Text or at least one attachment, and no upload in flight (it would be left out). */
export function canSend(text: string, staged: StagedState): boolean {
    return staged.uploading === 0 && (text.trim() !== '' || staged.files.length > 0);
}

/** How an artifact is shown: raster image with a thumbnail, otherwise as a file. */
export type PreviewKind = 'image' | 'file';

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const IMAGE_EXT = /\.(png|jpe?g|gif|webp)$/i;

/**
 * Content type (the gateway determines it from content and extension) and extension must both say raster image,
 * so a renamed HTML file is never shown as an image. SVG is a file: it is text that may carry script.
 */
export function previewKind(a: Pick<Artifact, 'name' | 'content_type'>): PreviewKind {
    const ct = (a.content_type ?? '').split(';')[0].trim().toLowerCase();
    return IMAGE_TYPES.has(ct) && IMAGE_EXT.test(a.name) ? 'image' : 'file';
}

/** Adds or replaces artifacts (same kind and name), e.g. from an upload or the SSE event "artifact". */
export function mergeArtifacts(list: Artifact[], add: Artifact[]): Artifact[] {
    const key = (a: Artifact) => `${a.kind}/${a.name}`;
    const keys = new Set(add.map(key));
    return [...list.filter((a) => !keys.has(key(a))), ...add];
}

/** Results of the agent and the user's uploads, each newest first. */
export function splitArtifacts(list: Artifact[] | undefined): { outputs: Artifact[]; inputs: Artifact[] } {
    const all = (Array.isArray(list) ? list : []).slice().sort((x, y) => y.created_at.localeCompare(x.created_at));
    return { outputs: all.filter((a) => a.kind !== 'input'), inputs: all.filter((a) => a.kind === 'input') };
}

/** One line for the collapsed artifact strip: "2 results · 1 upload". */
export function artifactSummary(list: Artifact[] | undefined): string {
    const { outputs, inputs } = splitArtifacts(list);
    const parts = [];
    if (outputs.length) parts.push(`${outputs.length} ${outputs.length === 1 ? 'result' : 'results'}`);
    if (inputs.length) parts.push(`${inputs.length} ${inputs.length === 1 ? 'upload' : 'uploads'}`);
    return parts.join(' · ') || 'No files yet';
}

/** What the approval card shows for a result file the agent wants to hand over (kind artifact_upload). */
export function artifactApprovalView(a: Pick<Approval, 'name' | 'size' | 'content_type' | 'preview' | 'via'>): {
    name: string;
    size: string;
    type: string;
    preview?: string;
    image: boolean;
} {
    const type = (a.content_type ?? '').split(';')[0].trim() || 'unknown type';
    const image = previewKind({ name: a.name, content_type: type }) === 'image';
    const preview = a.preview?.trim() ? a.preview : undefined;
    return { name: a.name, size: formatBytes(a.size), type, preview: image ? undefined : preview, image };
}
