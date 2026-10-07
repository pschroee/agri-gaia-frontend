// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import { DraftStore, hostChat, streamFor } from './sharedChat';

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
