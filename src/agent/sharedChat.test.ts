// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import { emptyStaged } from './files';
import type { Artifact } from './types';
import { DraftStore, StagedStore, hostChat, streamFor } from './sharedChat';

const art = (name: string): Artifact => ({
    chat_id: 'c1',
    kind: 'input',
    name,
    size: 3,
    sha256: 'x',
    content_type: 'text/csv',
    created_at: '2026-10-16T10:00:00Z',
    via: 'ui',
});

describe('streamFor', () => {
    it('gives a view the shared stream of its own chat only', () => {
        const published = { chatId: 'c1', stream: { n: 1 } };
        expect(streamFor(published, 'c1')).toBe(published.stream);
        expect(streamFor(published, 'c2')).toBeUndefined();
        expect(streamFor(undefined, 'c1')).toBeUndefined();
    });
});

describe('hostChat', () => {
    it('runs the stream of the selected chat while it is on screen and the user is signed in', () => {
        expect(hostChat({ ready: true, chatId: 'c1', shown: true })).toBe('c1');
        expect(hostChat({ ready: false, chatId: 'c1', shown: true })).toBeUndefined();
        expect(hostChat({ ready: true, chatId: undefined, shown: true })).toBeUndefined();
        expect(hostChat({ ready: true, chatId: 'c1', shown: false })).toBeUndefined();
    });
});

describe('DraftStore', () => {
    it('keeps a draft per chat and forgets an empty one', () => {
        const d = new DraftStore();
        expect(d.get('c1')).toBe('');
        d.set('c1', 'hello');
        d.set('c2', 'other');
        expect(d.get('c1')).toBe('hello');
        expect(d.get('c2')).toBe('other');
        d.set('c1', '');
        expect(d.get('c1')).toBe('');
    });
});

// Issue L4/#121: the attachments of the field live above the page and the panel, so the move between them — the
// field is unmounted and mounted again — loses neither an uploaded file nor an upload that is still running.
describe('StagedStore', () => {
    const start = (id: string, name: string) => ({ type: 'upload_start', upload: { id, name, size: 100 } }) as const;

    it('keeps the staged files and running uploads of a chat for the next view of it', () => {
        const s = new StagedStore();
        s.dispatch('c1', start('u1', 'a.csv'));
        s.dispatch('c1', { type: 'upload_done', id: 'u1', files: [art('a.csv')] });
        s.dispatch('c1', start('u2', 'big.pdf'));
        s.dispatch('c1', { type: 'upload_progress', id: 'u2', progress: 0.42 });
        // the panel reads the same state as the page did
        const after = s.get('c1');
        expect(after.files.map((f) => f.name)).toEqual(['a.csv']);
        expect(after.uploads.map((u) => `${u.name}:${u.progress}`)).toEqual(['big.pdf:0.42']);
        // and only for its own chat
        expect(s.get('c2')).toEqual(emptyStaged);
        // the same object while nothing changes (useSyncExternalStore compares by identity)
        expect(s.get('c1')).toBe(after);
        // an action that changes nothing gives no new object either
        s.dispatch('c1', { type: 'upload_progress', id: 'gone', progress: 0.5 });
        expect(s.get('c1')).toBe(after);
    });

    it('tells the registered listeners about a change and stops after unsubscribing', () => {
        const s = new StagedStore();
        let calls = 0;
        const off = s.subscribe(() => calls++);
        s.dispatch('c1', start('u1', 'a.csv'));
        expect(calls).toBe(1);
        s.dispatch('c1', { type: 'upload_progress', id: 'u1', progress: 0.5 });
        expect(calls).toBe(2);
        off();
        s.dispatch('c1', { type: 'upload_progress', id: 'u1', progress: 0.6 });
        expect(calls).toBe(2);
    });

    it('aborts the request of a cancelled upload, per chat and id', () => {
        const s = new StagedStore();
        s.dispatch('c1', start('u1', 'a.csv'));
        const signal = s.beginUpload('c1', 'u1').signal;
        expect(s.signalOf('c1', 'u1')).toBe(signal);
        expect(signal.aborted).toBe(false);
        s.abort('c1', 'u1');
        expect(signal.aborted).toBe(true);
        expect(s.signalOf('c1', 'u1')).toBeUndefined();
        // an upload of another chat with the same id is untouched
        const other = s.beginUpload('c2', 'u1').signal;
        s.abort('c1', 'u1'); // no controller any more: nothing happens
        expect(other.aborted).toBe(false);
        // and an ended request is not aborted later
        s.endUpload('c2', 'u1');
        s.abort('c2', 'u1');
        expect(other.aborted).toBe(false);
    });
});