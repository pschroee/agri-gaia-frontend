// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import { buildTranscript, isAbortText, isAbortedAnswer, stepStatus } from './transcript';
import type { PiMessage, StoredMessage } from './types';

const stored = (seq: number, message: PiMessage): StoredMessage => ({
    seq,
    role: message.role,
    message,
    created_at: '2026-10-06T10:00:00Z',
});

const ctx = { approvals: [], socketCalls: [], executions: [], running: false };
const flags = { blocked: false, pending: false, rejected: false, running: false, answerAborted: false };
const result = (content: string, isError = true): PiMessage => ({ role: 'toolResult', toolCallId: 'c1', content, isError });

describe('isAbortText', () => {
    it('recognises the abort messages of Node, pi and the bash bridge, also after output', () => {
        for (const t of [
            'This operation was aborted',
            'The operation was aborted.',
            'Request was aborted',
            'aborted',
            'Command aborted',
            'line 1\nline 2\n\nCommand aborted',
            'partial output\n\nCommand stopped by the user',
        ]) {
            expect(isAbortText(t), t).toBe(true);
        }
    });

    it('does not take real failures or mentions of an abort for one', () => {
        for (const t of [
            '',
            undefined,
            'Command exited with code 1',
            'Error: HTTP 500',
            'The upload was aborted by the server because it was too large',
            'Command aborted\n\nCommand exited with code 2',
            'Command timed out after 30 seconds',
        ]) {
            expect(isAbortText(t), String(t)).toBe(false);
        }
    });
});

describe('isAbortedAnswer', () => {
    it('takes pi\'s stopReason "aborted" and an "error" that only reports the abort', () => {
        expect(isAbortedAnswer({ stopReason: 'aborted' })).toBe(true);
        expect(isAbortedAnswer({ stopReason: 'error', errorMessage: 'This operation was aborted' })).toBe(true);
        expect(isAbortedAnswer({ stopReason: 'error', errorMessage: '429 rate limit' })).toBe(false);
        expect(isAbortedAnswer({ stopReason: 'stop' })).toBe(false);
    });
});

describe('stepStatus', () => {
    it('shows a call the user stopped as aborted, not as failed', () => {
        expect(stepStatus(result('This operation was aborted'), flags)).toBe('aborted');
        expect(stepStatus(result('out\n\nCommand stopped by the user'), flags)).toBe('aborted');
        expect(stepStatus(result('Command exited with code 1'), flags)).toBe('error');
        expect(stepStatus(result('ok', false), flags)).toBe('done');
    });

    it('keeps approval states first and rejected calls as stopped', () => {
        expect(stepStatus(result('aborted'), { ...flags, blocked: true })).toBe('blocked');
        expect(stepStatus(undefined, { ...flags, pending: true })).toBe('waiting');
        expect(stepStatus(result('Rejected by the user'), { ...flags, rejected: true })).toBe('stopped');
    });

    it('marks calls without a result by the state of the run and of their answer', () => {
        expect(stepStatus(undefined, { ...flags, running: true })).toBe('running');
        expect(stepStatus(undefined, flags)).toBe('stopped');
        expect(stepStatus(undefined, { ...flags, answerAborted: true })).toBe('aborted');
    });
});

describe('buildTranscript after an abort', () => {
    const call = { type: 'toolCall' as const, id: 'c1', name: 'bash', arguments: { command: 'sleep 600' } };

    it('shows the stopped step and a muted note instead of "Error: This operation was aborted"', () => {
        const items = buildTranscript(
            [
                stored(1, { role: 'user', content: 'Wait ten minutes' }),
                stored(2, { role: 'assistant', content: [call], stopReason: 'toolUse' }),
                stored(3, { role: 'toolResult', toolCallId: 'c1', content: 'Command aborted', isError: true }),
                stored(4, {
                    role: 'assistant',
                    content: [],
                    stopReason: 'error',
                    errorMessage: 'This operation was aborted',
                }),
            ],
            ctx,
        );
        const agent = items[1];
        if (agent.kind !== 'agent') throw new Error('agent expected');
        expect(agent.parts).toMatchObject([{ type: 'steps', steps: [{ id: 'c1', status: 'aborted' }] }]);
        expect(agent.error).toBeUndefined();
        expect(agent.stopped).toBe(true);
    });

    it('marks a call of an aborted answer without a result as aborted', () => {
        const items = buildTranscript(
            [stored(2, { role: 'assistant', content: [call], stopReason: 'aborted', errorMessage: 'Request was aborted' })],
            ctx,
        );
        expect(items[0]).toMatchObject({ stopped: true, parts: [{ steps: [{ status: 'aborted' }] }] });
    });

    it('keeps real errors as errors', () => {
        const items = buildTranscript(
            [
                stored(2, { role: 'assistant', content: [call] }),
                stored(3, { role: 'toolResult', toolCallId: 'c1', content: 'Command exited with code 1', isError: true }),
                stored(4, { role: 'assistant', content: [], stopReason: 'error', errorMessage: '500 upstream' }),
            ],
            ctx,
        );
        expect(items[0]).toMatchObject({ error: '500 upstream', parts: [{ steps: [{ status: 'error' }] }] });
        expect(items[0]).not.toHaveProperty('stopped');
    });
});
