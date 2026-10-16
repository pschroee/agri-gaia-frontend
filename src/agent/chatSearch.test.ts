// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import { CHAT_LIST_LIMIT, historyGroups, normalizeQuery, olderChatsLabel, searchChats, titleMatches } from './chatSearch';

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

describe('searchChats with subagents of other chats (issue #60)', () => {
    it('finds another chat by a loaded subagent and lists only the matching ones', () => {
        const others = {
            c2: [{ title: 'Download MNIST' }, { title: 'Build the dataset' }],
            c3: [{ title: 'Count rows' }],
        };
        const r = searchChats(chats, 'mnist download', { chatId: 'c1', subagents, others });
        // c2 matches by title as well as by a subagent
        expect(r.chats.map((c) => c.id)).toEqual(['c2']);
        expect(r.others).toEqual({ c2: [{ title: 'Download MNIST' }] });
        const rows = searchChats(chats, 'rows', { chatId: 'c1', subagents, others });
        expect(rows.chats.map((c) => c.id)).toEqual(['c3']);
        expect(rows.others).toEqual({ c3: [{ title: 'Count rows' }] });
        // not loaded: not found; without a query nothing changes
        expect(searchChats(chats, 'rows', { chatId: 'c1', subagents }).chats).toEqual([]);
        expect(searchChats(chats, '', { chatId: 'c1', subagents, others }).others).toBeUndefined();
    });

    it('takes the open chat from its own runs, not from an older short list', () => {
        const r = searchChats(chats, 'stale', { chatId: 'c1', subagents, others: { c1: [{ title: 'stale title' }] } });
        expect(r.chats).toEqual([]);
    });
});

describe('how many chats the list leaves out (issue #122)', () => {
    const many = Array.from({ length: 25 }, (_, i) => chat(`x${i}`, `Chat ${i}`));

    it('counts the older chats of the panel list', () => {
        const r = searchChats(many, '', { subagents: [] });
        expect(r.chats).toHaveLength(CHAT_LIST_LIMIT);
        expect(r.hidden).toBe(5);
        expect(r.more).toBe(true);
    });

    it('does not count an older chat that is shown because it is selected', () => {
        const r = searchChats(many, '', { selectedChatId: 'x22', subagents: [] });
        expect(r.chats).toHaveLength(CHAT_LIST_LIMIT + 1);
        expect(r.chats[CHAT_LIST_LIMIT].id).toBe('x22');
        expect(r.hidden).toBe(4);
    });

    it('hides nothing when the caller asks for the whole list', () => {
        const r = searchChats(many, '', { subagents: [] }, { limit: Infinity });
        expect(r.chats).toHaveLength(25);
        expect(r.hidden).toBe(0);
        expect(r.more).toBe(false);
    });

    it('hides nothing while searching and lists matches beyond the limit', () => {
        const r = searchChats(many, 'chat 24', { subagents: [] });
        expect(r.chats.map((c) => c.id)).toEqual(['x24']);
        expect(r.hidden).toBe(0);
    });

    it('agrees with `more`', () => {
        for (const n of [0, 1, 20, 21, 25]) {
            const list = many.slice(0, n);
            const r = searchChats(list, '', { subagents: [] });
            expect(r.more).toBe(r.hidden > 0);
        }
    });

    it('names the number in words', () => {
        expect(olderChatsLabel(1)).toBe('1 older chat');
        expect(olderChatsLabel(5)).toBe('5 older chats');
        expect(olderChatsLabel(0)).toBe('0 older chats');
    });
});

describe('historyGroups (issue #122)', () => {
    const state = {
        openChatId: 'c1',
        openChat: { items: subagents, open: true },
        other: () => ({ items: undefined, open: false }),
    };

    it('shows only the matching subagents of a search, with their group open', () => {
        const result = searchChats(chats, 'csv', { chatId: 'c1', subagents });
        const listed = historyGroups(result, state);
        expect(listed.c1).toEqual({ subagents: [{ title: 'Write the CSV generator' }], open: true });
    });

    it('gives a chat that matches by its title alone no sub-entries', () => {
        const result = searchChats(chats, 'testen', { chatId: 'c1', subagents });
        expect(result.chats.map((c) => c.id)).toEqual(['c1']);
        expect(historyGroups(result, state)).toEqual({});
    });

    it('opens the group of another chat for the subagents the search found there', () => {
        const others = { c3: [{ title: 'Count rows' }, { title: 'Sum them' }] };
        const result = searchChats(chats, 'count', { chatId: 'c1', subagents, others });
        expect(historyGroups(result, state).c3).toEqual({ subagents: [{ title: 'Count rows' }], open: true });
    });

    it('keeps the stored groups when there is no search', () => {
        const result = searchChats(chats, '', {
            chatId: 'c1',
            selectedChatId: 'c1',
            subagents,
            others: { c3: [{ title: 'Count rows' }] },
        });
        const listed = historyGroups(result, {
            openChatId: 'c1',
            openChat: { items: subagents, open: false },
            other: (id) => ({ items: id === 'c3' ? [{ title: 'Count rows' }] : undefined, open: id === 'c3' }),
        });
        // the open chat's group is closed as the user left it, the other chat's is open
        expect(listed.c1).toEqual({ subagents, open: false });
        expect(listed.c3).toEqual({ subagents: [{ title: 'Count rows' }], open: true });
    });

    it('lists a group that is open but has nothing loaded yet, so its note shows', () => {
        const result = searchChats(chats, '', { subagents: [] });
        const listed = historyGroups(result, {
            openChat: { items: [], open: false },
            other: (id) => ({ items: undefined, open: id === 'c3' }),
        });
        expect(listed).toEqual({ c3: { subagents: [], open: true } });
    });

    it('lists nothing for a chat whose group was never opened', () => {
        const result = searchChats(chats, '', { subagents: [] });
        expect(historyGroups(result, { openChat: { items: [], open: false }, other: () => ({ open: false }) })).toEqual(
            {},
        );
    });
});
