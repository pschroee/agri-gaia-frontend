// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import { dropTrashed, needsTrashConfirm, nextChatAfterRemoval, purgeLabel, retentionHint } from './trash';

describe('dropTrashed', () => {
    it('removes only the chats with trashed_at', () => {
        const list: { id: string; trashed_at?: string }[] = [
            { id: 'a' },
            { id: 'b', trashed_at: '2026-10-10T10:00:00Z' },
            { id: 'c', trashed_at: undefined },
        ];
        expect(dropTrashed(list).map((c) => c.id)).toEqual(['a', 'c']);
    });

    it('returns the same list when nothing is in the trash', () => {
        const list: { id: string; trashed_at?: string }[] = [{ id: 'a' }];
        expect(dropTrashed(list)).toBe(list);
    });
});

describe('nextChatAfterRemoval', () => {
    const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

    it('takes the chat below', () => {
        expect(nextChatAfterRemoval(list, 'a')).toBe('b');
        expect(nextChatAfterRemoval(list, 'b')).toBe('c');
    });

    it('takes the chat above when the removed one is last', () => {
        expect(nextChatAfterRemoval(list, 'c')).toBe('b');
    });

    it('has no successor for the only chat or an unknown id', () => {
        expect(nextChatAfterRemoval([{ id: 'a' }], 'a')).toBeUndefined();
        expect(nextChatAfterRemoval(list, 'x')).toBeUndefined();
    });
});

describe('purgeLabel', () => {
    const now = new Date('2026-10-12T12:00:00Z');

    it('counts whole days, rounded up', () => {
        expect(purgeLabel('2026-10-15T12:00:00Z', now)).toBe('Deleted permanently in 3 days');
        expect(purgeLabel('2026-10-13T08:00:00Z', now)).toBe('Deleted permanently in 1 day');
    });

    it('says today below one day', () => {
        expect(purgeLabel('2026-10-12T18:00:00Z', now)).toBe('Deleted permanently today');
        expect(purgeLabel('2026-10-11T18:00:00Z', now)).toBe('Deleted permanently today');
    });

    it('gives nothing for a bad date', () => {
        expect(purgeLabel('not a date', now)).toBeUndefined();
    });
});

describe('retentionHint', () => {
    it('is empty without a retention', () => {
        expect(retentionHint(0)).toBeUndefined();
        expect(retentionHint(undefined)).toBeUndefined();
    });

    it('names the number of days with a retention', () => {
        expect(retentionHint(30)).toBe('Chats in the trash are deleted permanently after 30 days.');
        expect(retentionHint(1)).toBe('Chats in the trash are deleted permanently after 1 day.');
    });
});

describe('needsTrashConfirm', () => {
    const idle = { state: 'dormant' as const, running: false, pending_approvals: 0 };

    it('asks nothing for an idle chat', () => {
        expect(needsTrashConfirm(idle)).toBe(false);
        expect(needsTrashConfirm({ ...idle, state: 'active' })).toBe(false);
    });

    it('asks while a turn runs', () => {
        expect(needsTrashConfirm({ ...idle, running: true })).toBe(true);
    });

    it('asks while an approval is open or a subagent runs', () => {
        expect(needsTrashConfirm({ ...idle, pending_approvals: 1 })).toBe(true);
        expect(needsTrashConfirm({ ...idle, subagents_running: 2 })).toBe(true);
    });

    it('asks while a background task runs', () => {
        expect(needsTrashConfirm({ ...idle, background_running: 1 })).toBe(true);
        expect(needsTrashConfirm({ ...idle, background_running: 0 })).toBe(false);
    });

    it('asks while the chat starts or resumes', () => {
        expect(needsTrashConfirm({ ...idle, starting: true })).toBe(true);
        expect(needsTrashConfirm({ ...idle, resuming: true })).toBe(true);
    });
});
