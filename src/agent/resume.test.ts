// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import { formatMs } from './format';
import {
    RESUME_PHASES,
    applyResumeStep,
    closeResumes,
    formatBytes,
    resumeAnchor,
    resumeRunning,
    resumeSummary,
    resumeOnOpen,
    stepDetail,
} from './resume';
import type { ResumeView } from './resume';
import type { ResumeStep } from './types';

const step = (
    phase: ResumeStep['phase'],
    status: ResumeStep['status'],
    extra: Partial<ResumeStep> = {},
): ResumeStep => ({
    id: 'r1',
    phase,
    status,
    at: '2026-10-06T10:00:00Z',
    ...extra,
});

const run = (steps: ResumeStep[], lastSeq = 7) =>
    steps.reduce<ResumeView[]>((l, s) => applyResumeStep(l, s, lastSeq), []);

describe('applyResumeStep', () => {
    it('starts a resume with all phases pending and remembers the last stored seq', () => {
        const [r] = run([step('acquire', 'running')]);
        expect(r.state).toBe('running');
        expect(r.afterSeq).toBe(7);
        expect(r.steps.map((s) => s.phase)).toEqual(RESUME_PHASES);
        expect(r.steps.map((s) => s.status)).toEqual(['running', 'pending', 'pending', 'pending', 'pending']);
    });

    it('updates a phase from running to done with its numbers', () => {
        const [r] = run([
            step('acquire', 'running'),
            step('acquire', 'done', { detail: 'p-3', ms: 120 }),
            step('session', 'running'),
            step('session', 'done', { size: 48_000, ms: 300 }),
        ]);
        expect(r.steps[0]).toMatchObject({ phase: 'acquire', status: 'done', detail: 'p-3', ms: 120 });
        expect(r.steps[1]).toMatchObject({ phase: 'session', status: 'done', size: 48_000 });
        expect(r.steps[2].status).toBe('pending');
        expect(resumeRunning([r])).toBe(true);
    });

    it('ends with ready and keeps the total duration', () => {
        const list = run([step('acquire', 'done'), step('ready', 'done', { ms: 2400 })]);
        expect(list[0].state).toBe('done');
        expect(list[0].totalMs).toBe(2400);
        expect(resumeRunning(list)).toBe(false);
    });

    it('marks the running step as failed and keeps the reason', () => {
        const [r] = run([
            step('acquire', 'done'),
            step('session', 'running'),
            step('failed', 'error', { detail: 'no free sandbox', ms: 30_000 }),
        ]);
        expect(r.state).toBe('failed');
        expect(r.error).toBe('no free sandbox');
        expect(r.steps[1].status).toBe('error');
        expect(r.steps[0].status).toBe('done');
    });

    it('keeps a warning of a step', () => {
        const [r] = run([step('workspace', 'warning', { detail: 'restoring failed' })]);
        expect(r.steps[3]).toMatchObject({ status: 'warning', detail: 'restoring failed' });
        expect(resumeSummary({ ...r, state: 'done', totalMs: 1500 }, formatMs)).toBe(
            'Resumed in a fresh sandbox · 1.5 s · with warning',
        );
    });

    it('starts a second resume for a new id and leaves the first one alone', () => {
        let list = run([step('ready', 'done', { ms: 900 })]);
        list = applyResumeStep(list, step('acquire', 'running', { id: 'r2' }), 12);
        expect(list).toHaveLength(2);
        expect(list[0].state).toBe('done');
        expect(list[1]).toMatchObject({ id: 'r2', state: 'running', afterSeq: 12 });
    });

    it('ignores unknown phases', () => {
        const list = run([step('acquire', 'running')]);
        const same = applyResumeStep(list, step('mystery' as ResumeStep['phase'], 'done'), 7);
        expect(same).toBe(list);
    });
});

describe('start of a new chat', () => {
    it('keeps the start mark of the gateway and names it in the texts', () => {
        const steps = [step('acquire', 'running', { start: true }), step('acquire', 'done', { start: true })];
        const [r] = run(steps, 0);
        expect(r.start).toBe(true);
        expect(resumeSummary(r, formatMs)).toBe('Starting a sandbox for the chat …');
        expect(resumeSummary({ ...r, state: 'done', totalMs: 16200 }, formatMs)).toBe('Started in a fresh sandbox · 16.2 s');
        expect(resumeSummary({ ...r, state: 'failed', error: 'No free slot in the pool' }, formatMs)).toBe(
            'Starting the sandbox failed: No free slot in the pool',
        );
    });

    it('marks a resume as start even when the first step seen lacks the mark', () => {
        const [r] = run([step('acquire', 'running'), step('session', 'running', { start: true })], 0);
        expect(r.start).toBe(true);
    });
});

describe('closeResumes', () => {
    it('finishes resumes whose ready event got lost', () => {
        const list = run([step('acquire', 'done'), step('session', 'running')]);
        const closed = closeResumes(list);
        expect(closed[0].state).toBe('done');
        expect(closed[0].steps[1].status).toBe('done');
    });

    it('returns the same list when nothing runs', () => {
        const list = run([step('ready', 'done')]);
        expect(closeResumes(list)).toBe(list);
    });
});

describe('texts', () => {
    it('summarizes running, done and failed resumes', () => {
        const [r] = run([step('acquire', 'running')]);
        expect(resumeSummary(r, formatMs)).toBe('Resuming the chat …');
        expect(resumeSummary({ ...r, state: 'done', totalMs: 2400 }, formatMs)).toBe(
            'Resumed in a fresh sandbox · 2.4 s',
        );
        expect(resumeSummary({ ...r, state: 'done' }, formatMs)).toBe('Resumed in a fresh sandbox');
        expect(resumeSummary({ ...r, state: 'failed', error: 'timeout' }, formatMs)).toBe('Resuming failed: timeout');
    });

    it('describes finished steps, never the slot id', () => {
        expect(stepDetail({ phase: 'acquire', status: 'done', detail: 'p-3' })).toBeUndefined();
        expect(stepDetail({ phase: 'session', status: 'done', size: 2048 })).toBe('2.0 KiB');
        expect(stepDetail({ phase: 'session', status: 'done', detail: 'no session saved' })).toBe('no session saved');
        expect(stepDetail({ phase: 'workspace', status: 'done', size: 1_300_000, files: 14 })).toBe(
            '1.2 MiB, 14 files',
        );
        expect(stepDetail({ phase: 'inputs', status: 'done', size: 0, files: 0 })).toBe('no files');
        expect(stepDetail({ phase: 'workspace', status: 'done', detail: 'no backup' })).toBe('no backup');
        expect(stepDetail({ phase: 'settings', status: 'done', detail: 'internet off' })).toBe('internet off');
        expect(stepDetail({ phase: 'workspace', status: 'running', size: 10, files: 1 })).toBeUndefined();
    });

    it('formats bytes in binary units', () => {
        expect(formatBytes(512)).toBe('512 B');
        expect(formatBytes(1536)).toBe('1.5 KiB');
        expect(formatBytes(20 * 1024 * 1024)).toBe('20 MiB');
        expect(formatBytes(-1)).toBe('');
    });
});

describe('resumeAnchor', () => {
    const items = [
        { kind: 'user', seq: 1 },
        { kind: 'agent', seq: 2 },
        { kind: 'notice', seq: 8 },
        { kind: 'user', seq: 8 },
        { kind: 'agent', seq: 9 },
    ];
    it('places a resume after the user message that triggered it', () => {
        expect(resumeAnchor(items, { afterSeq: 7 })).toBe(3);
    });
    it('places it at the end while that message is not stored yet', () => {
        expect(resumeAnchor(items, { afterSeq: 9 })).toBe(-1);
        expect(resumeAnchor([{ kind: 'agent' }], { afterSeq: 0 })).toBe(-1);
    });
});

describe('resume on opening the chat (issue #31)', () => {
    it('marks a resume started by opening the chat, and keeps the mark for its later steps', () => {
        let l = applyResumeStep([], step('acquire', 'running'), 4, true);
        l = applyResumeStep(l, step('acquire', 'done'), 6);
        l = applyResumeStep(l, step('ready', 'done', { ms: 3100 }), 6);
        expect(l).toHaveLength(1);
        expect(l[0]).toMatchObject({ opened: true, afterSeq: 4, state: 'done', totalMs: 3100 });
        expect(run([step('acquire', 'running')])[0].opened).toBeUndefined();
    });

    it('resumes only a chat the gateway let idle', () => {
        const at = (chat: Parameters<typeof resumeOnOpen>[0]['chat']) =>
            resumeOnOpen({ chat, loaded: true, streamReady: true, decided: false });
        expect(at({ state: 'dormant' })).toBe('resume');
        expect(at({ state: 'active' })).toBe('skip');
        expect(at({ state: 'dormant', resuming: true })).toBe('skip');
        expect(at({ state: 'dormant', resuming: true, starting: true })).toBe('skip');
    });

    it('waits for the loaded chat and the stream, then decides once', () => {
        const chat = { state: 'dormant' as const };
        // the gateway's "chat" event on subscribing can come before the load with the messages
        expect(resumeOnOpen({ chat, loaded: false, streamReady: true, decided: false })).toBe('wait');
        expect(resumeOnOpen({ chat, loaded: true, streamReady: false, decided: false })).toBe('wait');
        expect(resumeOnOpen({ chat: undefined, loaded: true, streamReady: true, decided: false })).toBe('wait');
        expect(resumeOnOpen({ chat, loaded: true, streamReady: true, decided: true })).toBe('skip');
    });

    it('does not resume a chat that the gateway lets idle while it is open', () => {
        // opened active: decided "skip"; later the chat event says dormant, but the decision stands
        expect(resumeOnOpen({ chat: { state: 'active' }, loaded: true, streamReady: true, decided: false })).toBe('skip');
        expect(resumeOnOpen({ chat: { state: 'dormant' }, loaded: true, streamReady: true, decided: true })).toBe('skip');
    });

    it('never mentions resting in its texts', () => {
        const [r] = run([step('acquire', 'running')]);
        const texts = [
            resumeSummary(r, formatMs),
            resumeSummary({ ...r, state: 'done', totalMs: 9000 }, formatMs),
            resumeSummary({ ...r, state: 'failed', error: 'x' }, formatMs),
            resumeSummary({ ...r, start: true }, formatMs),
        ].join(' ');
        expect(texts).not.toMatch(/rest\b|resting|dormant/i);
    });
});
