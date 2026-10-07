// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import { AgentApiError } from './api';
import { renameTitle } from './commands';
import {
    initialRename,
    MAX_TITLE,
    normalizeTitle,
    renameCommand,
    renameDecision,
    renameErrorText,
    renameReducer,
    withTitle,
} from './rename';
import type { Chat } from './types';

describe('normalizeTitle', () => {
    it('collapses whitespace like the gateway', () => {
        expect(normalizeTitle('  Night \n images\t ')).toBe('Night images');
        expect(normalizeTitle('   ')).toBe('');
    });

    it('cuts at the gateway limit, counted in characters', () => {
        expect(MAX_TITLE).toBe(120);
        expect(normalizeTitle('a'.repeat(130))).toHaveLength(120);
        const emoji = '🐖'.repeat(125);
        expect(Array.from(normalizeTitle(emoji))).toHaveLength(120);
        expect(normalizeTitle(`${'a'.repeat(119)} b`)).toBe('a'.repeat(119));
    });
});

describe('renameDecision', () => {
    it('saves a new title, normalized', () => {
        expect(renameDecision('Old', '  New   title ')).toEqual({ save: true, title: 'New title' });
    });

    it('does nothing for an empty title', () => {
        expect(renameDecision('Old', '')).toEqual({ save: false });
        expect(renameDecision('Old', '   ')).toEqual({ save: false });
    });

    it('does nothing for an unchanged title, also with other whitespace', () => {
        expect(renameDecision('Night images', 'Night images')).toEqual({ save: false });
        expect(renameDecision('Night images', ' Night  images ')).toEqual({ save: false });
    });

    it('names an untitled chat', () => {
        expect(renameDecision('', 'First')).toEqual({ save: true, title: 'First' });
    });
});

describe('renameCommand', () => {
    it('is read back by the /rename parser to the same title', () => {
        expect(renameCommand('Night images')).toBe('/rename Night images');
        expect(renameTitle(renameCommand('Night images'))).toBe('Night images');
    });
});

describe('withTitle', () => {
    it('changes only the title', () => {
        const c = { id: 'c1', title: 'Old', model: 'm' } as Chat;
        const n = withTitle(c, 'New');
        expect(n).toEqual({ id: 'c1', title: 'New', model: 'm' });
        expect(c.title).toBe('Old');
    });
});

describe('renameReducer', () => {
    it('opens the field prefilled and follows typing', () => {
        let s = renameReducer(initialRename, { type: 'start', chatId: 'c1', title: 'Old' });
        expect(s).toEqual({ chatId: 'c1', draft: 'Old' });
        s = renameReducer(s, { type: 'change', draft: 'New' });
        expect(s.draft).toBe('New');
    });

    it('closes on commit and cancel; a blur afterwards finds nothing open', () => {
        const open = renameReducer(initialRename, { type: 'start', chatId: 'c1', title: 'Old' });
        const done = renameReducer(open, { type: 'commit' });
        expect(done.chatId).toBeUndefined();
        expect(renameReducer(done, { type: 'commit' })).toBe(done);
        const cancelled = renameReducer(open, { type: 'cancel' });
        expect(cancelled.chatId).toBeUndefined();
        expect(renameReducer(cancelled, { type: 'commit' })).toBe(cancelled);
    });

    it('ignores typing while no field is open', () => {
        expect(renameReducer(initialRename, { type: 'change', draft: 'x' })).toBe(initialRename);
    });

    it('keeps a failure until the next start or dismiss', () => {
        let s = renameReducer(initialRename, { type: 'failed', chatId: 'c1', text: 'Rename failed: x' });
        expect(s.error).toEqual({ chatId: 'c1', text: 'Rename failed: x' });
        expect(renameReducer(s, { type: 'dismiss' }).error).toBeUndefined();
        s = renameReducer(s, { type: 'start', chatId: 'c2', title: 'T' });
        expect(s.error).toBeUndefined();
    });
});

describe('renameErrorText', () => {
    it('names the gateway message', () => {
        expect(renameErrorText(new AgentApiError(404, 'chat not found'))).toBe('Rename failed: chat not found');
    });
});
