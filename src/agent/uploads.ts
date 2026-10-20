// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The files of an upload approval (gateway issue #164). The approval carries a summary (number, size, folders, file
// types, annotation file) and the SHA-256 over the list of every file; the list itself is fetched when the user opens
// it, so no approval event carries up to 2 000 entries.

/** One file of the upload: form field, path in the sandbox, size and SHA-256 of the bytes the gateway read. */
export type UploadEntry = { field: string; path: string; bytes: number; sha256: string };

/** Files of one folder; path is relative to the manifest's root, "." is the root itself. */
export type UploadFolder = { path: string; files: number; bytes: number };

/** Files of one extension ("(none)" without one). */
export type UploadExt = { ext: string; files: number };

/** The summary on the approval (field `uploads`); `entries` only comes with the separate fetch. */
export type UploadManifest = {
    files: number;
    bytes: number;
    root: string;
    folders: UploadFolder[];
    extensions: UploadExt[];
    annotation?: UploadEntry;
    manifest_sha256: string;
    entries?: UploadEntry[];
};

/** The path of a file relative to the root of the manifest; a path outside the root stays as it is. */
export function relativePath(root: string, path: string): string {
    if (!root || root === '/') return path.replace(/^\//, '');
    return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;
}

/** The text the gateway takes the manifest hash over: one line per file in sending order, tab separated. */
export function manifestLines(entries: UploadEntry[]): string {
    return entries.map((e) => `${e.field}\t${e.path}\t${e.bytes}\t${e.sha256}\n`).join('');
}

/**
 * Recomputes the manifest hash from the list the card shows. Undefined where the browser has no SubtleCrypto (plain
 * http, old test environments): the card then shows the list without the verification line.
 */
export async function manifestHash(entries: UploadEntry[]): Promise<string | undefined> {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) return undefined;
    const digest = await subtle.digest('SHA-256', new TextEncoder().encode(manifestLines(entries)));
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** "folder" for the root row of the table. */
export const folderLabel = (path: string) => (path === '.' ? '(top level)' : path);

/** Up to this many files the gateway lists in the summary, one line each; above it the card shows the manifest. */
export const LISTED_FILES = 10;
