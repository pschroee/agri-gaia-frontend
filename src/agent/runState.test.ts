// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import {
    abortErrorText,
    formatElapsed,
    isRunning,
    pendingSettled,
    isLoading,
    RUN_STATE_HINT,
    runSince,
    runStateOf,
    runStateText,
    showRunStatus,
} from './runState';
import type { StatePlace } from './runState';
import type { Chat, StoredMessage } from './types';

type RunChat = Pick<Chat, 'state' | 'running' | 'resuming' | 'starting' | 'pending_approvals' | 'running_since'>;
const chat = (extra: Partial<RunChat> = {}): RunChat => ({
    state: 'active',
    running: false,
    pending_approvals: 0,
    ...extra,
});

const msg = (seq: number, role: string, createdAt = '2026-10-06T10:00:00Z'): StoredMessage => ({
    seq,
    role,
    created_at: createdAt,
    message: { role, content: [{ type: 'text', text: `m${seq}` }] },
});

describe('runStateOf', () => {
    it('is undefined without a chat', () => {
        expect(runStateOf(undefined)).toBeUndefined();
    });

    it('shows a new chat waiting for its first sandbox as starting, not resuming', () => {
        expect(runStateOf(chat({ starting: true, resuming: true }))).toBe('starting');
        expect(runStateOf(chat({ starting: true }), { resumeRunning: true })).toBe('starting');
        expect(runStateOf(chat({ resuming: true }))).toBe('resuming');
        expect(RUN_STATE_HINT.starting).toMatch(/type already/);
    });

    it('distinguishes idle and working', () => {
        expect(runStateOf(chat())).toBe('idle');
        expect(runStateOf(chat({ running: true }))).toBe('working');
    });

    it('never shows the idle state of the gateway (issue #31): a dormant chat counts as idle', () => {
        expect(runStateOf(chat({ state: 'dormant' }))).toBe('idle');
        const places: StatePlace[] = ['header', 'list', 'bar'];
        const states = ['working', 'waiting', 'starting', 'resuming', 'idle'] as const;
        const texts = [
            ...places.flatMap((p) => states.map((s) => runStateText(s, p) ?? '')),
            ...Object.values(RUN_STATE_HINT),
        ].join(' ');
        expect(texts).not.toMatch(/rest|dormant|sleep/i);
    });

    it('is waiting while a running turn has an open approval', () => {
        expect(runStateOf(chat({ running: true, pending_approvals: 1 }))).toBe('waiting');
    });

    it('prefers the live approval count of the open view over the chat counter', () => {
        // the approval arrived over SSE before the chat event
        expect(runStateOf(chat({ running: true }), { pendingApprovals: 1 })).toBe('waiting');
        // decided already, the chat counter is stale
        expect(runStateOf(chat({ running: true, pending_approvals: 1 }), { pendingApprovals: 0 })).toBe('working');
    });

    it('shows an open approval of an active chat that is not marked running as waiting', () => {
        expect(runStateOf(chat({ pending_approvals: 2 }))).toBe('waiting');
        expect(runStateOf(chat({ state: 'dormant', pending_approvals: 2 }))).toBe('idle');
    });

    it('is resuming while the gateway rebuilds the sandbox or resume steps come in', () => {
        expect(runStateOf(chat({ state: 'dormant', resuming: true }))).toBe('resuming');
        expect(runStateOf(chat({ state: 'dormant' }), { resumeRunning: true })).toBe('resuming');
        expect(runStateOf(chat({ running: true, resuming: true }))).toBe('resuming');
    });

    it('counts working and waiting as running', () => {
        expect(isRunning('working')).toBe(true);
        expect(isRunning('waiting')).toBe(true);
        expect(isRunning('resuming')).toBe(false);
        expect(isRunning('idle')).toBe(false);
        expect(isRunning(undefined)).toBe(false);
    });
});

// issue #35: a state shows only while something happens
describe('state display', () => {
    const PLACES: StatePlace[] = ['header', 'list', 'bar'];
    // what header, list and bar show for a chat, with the live options of the open view
    const shown = (c: RunChat, opts: Parameters<typeof runStateOf>[1] = {}) => {
        const s = runStateOf(c, opts);
        return Object.fromEntries(PLACES.map((p) => [p, runStateText(s, p)]));
    };
    const nothing = { header: undefined, list: undefined, bar: undefined };

    it('shows nothing for a ready active chat: no "active", no "Idle"', () => {
        expect(shown(chat())).toEqual(nothing);
        expect(showRunStatus(runStateOf(chat()))).toBe(false);
    });

    it('shows nothing for a ready dormant chat', () => {
        expect(shown(chat({ state: 'dormant' }))).toEqual(nothing);
        expect(showRunStatus(runStateOf(chat({ state: 'dormant' })))).toBe(false);
    });

    it('shows "loading" in header and lists while resuming, no status bar (steps are in the transcript)', () => {
        const want = { header: 'loading', list: 'loading', bar: undefined };
        expect(shown(chat({ state: 'dormant', resuming: true }))).toEqual(want);
        expect(shown(chat({ state: 'dormant' }), { resumeRunning: true })).toEqual(want);
        expect(isLoading('resuming')).toBe(true);
        expect(showRunStatus('resuming')).toBe(false);
    });

    it('shows a new chat without a warm slot as loading too', () => {
        expect(shown(chat({ starting: true, resuming: true }))).toEqual({
            header: 'loading',
            list: 'loading',
            bar: undefined,
        });
        expect(isLoading('starting')).toBe(true);
        expect(showRunStatus('starting')).toBe(false);
    });

    it('shows working everywhere, with the status bar', () => {
        expect(shown(chat({ running: true }))).toEqual({ header: 'working', list: 'working', bar: 'Working' });
        expect(showRunStatus('working')).toBe(true);
    });

    it('shows a pending approval everywhere, with the status bar', () => {
        expect(shown(chat({ running: true }), { pendingApprovals: 1 })).toEqual({
            header: 'needs approval',
            list: 'waiting for approval',
            bar: 'Waiting for approval',
        });
        expect(showRunStatus('waiting')).toBe(true);
    });

    it('keeps the status bar open for a failed stop, and shows no state after a failed resume', () => {
        // a failed stop: the bar stays open as long as its message is there
        expect(showRunStatus('working', 'Stopping failed: boom')).toBe(true);
        expect(showRunStatus('idle', 'The agent had already stopped.')).toBe(true);
        expect(showRunStatus('idle', '')).toBe(false);
        // a failed resume: the chat is dormant again, the error stays in its ResumeBlock with "Try again"
        expect(shown(chat({ state: 'dormant' }), { resumeRunning: false })).toEqual(nothing);
    });

    it('has no text without a chat', () => {
        expect(runStateText(undefined, 'header')).toBeUndefined();
        expect(showRunStatus(undefined)).toBe(false);
    });
});

describe('runSince', () => {
    it('takes running_since of the gateway', () => {
        const since = '2026-10-06T10:05:00Z';
        expect(runSince(chat({ running: true, running_since: since }))).toBe(Date.parse(since));
    });

    it('falls back to the last user message', () => {
        const messages = [
            msg(1, 'user', '2026-10-06T09:00:00Z'),
            msg(2, 'assistant'),
            msg(3, 'user', '2026-10-06T10:01:00Z'),
            msg(4, 'assistant'),
        ];
        expect(runSince(chat({ running: true }), messages)).toBe(Date.parse('2026-10-06T10:01:00Z'));
        expect(runSince(chat({ running: true, running_since: 'garbage' }), messages)).toBe(
            Date.parse('2026-10-06T10:01:00Z'),
        );
    });

    it('is undefined when the chat does not run or nothing is known', () => {
        expect(runSince(chat({ running_since: '2026-10-06T10:05:00Z' }))).toBeUndefined();
        expect(runSince(chat({ running: true }), [msg(1, 'assistant')])).toBeUndefined();
        expect(runSince(undefined)).toBeUndefined();
    });
});

describe('formatElapsed', () => {
    it('formats seconds, minutes and hours', () => {
        expect(formatElapsed(0)).toBe('0 s');
        expect(formatElapsed(12_900)).toBe('12 s');
        expect(formatElapsed(65_000)).toBe('1:05');
        expect(formatElapsed(3_723_000)).toBe('1:02:03');
    });

    it('clamps negative values (clock skew) and ignores non-finite ones', () => {
        expect(formatElapsed(-5000)).toBe('0 s');
        expect(formatElapsed(NaN)).toBe('');
    });
});

describe('error texts', () => {
    it('passes other failures on', () => {
        expect(abortErrorText(500, 'boom')).toBe('Stopping failed: boom');
        expect(abortErrorText(409, 'not running')).toBe('The agent had already stopped.');
    });
});

describe('pendingSettled', () => {
    const p = { key: 'k', text: 'hello', afterSeq: 4 };
    it('settles with a user message stored after the send', () => {
        expect(pendingSettled(p, [msg(3, 'user'), msg(4, 'assistant')])).toBe(false);
        expect(pendingSettled(p, [msg(5, 'assistant')])).toBe(false);
        expect(pendingSettled(p, [msg(4, 'assistant'), msg(5, 'user')])).toBe(true);
    });
});
