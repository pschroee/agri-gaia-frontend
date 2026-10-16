// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi, afterEach } from 'vitest';

import { applyJobEvent, fetchJobs, jobByToolCall, jobEvent, jobOfStep, WatchJob } from './jobs';
import type { PlanStep } from './plan';

const job = (over: Partial<WatchJob> = {}): WatchJob => ({
    id: 'j1',
    chat_id: 'c1',
    kind: 'training',
    state: 'running',
    ...over,
});

describe('jobEvent', () => {
    it('reads the job of a data line', () => {
        const ev = jobEvent(JSON.stringify({ kind: 'job', data: { change: 'progress', job: job() } }));
        expect(ev?.change).toBe('progress');
        expect(ev?.job.id).toBe('j1');
    });

    it('defaults the change when the gateway leaves it out', () => {
        const ev = jobEvent(JSON.stringify({ kind: 'job', data: { job: job() } }));
        expect(ev?.change).toBe('progress');
    });

    it('ignores other kinds, broken JSON and a job without an id', () => {
        expect(jobEvent(JSON.stringify({ kind: 'approval', data: {} }))).toBeUndefined();
        expect(jobEvent('not json')).toBeUndefined();
        expect(jobEvent(JSON.stringify({ kind: 'job', data: { change: 'progress' } }))).toBeUndefined();
    });
});

describe('applyJobEvent', () => {
    it('replaces a known job and keeps the list newest first', () => {
        const list = [job({ id: 'a' }), job({ id: 'b' })];
        const next = applyJobEvent(list, { change: 'progress', job: job({ id: 'b', progress: 40 }) });
        expect(next.map((j) => j.id)).toEqual(['b', 'a']);
        expect(next[0].progress).toBe(40);
    });

    it('adds a new job in front', () => {
        const next = applyJobEvent([job({ id: 'a' })], { change: 'progress', job: job({ id: 'b' }) });
        expect(next.map((j) => j.id)).toEqual(['b', 'a']);
    });

    it('ignores a job of another chat', () => {
        const list = [job({ id: 'a' })];
        const next = applyJobEvent(list, { change: 'progress', job: job({ id: 'b', chat_id: 'c2' }) }, 'c1');
        expect(next).toBe(list);
    });
});

describe('jobByToolCall', () => {
    it('finds the job of a tool call', () => {
        const list = [job({ id: 'a', tool_call_id: 'call_1' }), job({ id: 'b', tool_call_id: 'call_2' })];
        expect(jobByToolCall(list, 'call_2')?.id).toBe('b');
    });

    it('without a call id or without a match there is none', () => {
        expect(jobByToolCall([job({ tool_call_id: 'x' })], undefined)).toBeUndefined();
        expect(jobByToolCall([job({ tool_call_id: 'x' })], 'y')).toBeUndefined();
    });
});

describe('jobOfStep', () => {
    it('finds the job the step waits for', () => {
        const step = { idx: 1, watch_job: 'j9' } as unknown as PlanStep;
        expect(jobOfStep([job({ id: 'j9' })], step)?.id).toBe('j9');
    });

    it('a step without a job has none', () => {
        expect(jobOfStep([job({ id: 'j9' })], undefined)).toBeUndefined();
        expect(jobOfStep([job({ id: 'j9' })], { idx: 1 } as unknown as PlanStep)).toBeUndefined();
    });
});

describe('fetchJobs', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('returns what the gateway sends', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => ({ ok: true, status: 200, json: async () => [job()] })),
        );
        expect((await fetchJobs('c1')).map((j) => j.id)).toEqual(['j1']);
    });

    it('a chat without the route (older gateway) has no jobs', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => ({ ok: false, status: 404 })),
        );
        expect(await fetchJobs('c1')).toEqual([]);
    });

    it('a non-list answer counts as none', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => ({ ok: true, status: 200, json: async () => null })),
        );
        expect(await fetchJobs('c1')).toEqual([]);
    });

    it('any other failure is thrown', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => ({ ok: false, status: 500, statusText: 'Server Error' })),
        );
        await expect(fetchJobs('c1')).rejects.toThrow('500 Server Error');
    });
});
