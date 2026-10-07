// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import {
    artifactApprovalView,
    attachHint,
    canSend,
    checkSizes,
    emptyStaged,
    fileMeta,
    fileTypeOf,
    fileTypeTag,
    formatBytes,
    mergeArtifacts,
    pastedFiles,
    placeOutputs,
    previewKind,
    READABLE_FORMATS,
    splitAttachments,
    splitFileName,
    stagedReducer,
    truncateMiddle,
    uploadingText,
    uploadErrorText,
    withAttachments,
} from './files';
import { AgentApiError } from './api';
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
        expect(r.error).toBe('Not uploaded, larger than 2 MB per file: big.zip (2 MB)');
    });

    it('lets everything through without a known limit', () => {
        expect(checkSizes(files, undefined)).toEqual({ ok: files, tooBig: [] });
        expect(checkSizes(files, 0).tooBig).toEqual([]);
    });
});

describe('Office documents (issue #42)', () => {
    const office = [
        { name: 'report.docx', size: 37_000 },
        { name: 'pens.xlsx', size: 5_400 },
        { name: 'results.pptx', size: 29_000 },
    ];

    it('lets Word, Excel and PowerPoint files through the size check like any file', () => {
        expect(checkSizes(office, 50)).toEqual({ ok: office, tooBig: [] });
        const big = { name: 'slides.pptx', size: 61 * 1024 * 1024 };
        const r = checkSizes([...office, big], 50);
        expect(r.ok).toEqual(office);
        expect(r.error).toBe('Not uploaded, larger than 50 MB per file: slides.pptx (61 MB)');
    });

    it('names the readable formats and the limit in the paperclip hint', () => {
        for (const f of ['Word', 'Excel', 'PowerPoint', 'PDF', 'CSV', 'images']) expect(READABLE_FORMATS).toContain(f);
        expect(attachHint(50)).toBe(`Attach files (${READABLE_FORMATS}, at most 50 MB each). They are placed under /workspace/inputs/.`);
        expect(attachHint(undefined)).toBe(`Attach files (${READABLE_FORMATS}). They are placed under /workspace/inputs/.`);
    });

    it('turns a 413 into a size message, other failures stay as they are', () => {
        expect(uploadErrorText(new AgentApiError(413, 'slides.pptx is larger than 50 MB'), 50)).toBe(
            'Not uploaded: slides.pptx is larger than 50 MB (the limit per file).',
        );
        // a proxy's 413 without the gateway's text
        expect(uploadErrorText(new AgentApiError(413, '413 Request Entity Too Large'), 50)).toBe(
            'Not uploaded: the file is too large for the server (at most 50 MB per file).',
        );
        expect(uploadErrorText(new AgentApiError(413, '413 Request Entity Too Large'), undefined)).toBe(
            'Not uploaded: the file is too large for the server.',
        );
        expect(uploadErrorText(new AgentApiError(500, 'storage down'), 50)).toBe('Upload failed: storage down');
        expect(uploadErrorText('offline', 50)).toBe('Upload failed: offline');
    });

    it('shows Office files with their type icon', () => {
        expect(fileTypeOf({ name: 'report.docx' })).toBe('word');
        expect(fileTypeOf({ name: 'old.xls' })).toBe('spreadsheet');
        expect(fileTypeOf({ name: 'results.pptx' })).toBe('presentation');
        expect(fileTypeOf({ name: 'page.htm' })).toBe('text');
    });
});

describe('stagedReducer', () => {
    const start = (id: string, name = `${id}.csv`) =>
        ({ type: 'upload_start', upload: { id, name, size: 100 } }) as const;

    it('tracks uploads with their progress and stages the uploaded files, replacing same names', () => {
        let s = stagedReducer(emptyStaged, start('u1', 'a.csv'));
        expect(canSend('', s)).toBe(false);
        expect(s.uploads).toEqual([{ id: 'u1', name: 'a.csv', size: 100, progress: 0 }]);
        s = stagedReducer(s, { type: 'upload_progress', id: 'u1', progress: 0.71 });
        expect(uploadingText(s.uploads[0].progress)).toBe('Uploading 71%');
        // a late, smaller value does not move it back; values outside 0..1 are clamped
        s = stagedReducer(s, { type: 'upload_progress', id: 'u1', progress: 0.5 });
        expect(s.uploads[0].progress).toBe(0.71);
        s = stagedReducer(s, { type: 'upload_progress', id: 'u1', progress: 7 });
        expect(s.uploads[0].progress).toBe(1);
        // an unknown id changes nothing
        expect(stagedReducer(s, { type: 'upload_progress', id: 'x', progress: 0.2 })).toBe(s);
        s = stagedReducer(s, { type: 'upload_done', id: 'u1', files: [art('a.csv'), art('b.png')] });
        s = stagedReducer(s, start('u2', 'a.csv'));
        s = stagedReducer(s, { type: 'upload_done', id: 'u2', files: [art('a.csv', { size: 5 })] });
        expect(s.uploads.length).toBe(0);
        expect(s.files.map((f) => `${f.name}:${f.size}`)).toEqual(['b.png:100', 'a.csv:5']);
        expect(canSend('', s)).toBe(true);
    });

    it('keeps staged files on a failed upload and blocks sending while one is in flight', () => {
        let s = stagedReducer(emptyStaged, start('u1'));
        s = stagedReducer(s, { type: 'upload_done', id: 'u1', files: [art('a.csv')] });
        s = stagedReducer(s, start('u2'));
        s = stagedReducer(s, start('u3'));
        expect(s.uploads.length).toBe(2);
        expect(canSend('text', s)).toBe(false);
        s = stagedReducer(s, { type: 'upload_failed', id: 'u2', error: 'Upload failed: 413' });
        expect(s).toMatchObject({ error: 'Upload failed: 413' });
        expect(s.uploads.map((u) => u.id)).toEqual(['u3']);
        s = stagedReducer(s, { type: 'upload_failed', id: 'u3', error: 'Upload failed: 500' });
        expect(s.uploads.length).toBe(0);
        expect(s.files).toHaveLength(1);
    });

    it('removes, clears after sending and restores after a failed send', () => {
        let s = stagedReducer(emptyStaged, start('u1'));
        s = stagedReducer(s, { type: 'upload_done', id: 'u1', files: [art('a.csv'), art('b.csv')] });
        s = stagedReducer(s, { type: 'remove', name: 'a.csv' });
        expect(s.files.map((f) => f.name)).toEqual(['b.csv']);
        const sent = s.files;
        s = stagedReducer(s, { type: 'clear' });
        expect(s.files).toEqual([]);
        // a new file staged while the send was in flight stays behind the restored ones
        s = stagedReducer(s, start('u2'));
        s = stagedReducer(s, { type: 'upload_done', id: 'u2', files: [art('c.csv')] });
        s = stagedReducer(s, { type: 'restore', files: sent });
        expect(s.files.map((f) => f.name)).toEqual(['b.csv', 'c.csv']);
    });

    it('notes refused files without touching the staged ones', () => {
        const s = stagedReducer(emptyStaged, { type: 'refused', error: 'Too large' });
        expect(s).toEqual({ files: [], uploads: [], error: 'Too large' });
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

    it('merges by kind and name', () => {
        const merged = mergeArtifacts(list, [art('old.png', { kind: 'output', size: 1 }), art('old.png')]);
        expect(merged).toHaveLength(4);
        expect(merged.find((a) => a.kind === 'output' && a.name === 'old.png')?.size).toBe(1);
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
        expect(items).toEqual([
            { kind: 'user', key: 'u1', seq: 1, at: '2026-10-06T10:00:00Z', text: 'Count rows', files: ['a.csv', 'b.png'] },
        ]);
    });

    it('keeps a message with attachments only', () => {
        const items = buildTranscript([user(1, withAttachments('', ['a.csv']))], ctx);
        expect(items).toEqual([{ kind: 'user', key: 'u1', seq: 1, at: '2026-10-06T10:00:00Z', text: '', files: ['a.csv'] }]);
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

describe('splitFileName / truncateMiddle', () => {
    it('keeps the extension and the end of the stem in the tail', () => {
        expect(splitFileName('825276804_18105773135202160_7072290302585619992.jpg')).toEqual({
            head: '825276804_18105773135202160_707229030258561',
            tail: '9992.jpg',
        });
        expect(splitFileName('fall1-0bde6b8d68ed (durchsuchbar).pdf').tail).toBe('bar).pdf');
    });
    it('joins back to the full name', () => {
        for (const n of ['a.txt', 'report.final.docx', 'README', 'x'.repeat(300), '.env', 'archive.tar.gz']) {
            const { head, tail } = splitFileName(n);
            expect(head + tail).toBe(n);
        }
    });
    it('leaves short stems whole and treats long or missing extensions as stem', () => {
        expect(splitFileName('a.pdf')).toEqual({ head: 'a.pdf', tail: '' });
        expect(splitFileName('abcd.pdf')).toEqual({ head: 'abcd.pdf', tail: '' });
        expect(splitFileName('README_FIRST')).toEqual({ head: 'README_F', tail: 'IRST' });
        expect(splitFileName('data.verylongextension').tail).toBe('sion');
        expect(splitFileName('.env')).toEqual({ head: '.env', tail: '' });
    });
    it('truncates in the middle as text, extension visible', () => {
        expect(truncateMiddle('825276804_18105773135202160_7072290302585619992.jpg', 16)).toBe('8252768…9992.jpg');
        expect(truncateMiddle('short.pdf', 16)).toBe('short.pdf');
        const t = truncateMiddle('y'.repeat(200) + '.xlsx', 20);
        expect(Array.from(t)).toHaveLength(20);
        expect(t.endsWith('yyyy.xlsx')).toBe(true);
    });
});

describe('fileTypeOf', () => {
    it('maps extensions to a type icon', () => {
        expect(fileTypeOf({ name: 'a.PDF' })).toBe('pdf');
        expect(fileTypeOf({ name: 'a.docx' })).toBe('word');
        expect(fileTypeOf({ name: 'a.xlsx' })).toBe('spreadsheet');
        expect(fileTypeOf({ name: 'a.pptx' })).toBe('presentation');
        expect(fileTypeOf({ name: 'a.csv' })).toBe('text');
        expect(fileTypeOf({ name: 'a.md' })).toBe('text');
        expect(fileTypeOf({ name: 'a.tar.gz' })).toBe('archive');
        expect(fileTypeOf({ name: 'a.zip' })).toBe('archive');
        expect(fileTypeOf({ name: 'a.jpg' })).toBe('image');
        expect(fileTypeOf({ name: 'drawing.svg' })).toBe('image');
        expect(fileTypeOf({ name: 'model.onnx' })).toBe('file');
    });
    it('falls back to the content type without a known extension', () => {
        const ct = (content_type: string) => fileTypeOf({ name: 'upload', content_type });
        expect(ct('application/pdf')).toBe('pdf');
        expect(ct('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('word');
        expect(ct('application/vnd.ms-excel')).toBe('spreadsheet');
        expect(ct('application/vnd.openxmlformats-officedocument.presentationml.presentation')).toBe('presentation');
        expect(ct('text/csv; charset=utf-8')).toBe('text');
        expect(ct('application/json')).toBe('text');
        expect(ct('application/zip')).toBe('archive');
        expect(ct('image/png')).toBe('image');
        expect(ct('application/octet-stream')).toBe('file');
        expect(fileTypeOf({ name: 'upload' })).toBe('file');
    });
    it('is only the icon: an SVG or a renamed file never previews as an image', () => {
        expect(previewKind(art('drawing.svg', { content_type: 'image/svg+xml' }))).toBe('file');
        expect(previewKind(art('photo.png', { content_type: 'text/html' }))).toBe('file');
    });
});

describe('file cards', () => {
    it('show size and a short type', () => {
        expect(fileMeta({ name: 'fall1 (durchsuchbar).pdf', size: 731 * 1024 })).toBe('731 KB · PDF');
        expect(fileMeta({ name: 'Bildschirmfoto.png', size: 1.2 * 1024 * 1024 })).toBe('1.2 MB · PNG');
        expect(fileMeta({ name: 'notes' })).toBe('File');
        expect(fileMeta({ name: 'upload', content_type: 'image/png', size: 10 })).toBe('10 B · Image');
        // a long "extension" is no type tag
        expect(fileTypeTag({ name: 'archive.backup2026' })).toBe('File');
    });
});

describe('placeOutputs', () => {
    const answer = (key: string, at: string | undefined, ids: string[]) => ({
        kind: 'agent',
        key,
        at,
        parts: [{ type: 'steps', steps: ids.map((id) => ({ id })) }],
    });
    const items = [
        { kind: 'user', key: 'u1', at: '2026-10-06T10:00:00Z' },
        answer('a1', '2026-10-06T10:00:05Z', ['t1']),
        { kind: 'user', key: 'u2', at: '2026-10-06T10:05:00Z' },
        answer('a2', '2026-10-06T10:05:05Z', ['t2', 't3']),
    ];

    it('puts each result under the answer whose tool call handed it over, oldest first', () => {
        const list = [
            art('b.png', { kind: 'output', tool_call_id: 't3', created_at: '2026-10-06T10:06:02Z' }),
            art('a.pdf', { kind: 'output', tool_call_id: 't2', created_at: '2026-10-06T10:06:01Z' }),
            art('c.txt', { kind: 'output', tool_call_id: 't1', created_at: '2026-10-06T10:01:00Z' }),
            art('in.txt', { kind: 'input', tool_call_id: 't1' }),
        ];
        const { byItem, unplaced } = placeOutputs(items, list);
        expect(byItem.get('a1')?.map((a) => a.name)).toEqual(['c.txt']);
        expect(byItem.get('a2')?.map((a) => a.name)).toEqual(['a.pdf', 'b.png']);
        expect(byItem.has('u1')).toBe(false);
        expect(unplaced).toEqual([]);
    });

    it('places results without a known call by time, never under the live answer', () => {
        const list = [
            art('late.csv', { kind: 'output', created_at: '2026-10-06T10:07:00Z' }),
            art('mid.csv', { kind: 'output', tool_call_id: 'gone', created_at: '2026-10-06T10:02:00Z' }),
            art('early.csv', { kind: 'output', created_at: '2026-10-06T09:00:00Z' }),
        ];
        const live = [...items, answer('live', undefined, ['t9'])];
        const { byItem } = placeOutputs(live, list);
        expect(byItem.get('a1')?.map((a) => a.name)).toEqual(['early.csv', 'mid.csv']);
        expect(byItem.get('a2')?.map((a) => a.name)).toEqual(['late.csv']);
        expect(byItem.has('live')).toBe(false);
        // the live answer takes the results of its own calls
        const own = placeOutputs(live, [art('now.png', { kind: 'output', tool_call_id: 't9' })]);
        expect(own.byItem.get('live')?.map((a) => a.name)).toEqual(['now.png']);
    });

    it('returns what it cannot place', () => {
        const list = [art('x.csv', { kind: 'output' })];
        expect(placeOutputs([{ kind: 'user', key: 'u1' }], list).unplaced.map((a) => a.name)).toEqual(['x.csv']);
        expect(placeOutputs(items, undefined).byItem.size).toBe(0);
    });
});

describe('pastedFiles', () => {
    const file = (name: string) => ({ name }) as File;
    it('takes the clipboard files, else its file items, nothing for text', () => {
        const a = file('a.png');
        expect(pastedFiles({ files: [a] as unknown as FileList, items: [] as unknown as DataTransferItemList })).toEqual([a]);
        const items = [
            { kind: 'string', getAsFile: () => null },
            { kind: 'file', getAsFile: () => a },
            { kind: 'file', getAsFile: () => null },
        ] as unknown as DataTransferItemList;
        expect(pastedFiles({ files: [] as unknown as FileList, items })).toEqual([a]);
        expect(pastedFiles({ files: [] as unknown as FileList, items: [] as unknown as DataTransferItemList })).toEqual([]);
        expect(pastedFiles(null)).toEqual([]);
    });
});
