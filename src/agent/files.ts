// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Files of a chat: attachments the user uploads for the agent (inputs, POST /chats/{id}/files) and results the agent
// hands over (outputs, after approval). Attachments go with a message by name; the gateway appends them to its text
// as a fixed block (API.md, "Attachments to messages"), which the transcript splits off again.
// Pure logic, used by ChatInput, useChatStream and Conversation.

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
 * Formats the agent reads (gateway skill `documents`, issue #42): Office files and PDF are converted in the sandbox,
 * text and images are read directly. Any other file can still be attached; the gateway checks only the size.
 */
export const READABLE_FORMATS = 'Word, Excel, PowerPoint, PDF, CSV, text, HTML, EPUB and images';

/** Tooltip of the paperclip: the readable formats, the size limit when known and where the files land. */
export function attachHint(maxMb: number | undefined): string {
    const limit = maxMb && maxMb > 0 ? `, at most ${maxMb} MB each` : '';
    return `Attach files (${READABLE_FORMATS}${limit}). They are placed under /workspace/inputs/.`;
}

/**
 * Text of a failed upload. The gateway refuses a file above its limit with 413 and "<name> is larger than <n> MB";
 * a proxy in front may answer 413 without that text. Both become a size message instead of "Upload failed: 413 …".
 */
export function uploadErrorText(e: unknown, maxMb: number | undefined): string {
    const message = e instanceof Error ? e.message : String(e);
    const status = typeof e === 'object' && e !== null && 'status' in e ? (e as { status: unknown }).status : undefined;
    if (status === 413) {
        if (/ is larger than \d+ MB$/.test(message)) return `Not uploaded: ${message} (the limit per file).`;
        const limit = maxMb && maxMb > 0 ? ` (at most ${maxMb} MB per file)` : '';
        return `Not uploaded: the file is too large for the server${limit}.`;
    }
    return `Upload failed: ${message}`;
}

/**
 * Size check before uploading: files above the gateway's limit per file (artifact_max_mb) are left out and named
 * with their size. Without a known limit everything goes; the gateway checks again. Empty files are allowed.
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
        ? `Not uploaded, larger than ${maxMb} MB per file: ${tooBig
              .map((f) => `${f.name} (${formatBytes(f.size)})`)
              .join(', ')}`
        : undefined;
    return { ok, tooBig, error };
}

/** A file on its way to the gateway: shown as a tile with its progress until the gateway has stored it. */
export type UploadInFlight = { id: string; name: string; size: number; content_type?: string; progress: number };

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

/** "Uploading 71%" on the tile of a file in flight. */
export function uploadingText(progress: number): string {
    return `Uploading ${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`;
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

/** Kind of file for the type icon of an attachment tile (only the icon; whether an image previews is previewKind). */
export type FileType = 'image' | 'pdf' | 'word' | 'spreadsheet' | 'presentation' | 'text' | 'archive' | 'file';

const EXT_GROUPS: [FileType, string][] = [
    ['image', 'png jpg jpeg gif webp svg bmp tif tiff heic'],
    ['pdf', 'pdf'],
    ['word', 'doc docx odt rtf'],
    ['spreadsheet', 'xls xlsx xlsm ods'],
    ['presentation', 'ppt pptx odp'],
    ['text', 'txt md csv tsv json jsonl xml yaml yml log html htm py ipynb ts js sh'],
    ['archive', 'zip tar gz tgz bz2 xz 7z rar'],
];
const TYPE_BY_EXT = new Map(EXT_GROUPS.flatMap(([t, exts]) => exts.split(' ').map((e) => [e, t] as const)));

/** Content types that name the kind where the extension does not (no or unknown extension). */
function typeOfContentType(ct: string): FileType {
    if (ct.startsWith('image/')) return 'image';
    if (ct === 'application/pdf') return 'pdf';
    if (ct === 'application/msword' || ct.includes('wordprocessingml') || ct.includes('opendocument.text')) {
        return 'word';
    }
    if (ct === 'application/vnd.ms-excel' || ct.includes('spreadsheetml') || ct.includes('opendocument.spreadsheet')) {
        return 'spreadsheet';
    }
    if (
        ct === 'application/vnd.ms-powerpoint' ||
        ct.includes('presentationml') ||
        ct.includes('opendocument.presentation')
    ) {
        return 'presentation';
    }
    if (/^application\/(zip|gzip|x-gzip|x-tar|x-7z-compressed|x-rar-compressed|vnd\.rar|x-bzip2|x-xz)$/.test(ct)) {
        return 'archive';
    }
    if (ct.startsWith('text/') || /^application\/(json|xml|x-yaml|yaml)$/.test(ct)) return 'text';
    return 'file';
}

/** Type icon of a file: by extension, else by content type, else a generic file. */
export function fileTypeOf(a: { name: string; content_type?: string }): FileType {
    const ext = /\.([a-z0-9]{1,8})$/i.exec(a.name)?.[1]?.toLowerCase();
    const byExt = ext ? TYPE_BY_EXT.get(ext) : undefined;
    if (byExt) return byExt;
    return typeOfContentType((a.content_type ?? '').split(';')[0].trim().toLowerCase());
}

/** Label of a file type for tooltips and screen readers. */
export const FILE_TYPE_LABEL: Record<FileType, string> = {
    image: 'Image',
    pdf: 'PDF',
    word: 'Word document',
    spreadsheet: 'Spreadsheet',
    presentation: 'Presentation',
    text: 'Text file',
    archive: 'Archive',
    file: 'File',
};

/**
 * A file name split for truncation in the middle: head shrinks with an ellipsis, tail (the last characters of the
 * stem and the extension) stays visible, so "8252768…9992.jpg" keeps the type readable. An extension longer than
 * eight characters counts as part of the stem. Head and tail joined give the name again.
 */
export function splitFileName(name: string, keep = 4): { head: string; tail: string } {
    const dot = name.lastIndexOf('.');
    const hasExt = dot > 0 && name.length - dot - 1 >= 1 && name.length - dot - 1 <= 8;
    const stemEnd = hasExt ? dot : name.length;
    const cut = Math.max(0, stemEnd - keep);
    // a short name stays whole in the head (no point in a tail of the full name)
    if (cut === 0) return { head: name, tail: '' };
    return { head: name.slice(0, cut), tail: name.slice(cut) };
}

/** Text form of the middle truncation (for places that cannot measure): at most max characters, extension kept. */
export function truncateMiddle(name: string, max = 24, keep = 4): string {
    const chars = Array.from(name);
    if (chars.length <= max) return name;
    const { tail } = splitFileName(name, keep);
    const t = Array.from(tail);
    const tailPart = t.length + 2 > max ? t.slice(t.length - (max - 2)) : t;
    return `${chars.slice(0, Math.max(1, max - 1 - tailPart.length)).join('')}…${tailPart.join('')}`;
}

/**
 * Short type for a file card: the extension in capitals ("PDF", "PNG", "CSV") when it has a short one, else the name
 * of its kind ("Image", "File").
 */
export function fileTypeTag(a: { name: string; content_type?: string }): string {
    const ext = /\.([a-z0-9]{1,5})$/i.exec(a.name)?.[1];
    if (ext) return ext.toUpperCase();
    return FILE_TYPE_LABEL[fileTypeOf(a)];
}

/** Second line of a file card: "731 KB · PDF"; only the type while the size is unknown. */
export function fileMeta(a: { name: string; size?: number; content_type?: string }): string {
    const tag = fileTypeTag(a);
    return a.size !== undefined && Number.isFinite(a.size) && a.size >= 0 ? `${formatBytes(a.size)} · ${tag}` : tag;
}

/** The parts of a transcript item that placeOutputs needs (agent answers with their steps and start). */
type PlacedItem = {
    kind: string;
    key: string;
    at?: string;
    parts?: { type: string; steps?: { id: string }[] }[];
};

/**
 * Places the results the agent handed over (outputs) under the answer that produced them (issue #54): by the tool
 * call that handed them over, else by time, under the last answer that started before the file was stored (the first
 * answer for an older file). Inputs are not placed here; they stand above the user message that names them. What
 * cannot be placed (no answer at all) comes back as `unplaced`, so no file is lost. Each list oldest first.
 */
export function placeOutputs(
    items: PlacedItem[],
    artifacts: Artifact[] | undefined,
): { byItem: Map<string, Artifact[]>; unplaced: Artifact[] } {
    const byItem = new Map<string, Artifact[]>();
    const unplaced: Artifact[] = [];
    const outputs = (artifacts ?? [])
        .filter((a) => a.kind === 'output')
        .sort((x, y) => x.created_at.localeCompare(y.created_at));
    if (outputs.length === 0) return { byItem, unplaced };
    const answers = items.filter((it) => it.kind === 'agent');
    const byCall = new Map<string, string>();
    for (const it of answers)
        for (const p of it.parts ?? []) for (const s of p.steps ?? []) byCall.set(s.id, it.key);
    const add = (key: string, a: Artifact) => byItem.set(key, [...(byItem.get(key) ?? []), a]);
    const time = (s: string | undefined) => (s ? Date.parse(s) : NaN);
    for (const a of outputs) {
        const call = a.tool_call_id ? byCall.get(a.tool_call_id) : undefined;
        if (call) {
            add(call, a);
            continue;
        }
        if (answers.length === 0) {
            unplaced.push(a);
            continue;
        }
        const at = time(a.created_at);
        let target: string | undefined;
        for (const it of answers) {
            const t = time(it.at);
            // the live answer has no time yet: it takes files by its tool calls only
            if (!Number.isNaN(t) && t <= at) target = it.key;
        }
        add(target ?? answers[0].key, a);
    }
    return { byItem, unplaced };
}
