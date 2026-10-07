// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import { canStartNewChat, freshChatFor, newChatErrorText, newChatRequest } from './newChat';

describe('newChatRequest', () => {
    it('asks for the gateway defaults without waiting for a sandbox', () => {
        expect(newChatRequest('de-DE')).toEqual({ async: true, language: 'de-DE' });
    });

    it('leaves the language out when the browser has none', () => {
        expect(newChatRequest(undefined)).toEqual({ async: true });
    });

    it('sends no model, title, message or delegation', () => {
        const req = newChatRequest('en');
        expect(req.model).toBeUndefined();
        expect(req.title).toBeUndefined();
        expect(req.message).toBeUndefined();
        expect('delegation' in req).toBe(false);
    });
});

describe('newChatErrorText', () => {
    it('explains an empty pool', () => {
        expect(newChatErrorText(503, 'No free slot in the pool')).toMatch(/No free agent sandbox/);
    });

    it('asks to sign in again on 401', () => {
        expect(newChatErrorText(401, 'not logged in')).toMatch(/Sign in again/);
    });

    it('names other failures', () => {
        expect(newChatErrorText(500, 'boom')).toBe('Could not start a new chat: boom');
        expect(newChatErrorText(undefined, 'Failed to fetch')).toBe('Could not start a new chat: Failed to fetch');
    });
});

describe('freshChatFor', () => {
    const fresh = { chatId: 'c1', files: [] };

    it('belongs only to the chat it was created for', () => {
        expect(freshChatFor(fresh, 'c1')).toBe(fresh);
        expect(freshChatFor(fresh, 'c2')).toBeUndefined();
        expect(freshChatFor(undefined, 'c1')).toBeUndefined();
    });
});

describe('canStartNewChat', () => {
    it('needs a ready session and no creation on its way', () => {
        expect(canStartNewChat('ready', false)).toBe(true);
        expect(canStartNewChat('ready', true)).toBe(false);
        expect(canStartNewChat('checking', false)).toBe(false);
        expect(canStartNewChat('signed-out', false)).toBe(false);
    });
});
