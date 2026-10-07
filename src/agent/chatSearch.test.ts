// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import { CHAT_LIST_LIMIT, normalizeQuery, searchChats, titleMatches } from './chatSearch';

const chat = (id: string, title: string) => ({ id, title });
const chats = [
    chat('c1', 'Subagenten hier testen'),
    chat('c2', 'MNIST herunterladen und Dataset erstellen'),
    chat('c3', 'Welche Datensätze sind da'),
];
const subagents = [{ title: 'Write the CSV generator' }, { title: 'Review the analysis' }];

describe('titleMatches', () => {
    it('ignores case and extra spaces and needs every word', () => {
        expect(normalizeQuery('  MNIST   Data ')).toBe('mnist data');
        expect(titleMatches('MNIST herunterladen und Dataset erstellen', 'dataset  mnist')).toBe(true);
        expect(titleMatches('MNIST herunterladen', 'mnist cifar')).toBe(false);
        expect(titleMatches('Welche Datensätze sind da', 'DATENSÄTZE')).toBe(true);
        expect(titleMatches('anything', '   ')).toBe(true);
    });
});

describe('searchChats', () => {
    it('lists the newest chats without a query, plus an older selected one', () => {
        const many = Array.from({ length: 30 }, (_, i) => chat(`x${i}`, `Chat ${i}`));
        const r = searchChats(many, '', { selectedChatId: 'x25', subagents: [] });
        expect(r.chats).toHaveLength(CHAT_LIST_LIMIT + 1);
        expect(r.chats[CHAT_LIST_LIMIT].id).toBe('x25');
        expect(r.more).toBe(true);
        expect(r.subagents).toBeUndefined();
    });

    it('finds chats by title, over the whole list', () => {
        const many = [...Array.from({ length: 30 }, (_, i) => chat(`x${i}`, `Chat ${i}`)), chat('old', 'MNIST old')];
        expect(searchChats(many, 'mnist', { subagents: [] }).chats.map((c) => c.id)).toEqual(['old']);
        expect(searchChats(chats, 'nothing like this', { subagents: [] }).chats).toEqual([]);
    });

    it('finds the open chat by a subagent and lists only the matching subagents', () => {
        const r = searchChats(chats, 'csv', { chatId: 'c1', subagents });
        expect(r.chats.map((c) => c.id)).toEqual(['c1']);
        expect(r.subagents?.map((s) => s.title)).toEqual(['Write the CSV generator']);
        // the chat matches by title, no subagent matches: none listed
        const t = searchChats(chats, 'testen', { chatId: 'c1', subagents });
        expect(t.chats.map((c) => c.id)).toEqual(['c1']);
        expect(t.subagents).toEqual([]);
        // subagents of another chat are not known and find nothing
        expect(searchChats(chats, 'csv', { chatId: undefined, subagents: [] }).chats).toEqual([]);
    });
});
