// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import {
    groupRuns,
    mergeLLMCalls,
    mergeRunMeta,
    mergeSubagentEntries,
    runUsage,
    runDuration,
    runItems,
    runsSummary,
    runStatus,
    runSubtitle,
    runTitle,
    shortRunId,
} from './subagents';
import type { LLMCall, SubagentEntry, SubagentRunMeta } from './types';

const T0 = Date.parse('2026-10-06T10:00:00Z');
const at = (s: number) => new Date(T0 + s * 1000).toISOString();

const entry = (
    run: string,
    id: string,
    kind: SubagentEntry['kind'],
    s: number,
    payload: SubagentEntry['payload'] = {},
    extra: Partial<SubagentEntry> = {},
): SubagentEntry => ({
    chat_id: 'c1',
    run_id: run,
    entry_id: id,
    agent: 'researcher',
    kind,
    payload,
    confirmed: true,
    created_at: at(s),
    ...extra,
});

const meta = (run: string, extra: Partial<SubagentRunMeta> = {}): SubagentRunMeta => ({
    chat_id: 'c1',
    run_id: run,
    agent: 'researcher',
    updated_at: at(0),
    ...extra,
});

const call = (id: number, response: string, cost: number): LLMCall => ({
    id,
    model: 'deepseek-flash',
    response_id: response,
    input: 1000,
    output: 200,
    cache_read: 0,
    cost,
    peak: false,
    started_at: at(0),
    duration_ms: 900,
    main: false,
});

const entries = [
    entry('run-abcdef1', 'e3', 'tool_result', 5, { name: 'bash', tool_call_id: 'x1' }),
    entry('run-abcdef1', 'e1', 'task', 1, { text: 'Task: Count the images per class\nmore' }),
    entry(
        'run-abcdef1',
        'e2',
        'tool_call',
        2,
        { name: 'bash', id: 'x1', arguments: '{"command":"ls data"}' },
        { response_id: 'r1' },
    ),
    entry('run-abcdef1', 'e4', 'text', 9, { text: 'Two classes, 15 images each.' }, { response_id: 'r2' }),
    entry('run-2', 'f1', 'task', 3, { text: 'Check labels' }, { agent: 'reviewer' }),
];

describe('subagent runs', () => {
    it('merges entries and metadata without losing older fields', () => {
        const l = mergeSubagentEntries(entries.slice(0, 2), [entries[1], entries[2]]);
        expect(l.map((e) => e.entry_id)).toEqual(['e3', 'e1', 'e2']);
        const m = mergeRunMeta(
            [meta('r', { label: 'reid', state: 'running' })],
            [meta('r', { label: '', state: 'complete' })],
        );
        expect(m).toHaveLength(1);
        expect(m[0].label).toBe('reid');
        expect(m[0].state).toBe('complete');
        expect(mergeLLMCalls([call(1, 'a', 0.1)], [call(1, 'a', 0.2), call(2, 'b', 0.3)]).map((c) => c.cost)).toEqual([
            0.2, 0.3,
        ]);
    });

    it('groups entries per run, adds metadata and runs without entries', () => {
        const runs = groupRuns(entries, [
            meta('run-2', { label: 'labels', state: 'failed', agent: '' }),
            meta('run-3', { started_at: at(20), state: 'running', agent: 'worker' }),
            meta('run-4'), // without start and entries: not shown
        ]);
        expect(runs.map((r) => r.runId)).toEqual(['run-abcdef1', 'run-2', 'run-3']);
        const [a, b, c] = runs;
        expect(a.start).toBe(T0 + 1000);
        expect(a.end).toBe(T0 + 9000);
        expect(a.toolCalls).toBe(1);
        expect(a.task).toMatch(/^Task: Count/);
        expect(b.agent).toBe('reviewer');
        expect(b.label).toBe('labels');
        expect(c.entries).toEqual([]);
        expect(c.agent).toBe('worker');
    });

    it('takes pi-subagents state over the estimate', () => {
        const now = T0 + 20_000;
        const [a] = groupRuns(entries);
        expect(runStatus(a, { chatRunning: true, now })).toBe('done'); // ends with a text answer
        expect(runStatus({ ...a, state: 'running' }, { chatRunning: false, now })).toBe('running');
        expect(runStatus({ ...a, state: 'failed' }, { chatRunning: false, now })).toBe('failed');
        expect(runStatus({ ...a, state: 'cancelled' }, { chatRunning: false, now })).toBe('stopped');
        const open = { ...a, entries: a.entries.slice(0, 2), end: T0 + 2000 };
        expect(runStatus(open, { chatRunning: true, now })).toBe('running');
        expect(runStatus(open, { chatRunning: true, now: T0 + 200_000 })).toBe('idle');
        expect(runStatus(open, { chatRunning: false, now: T0 + 200_000 })).toBe('stopped');
        expect(runsSummary(['running', 'done', 'done', 'stopped'])).toBe('1 running · 2 done · 1 ended');
    });

    it('names runs and measures them', () => {
        const [a, b] = groupRuns(entries, [meta('run-2', { label: 'labels' })]);
        expect(runTitle(a)).toBe('Count the images per class');
        expect(runTitle(b)).toBe('labels');
        expect(runTitle({ agent: '', task: '' })).toBe('Subagent');
        expect(runSubtitle(a)).toBe('researcher · run run-ab');
        expect(shortRunId('abcdefgh#2')).toBe('abcdef#2');
        expect(runDuration(a, 'done', T0 + 60_000)).toBe(8000);
        expect(runDuration(a, 'running', T0 + 60_000)).toBe(59_000);
    });

    it('sums the tokens of the model calls whose responses occur in the run, without their cost', () => {
        const [a, b] = groupRuns(entries);
        const calls = [call(1, 'r1', 0.0012), call(2, 'r2', 0.0008), call(3, 'main-1', 0.5)];
        expect(runUsage(a, calls)).toEqual({ calls: 2, tokens: 2400 });
        expect(runUsage(b, calls)).toBeUndefined();
        expect(runUsage(a, [])).toBeUndefined();
    });

    it('builds the run steps: task, tool calls with their result, text', () => {
        const [a] = groupRuns(entries);
        const items = runItems(a, false);
        expect(items.map((i) => i.type)).toEqual(['task', 'steps', 'text']);
        const steps = items[1].type === 'steps' ? items[1].steps : [];
        expect(steps).toEqual([{ id: 'e2', tool: 'bash', summary: 'ls data', status: 'done' }]);
        // an open call runs while the run is live, otherwise it did not finish
        const open = { entries: a.entries.filter((e) => e.kind !== 'tool_result') };
        const live = runItems(open, true)[1];
        expect(live.type === 'steps' && live.steps[0].status).toBe('running');
        const ended = runItems(open, false)[1];
        expect(ended.type === 'steps' && ended.steps[0].status).toBe('stopped');
        // a failed result without ID goes to the oldest open call of the same name
        const err = runItems(
            {
                entries: [
                    entry('r', 'c1', 'tool_call', 1, { name: 'read' }),
                    entry('r', 'c2', 'tool_call', 2, { name: 'bash' }),
                    entry('r', 'c3', 'tool_result', 3, { name: 'bash', is_error: true }),
                ],
            },
            true,
        )[0];
        expect(err.type === 'steps' && err.steps.map((s) => s.status)).toEqual(['running', 'error']);
    });
});
