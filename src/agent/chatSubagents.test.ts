// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from 'vitest';

import { agentApi } from './api';
import {
    RUNS_STALE_MS,
    cachedRuns,
    dropUnknownSubagent,
    ensureChatRuns,
    needsLoad,
    runsCacheReducer,
    selectionFor,
    summaryNav,
} from './chatSubagents';
import type { RunsCache, RunsCacheAction } from './chatSubagents';
import type { SubagentRunSummary } from './types';

const NOW = Date.parse('2026-10-07T12:00:00Z');
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

const runs: SubagentRunSummary[] = [
    {
        run_id: 'r1',
        agent: 'worker',
        label: 'models',
        state: 'complete',
        task_head: '## Task\nList the models',
        started_at: iso(-60_000),
        last_at: iso(-30_000),
        last_kind: 'text',
        entries: 4,
    },
    {
        run_id: 'r2',
        agent: 'worker',
        label: 'worker',
        task_head: '[Context]\n## Task\n**List the datasets** of the platform',
        started_at: iso(-20_000),
        last_at: iso(-5_000),
        last_kind: 'tool_call',
        entries: 2,
    },
    {
        run_id: 'abcdef123456',
        agent: 'scout',
        started_at: iso(-10 * 60_000),
        last_at: iso(-9 * 60_000),
        last_kind: 'tool_result',
        entries: 1,
    },
];

describe('summaryNav', () => {
    it('titles short runs with the rule of the open chat and estimates missing states', () => {
        const items = summaryNav(runs, 'c1', { chatRunning: false, now: NOW });
        expect(items.map((i) => i.title)).toEqual(['models', 'List the datasets of the platform', 'scout · abcdef']);
        // state from pi-subagents; without it: recent activity runs, old activity without an answer has ended
        expect(items.map((i) => i.status)).toEqual(['done', 'running', 'stopped']);
        // a text answer as the newest entry counts as done
        const answered = summaryNav([{ ...runs[2], last_kind: 'text' }], 'c1', { chatRunning: false, now: NOW });
        expect(answered[0].status).toBe('done');
    });
});

describe('the cache of short lists', () => {
    const chat = { id: 'c1', subagents: 3, running: false };

    it('loads once, then shows the cached list', async () => {
        let cache: RunsCache = {};
        const dispatch = (a: RunsCacheAction) => {
            cache = runsCacheReducer(cache, a);
        };
        const inflight = new Set<string>();
        let release: (l: SubagentRunSummary[]) => void = () => undefined;
        const fetchRuns = vi.fn(() => new Promise<SubagentRunSummary[]>((r) => (release = r)));
        const deps = () => ({ cache, inflight, fetchRuns, dispatch, now: () => NOW });

        const first = ensureChatRuns(chat, deps());
        expect(cache.c1).toEqual({ status: 'loading', previous: undefined });
        // a second click while loading does not load again
        await ensureChatRuns(chat, deps());
        expect(fetchRuns).toHaveBeenCalledTimes(1);
        release(runs);
        await first;
        expect(cache.c1).toMatchObject({ status: 'loaded', count: 3, live: true, at: NOW });
        expect(cachedRuns(cache.c1)).toBe(runs);
        // expanding again uses the cache
        await ensureChatRuns(chat, deps());
        expect(fetchRuns).toHaveBeenCalledTimes(1);
        expect(fetchRuns).toHaveBeenCalledWith('c1');
    });

    it('loads again when the number of runs changed, a live list is stale, or loading failed', () => {
        const loaded = { status: 'loaded' as const, runs, count: 3, live: false, at: NOW };
        expect(needsLoad(undefined, chat, NOW)).toBe(true);
        expect(needsLoad({ status: 'loading' }, chat, NOW)).toBe(false);
        expect(needsLoad(loaded, chat, NOW + 10 * RUNS_STALE_MS)).toBe(false);
        expect(needsLoad(loaded, { subagents: 4 }, NOW)).toBe(true);
        expect(needsLoad({ ...loaded, live: true }, chat, NOW + RUNS_STALE_MS - 1)).toBe(false);
        expect(needsLoad({ ...loaded, live: true }, chat, NOW + RUNS_STALE_MS + 1)).toBe(true);
        expect(needsLoad({ status: 'error', error: 'x', at: NOW }, chat, NOW)).toBe(true);
    });

    it('keeps the old list visible during a reload and reports a failure', async () => {
        let cache: RunsCache = { c1: { status: 'loaded', runs, count: 2, live: false, at: NOW } };
        const dispatch = (a: RunsCacheAction) => {
            cache = runsCacheReducer(cache, a);
        };
        let fail: (e: Error) => void = () => undefined;
        const p = ensureChatRuns(chat, {
            cache,
            inflight: new Set(),
            fetchRuns: () => new Promise((_, rej) => (fail = rej)),
            dispatch,
            now: () => NOW,
        });
        expect(cachedRuns(cache.c1)).toBe(runs);
        fail(new Error('502 Bad Gateway'));
        await p;
        expect(cache.c1).toEqual({ status: 'error', error: '502 Bad Gateway', at: NOW });
    });
});

describe('agentApi.subagentRuns', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('only reads the short list: one GET, nothing that opens or resumes the chat', async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify(runs), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);
        expect(await agentApi.subagentRuns('c 1')).toEqual(runs);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toMatch(/\/agent\/api\/chats\/c%201\/subagent-runs$/);
        expect(init.method ?? 'GET').toBe('GET');
    });
});

describe('opening a subagent of another chat', () => {
    it('selects the chat together with the run', () => {
        expect(selectionFor('c2', 'r1')).toEqual({ chatId: 'c2', runId: 'r1' });
        expect(selectionFor('c2')).toBeUndefined();
        expect(selectionFor(undefined, 'r1')).toBeUndefined();
    });

    it('keeps the selection until the chat is loaded, then only if the run is known', () => {
        const v = { subagentId: 'r1', known: false, loaded: false, loading: false };
        // the freshly mounted view of the other chat has loaded nothing yet
        expect(dropUnknownSubagent(v)).toBe(false);
        expect(dropUnknownSubagent({ ...v, loading: true })).toBe(false);
        expect(dropUnknownSubagent({ ...v, loaded: true, known: true })).toBe(false);
        // loaded and the run is not there: back to the chat
        expect(dropUnknownSubagent({ ...v, loaded: true })).toBe(true);
        expect(dropUnknownSubagent({ ...v, subagentId: undefined, loaded: true })).toBe(false);
    });
});
