// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import {
    artifactApprovalView,
    artifactSummary,
    canSend,
    checkSizes,
    emptyStaged,
    formatBytes,
    mergeArtifacts,
    previewKind,
    splitArtifacts,
    splitAttachments,
    stagedReducer,
    withAttachments,
} from './files';
import { emptyQueue, queueReducer, queueRows } from './queue';
import { buildTranscript } from './transcript';
import type { Artifact, StoredMessage } from './types';

const art = (name: string, extra: Partial<Artifact> = {}): Artifact => ({
    chat_id: 'c1',
    kind: 'input',
    name,
    size: 100,
    sha256: 'x',
    content_type: 'text/plain',
    created_at: '2026-10-06T10:00:00Z',
    via: 'ui',
    ...extra,
});

describe('splitAttachments / withAttachments', () => {
    it('splits the block the gateway appends', () => {
        const msg = 'Count the rows.\n\n[Attachments in /workspace/inputs/]\n- data.csv\n- image.png';
        expect(splitAttachments(msg)).toEqual({ text: 'Count the rows.', files: ['data.csv', 'image.png'] });
    });

    it('drops the placeholder text of a message with attachments only', () => {
        expect(splitAttachments(withAttachments('', ['a.csv']))).toEqual({ text: '', files: ['a.csv'] });
    });

    it('leaves a message without a well-formed block alone', () => {
        expect(splitAttachments('plain')).toEqual({ text: 'plain', files: [] });
        const odd = 'x\n\n[Attachments in /workspace/inputs/]\nnot a list';
        expect(splitAttachments(odd)).toEqual({ text: odd, files: [] });
    });

    it('round-trips, ignoring trailing white space', () => {
        expect(withAttachments(' hi ', [])).toBe('hi');
        expect(splitAttachments(`${withAttachments('hi', ['a b.txt'])}\n`)).toEqual({ text: 'hi', files: ['a b.txt'] });
    });
});

describe('formatBytes', () => {
    it('formats with base 1024', () => {
        expect(formatBytes(0)).toBe('0 B');
        expect(formatBytes(1023)).toBe('1023 B');
        expect(formatBytes(1536)).toBe('1.5 KB');
        expect(formatBytes(1024 * 1024)).toBe('1 MB');
        expect(formatBytes(250 * 1024 * 1024)).toBe('250 MB');
        expect(formatBytes(undefined)).toBe('–');
        expect(formatBytes(-1)).toBe('–');
    });
});

describe('checkSizes', () => {
    const files = [
        { name: 'small.csv', size: 10 },
        { name: 'exact.bin', size: 2 * 1024 * 1024 },
        { name: 'big.zip', size: 2 * 1024 * 1024 + 1 },
    ];

    it('leaves out files above the limit per file and names them', () => {
        const r = checkSizes(files, 2);
        expect(r.ok.map((f) => f.name)).toEqual(['small.csv', 'exact.bin']);
        expect(r.tooBig.map((f) => f.name)).toEqual(['big.zip']);
        expect(r.error).toBe('Too large (at most 2 MB per file): big.zip');
    });

    it('lets everything through without a known limit', () => {
        expect(checkSizes(files, undefined)).toEqual({ ok: files, tooBig: [] });
        expect(checkSizes(files, 0).tooBig).toEqual([]);
    });
});

describe('stagedReducer', () => {
    it('counts uploads and stages the uploaded files, replacing same names', () => {
        let s = stagedReducer(emptyStaged, { type: 'upload_start' });
        expect(canSend('', s)).toBe(false);
        s = stagedReducer(s, { type: 'upload_done', files: [art('a.csv'), art('b.png')] });
        s = stagedReducer(s, { type: 'upload_start' });
        s = stagedReducer(s, { type: 'upload_done', files: [art('a.csv', { size: 5 })] });
        expect(s.uploading).toBe(0);
        expect(s.files.map((f) => `${f.name}:${f.size}`)).toEqual(['b.png:100', 'a.csv:5']);
        expect(canSend('', s)).toBe(true);
    });

    it('keeps staged files on a failed upload and blocks sending while one is in flight', () => {
        let s = stagedReducer(emptyStaged, { type: 'upload_start' });
        s = stagedReducer(s, { type: 'upload_done', files: [art('a.csv')] });
        s = stagedReducer(s, { type: 'upload_start' });
        expect(canSend('text', s)).toBe(false);
        s = stagedReducer(s, { type: 'upload_failed', error: 'Upload failed: 413' });
        expect(s).toMatchObject({ uploading: 0, error: 'Upload failed: 413' });
        expect(s.files).toHaveLength(1);
    });

    it('removes, clears after sending and restores after a failed send', () => {
        let s = stagedReducer(emptyStaged, { type: 'upload_start' });
        s = stagedReducer(s, { type: 'upload_done', files: [art('a.csv'), art('b.csv')] });
        s = stagedReducer(s, { type: 'remove', name: 'a.csv' });
        expect(s.files.map((f) => f.name)).toEqual(['b.csv']);
        const sent = s.files;
        s = stagedReducer(s, { type: 'clear' });
        expect(s.files).toEqual([]);
        // a new file staged while the send was in flight stays behind the restored ones
        s = stagedReducer(s, { type: 'upload_start' });
        s = stagedReducer(s, { type: 'upload_done', files: [art('c.csv')] });
        s = stagedReducer(s, { type: 'restore', files: sent });
        expect(s.files.map((f) => f.name)).toEqual(['b.csv', 'c.csv']);
    });

    it('notes refused files without touching the staged ones', () => {
        const s = stagedReducer(emptyStaged, { type: 'refused', error: 'Too large' });
        expect(s).toEqual({ files: [], uploading: 0, error: 'Too large' });
        expect(canSend('  ', s)).toBe(false);
    });
});

describe('previewKind', () => {
    it('needs content type and extension of a raster image', () => {
        expect(previewKind({ name: 'plot.png', content_type: 'image/png' })).toBe('image');
        expect(previewKind({ name: 'p.JPG', content_type: 'image/jpeg; q=1' })).toBe('image');
        expect(previewKind({ name: 'plot.html', content_type: 'image/png' })).toBe('file');
        expect(previewKind({ name: 'plot.png', content_type: 'text/html' })).toBe('file');
        expect(previewKind({ name: 'logo.svg', content_type: 'image/svg+xml' })).toBe('file');
    });
});

describe('artifact list', () => {
    const list = [
        art('in.csv', { created_at: '2026-10-06T09:00:00Z' }),
        art('old.png', { kind: 'output', created_at: '2026-10-06T08:00:00Z' }),
        art('new.png', { kind: 'output', created_at: '2026-10-06T11:00:00Z' }),
    ];

    it('splits results and uploads, newest first', () => {
        const { outputs, inputs } = splitArtifacts(list);
        expect(outputs.map((a) => a.name)).toEqual(['new.png', 'old.png']);
        expect(inputs.map((a) => a.name)).toEqual(['in.csv']);
        expect(splitArtifacts(undefined)).toEqual({ outputs: [], inputs: [] });
    });

    it('merges by kind and name', () => {
        const merged = mergeArtifacts(list, [art('old.png', { kind: 'output', size: 1 }), art('old.png')]);
        expect(merged).toHaveLength(4);
        expect(merged.find((a) => a.kind === 'output' && a.name === 'old.png')?.size).toBe(1);
    });

    it('summarises the counts', () => {
        expect(artifactSummary(list)).toBe('2 results · 1 upload');
        expect(artifactSummary([])).toBe('No files yet');
    });
});

describe('artifactApprovalView', () => {
    it('shows name, size and type, the text preview only for non-images', () => {
        expect(
            artifactApprovalView({ name: 'counts.csv', size: 2048, content_type: 'text/csv', preview: 'a,b\n1,2', via: 'cli' }),
        ).toEqual({ name: 'counts.csv', size: '2 KB', type: 'text/csv', preview: 'a,b\n1,2', image: false });
        expect(
            artifactApprovalView({ name: 'plot.png', size: 10, content_type: 'image/png', preview: '\u0089PNG', via: 'mcp' }),
        ).toMatchObject({ type: 'image/png', preview: undefined, image: true });
        expect(artifactApprovalView({ name: 'x', size: 0, content_type: '', preview: '  ', via: 'cli' })).toMatchObject({
            type: 'unknown type',
            preview: undefined,
        });
    });
});

describe('transcript with files', () => {
    const ctx = { approvals: [], socketCalls: [], executions: [], running: false };
    const user = (seq: number, text: string, extra: Partial<StoredMessage> = {}): StoredMessage => ({
        seq,
        role: 'user',
        created_at: '2026-10-06T10:00:00Z',
        message: { role: 'user', content: [{ type: 'text', text }] },
        ...extra,
    });

    it('puts the attachments on the user item, text without the block', () => {
        const items = buildTranscript([user(1, withAttachments('Count rows', ['a.csv', 'b.png']))], ctx);
        expect(items).toEqual([{ kind: 'user', key: 'u1', seq: 1, text: 'Count rows', files: ['a.csv', 'b.png'] }]);
    });

    it('keeps a message with attachments only', () => {
        const items = buildTranscript([user(1, withAttachments('', ['a.csv']))], ctx);
        expect(items).toEqual([{ kind: 'user', key: 'u1', seq: 1, text: '', files: ['a.csv'] }]);
    });

    it('gives the attachments of a mixed message to its last user part', () => {
        const note = '[Note from the orchestrator, not from the user] background task bg1 ended';
        const msg = user(2, withAttachments(`${note}\nfirst`, ['x.txt']), {
            origin: 'mixed',
            sources: [{ kind: 'system', type: 'background', refs: ['bg1'] }, { kind: 'user' }],
        });
        const items = buildTranscript([msg], ctx);
        expect(items.map((i) => i.kind)).toEqual(['notice', 'user']);
        expect(items[1]).toMatchObject({ text: 'first', files: ['x.txt'] });
    });

    it('keys the text of an answer by its responseId or timestamp for its images', () => {
        const answer = (seq: number, message: Partial<StoredMessage['message']>): StoredMessage => ({
            seq,
            role: 'assistant',
            created_at: '2026-10-06T10:00:00Z',
            message: { role: 'assistant', content: [{ type: 'text', text: '![Plot](plot.png)' }], ...message },
        });
        const items = buildTranscript(
            [answer(1, { responseId: 'resp-1', timestamp: 3 }), user(2, 'next'), answer(3, { timestamp: 42 })],
            ctx,
        );
        const keys = items.flatMap((i) => (i.kind === 'agent' ? i.parts.map((p) => p.type === 'text' && p.imageKey) : []));
        expect(keys).toEqual(['resp-1', 'ts-42']);
    });
});

describe('queue rows with attachments', () => {
    it('shows the attachments of a message that is being queued', () => {
        const s = queueReducer(emptyQueue, { type: 'local_add', item: { key: 'k', text: '', attachments: ['a.csv'] } });
        expect(queueRows(s, { running: true, queue_held: false })[0]).toMatchObject({
            text: '',
            attachments: ['a.csv'],
            state: 'sending',
        });
    });
});
