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
    inputControls,
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
        const places: StatePlace[] = ['header', 'list'];
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
    const PLACES: StatePlace[] = ['header', 'list'];
    // what header and list show for a chat (the input field shows no state since issue #54), with the live options of the open view
    const shown = (c: RunChat, opts: Parameters<typeof runStateOf>[1] = {}) => {
        const s = runStateOf(c, opts);
        return Object.fromEntries(PLACES.map((p) => [p, runStateText(s, p)]));
    };
    const nothing = { header: undefined, list: undefined };

    it('shows nothing for a ready active chat: no "active", no "Idle"', () => {
        expect(shown(chat())).toEqual(nothing);
        expect(inputControls(runStateOf(chat()), false).buttons).toEqual(['send']);
    });

    it('shows nothing for a ready dormant chat', () => {
        expect(shown(chat({ state: 'dormant' }))).toEqual(nothing);
        expect(inputControls(runStateOf(chat({ state: 'dormant' })), false).buttons).toEqual(['send']);
    });

    it('shows "loading" in header and lists while resuming, nothing below the input (steps in the transcript)', () => {
        const want = { header: 'loading', list: 'loading' };
        expect(shown(chat({ state: 'dormant', resuming: true }))).toEqual(want);
        expect(shown(chat({ state: 'dormant' }), { resumeRunning: true })).toEqual(want);
        expect(isLoading('resuming')).toBe(true);
        expect(inputControls('resuming', false).buttons).toEqual(['send']);
    });

    it('shows a new chat without a warm slot as loading too', () => {
        expect(shown(chat({ starting: true, resuming: true }))).toEqual({
            header: 'loading',
            list: 'loading',
        });
        expect(isLoading('starting')).toBe(true);
        expect(inputControls('starting', true).buttons).toEqual(['send']);
    });

    it('shows working in header and lists, with Stop in the input', () => {
        expect(shown(chat({ running: true }))).toEqual({ header: 'working', list: 'working' });
        expect(inputControls('working', false).buttons).toEqual(['stop']);
    });

    it('shows a pending approval in header and lists, with Stop in the input', () => {
        expect(shown(chat({ running: true }), { pendingApprovals: 1 })).toEqual({
            header: 'needs approval',
            list: 'waiting for approval',
        });
        expect(inputControls('waiting', false).buttons).toEqual(['stop']);
    });

    it('shows no state after a failed resume', () => {
        // the chat is dormant again, the error stays in its ResumeBlock with "Try again"
        expect(shown(chat({ state: 'dormant' }), { resumeRunning: false })).toEqual(nothing);
    });

    it('has no text without a chat', () => {
        expect(runStateText(undefined, 'header')).toBeUndefined();
        expect(inputControls(undefined, true).buttons).toEqual(['send']);
    });
});

// issue #39: Stop in the input field, no status bar above it
describe('input controls', () => {
    it('offers the send arrow while nothing runs, with or without text', () => {
        for (const s of ['idle', 'starting', 'resuming', undefined] as const) {
            expect(inputControls(s, false)).toEqual({ buttons: ['send'], enter: 'send' });
            expect(inputControls(s, true)).toEqual({ buttons: ['send'], enter: 'send' });
        }
    });

    it('turns the send arrow into Stop while the agent works and the field is empty', () => {
        expect(inputControls('working', false)).toEqual({ buttons: ['stop'], enter: 'queue' });
    });

    it('puts the queue arrow last and Stop next to it when there is text: Enter queues', () => {
        const c = inputControls('working', true);
        expect(c).toEqual({ buttons: ['stop', 'queue'], enter: 'queue' });
        // the last place (where the pointer goes after typing) never stops
        expect(c.buttons.at(-1)).not.toBe('stop');
    });

    it('keeps Stop while waiting for an approval', () => {
        expect(inputControls('waiting', false).buttons).toEqual(['stop']);
        expect(inputControls('waiting', true).buttons).toEqual(['stop', 'queue']);
    });

    it('sends instead of queueing when the chat is not marked running (approval of an idle chat)', () => {
        expect(inputControls('waiting', true, false)).toEqual({ buttons: ['stop', 'send'], enter: 'send' });
        // a resuming chat that the gateway still marks running queues
        expect(inputControls('resuming', true, true)).toEqual({ buttons: ['queue'], enter: 'queue' });
    });

    it('words a failed stop for the line below the input', () => {
        expect(abortErrorText(502, 'gateway unreachable')).toBe('Stopping failed: gateway unreachable');
        expect(abortErrorText(409, 'not running')).toBe('The agent had already stopped.');
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
