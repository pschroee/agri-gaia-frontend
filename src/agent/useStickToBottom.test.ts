// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import { countEntries } from './transcript';
import type { TranscriptItem } from './transcript';
import {
    BOTTOM_TOLERANCE,
    distanceFromBottom,
    initialStick,
    isAtBottom,
    stickReducer,
    unseenCount,
} from './useStickToBottom';
import type { StickAction, StickState } from './useStickToBottom';

const run = (s: StickState, ...actions: StickAction[]) => actions.reduce(stickReducer, s);
const up = { type: 'scroll', atBottom: false, movedUp: true } as const;
const bottom = { type: 'scroll', atBottom: true, movedUp: false } as const;
const count = (n: number) => ({ type: 'count', count: n }) as const;

describe('isAtBottom', () => {
    it('measures the distance to the end', () => {
        expect(distanceFromBottom({ scrollTop: 600, scrollHeight: 1000, clientHeight: 400 })).toBe(0);
        expect(distanceFromBottom({ scrollTop: 500, scrollHeight: 1000, clientHeight: 400 })).toBe(100);
    });

    it('accepts a small tolerance', () => {
        const at = (top: number) => isAtBottom({ scrollTop: top, scrollHeight: 1000, clientHeight: 400 });
        expect(at(600)).toBe(true);
        expect(at(600 - BOTTOM_TOLERANCE)).toBe(true);
        expect(at(600 - BOTTOM_TOLERANCE - 1)).toBe(false);
    });

    it('treats content shorter than the view as at the bottom', () => {
        expect(isAtBottom({ scrollTop: 0, scrollHeight: 200, clientHeight: 400 })).toBe(true);
    });
});

describe('stickReducer', () => {
    it('starts stuck with nothing unseen', () => {
        const s = initialStick(5);
        expect(s.stuck).toBe(true);
        expect(unseenCount(s)).toBe(0);
    });

    it('keeps following while new entries arrive at the bottom', () => {
        const s = run(initialStick(1), count(2), count(7));
        expect(s.stuck).toBe(true);
        expect(unseenCount(s)).toBe(0);
    });

    it('lets go when the user scrolls up', () => {
        expect(run(initialStick(3), up).stuck).toBe(false);
    });

    it('does not let go when the view leaves the bottom without the user moving up', () => {
        // growing content or a clamped scrollTop
        const s = run(initialStick(3), { type: 'scroll', atBottom: false, movedUp: false });
        expect(s.stuck).toBe(true);
    });

    it('counts entries added after the user scrolled up', () => {
        const s = run(initialStick(3), up, count(4), count(6));
        expect(s.stuck).toBe(false);
        expect(unseenCount(s)).toBe(3);
    });

    it('re-attaches when the user scrolls back to the bottom', () => {
        const s = run(initialStick(3), up, count(6), bottom);
        expect(s.stuck).toBe(true);
        expect(unseenCount(s)).toBe(0);
        expect(run(s, count(8)).stuck).toBe(true);
    });

    it('re-attaches on jump (button, opening a chat, sending)', () => {
        const s = run(initialStick(3), up, count(5), { type: 'jump' });
        expect(s.stuck).toBe(true);
        expect(unseenCount(s)).toBe(0);
    });

    it('does not count negative when entries disappear', () => {
        const s = run(initialStick(5), up, count(2));
        expect(unseenCount(s)).toBe(0);
        expect(unseenCount(run(s, count(4)))).toBe(2);
    });

    it('returns the same state when nothing changes', () => {
        const s = initialStick(2);
        expect(stickReducer(s, bottom)).toBe(s);
        expect(stickReducer(s, count(2))).toBe(s);
    });
});

describe('countEntries', () => {
    it('counts messages and each tool call', () => {
        const items: TranscriptItem[] = [
            { kind: 'user', key: 'u', text: 'hi' },
            {
                kind: 'agent',
                key: 'a',
                parts: [
                    { type: 'text', text: 'ok' },
                    {
                        type: 'steps',
                        steps: [
                            { id: '1', tool: 'web_search', status: 'done' },
                            { id: '2', tool: 'web_search', status: 'running' },
                        ],
                    },
                ],
            },
            { kind: 'notice', key: 'n', text: 'note' },
        ];
        expect(countEntries(items)).toBe(5);
    });
});
