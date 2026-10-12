// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import {
    FOREGROUND_NOTE,
    STARTING_NOTE,
    deliveryText,
    foldContinuations,
    groupOpen,
    groupOpenByDefault,
    groupRuns,
    latestRunId,
    mergeLLMCalls,
    mergeRunMeta,
    mergeSubagentEntries,
    mergeSubagentMessages,
    runUsage,
    subagentInputState,
    subagentSendErrorText,
    threadIds,
    runDuration,
    runItems,
    runsSummary,
    runStatus,
    runSubtitle,
    runTitle,
    runTranscript,
    runsByCall,
    shortRunId,
    subagentNav,
    subagentStateText,
    toggleGroup,
    toolAgents,
} from './subagents';
import type { LLMCall, StoredMessage, SubagentEntry, SubagentMessage, SubagentRunMeta } from './types';

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
        expect(steps).toMatchObject([{ id: 'e2', tool: 'bash', summary: 'ls data', status: 'done' }]);
        // the call keeps its arguments and its result for the step's details (issue #58)
        expect(steps[0]).toMatchObject({ name: 'bash', args: { command: 'ls data' }, result: { isError: false } });
        // the gateway's executions of the call (by the call's ID) give exit code and duration
        const withExec = runItems(a, false, [
            {
                id: 9,
                chat_id: 'c1',
                session: 'run-abcdef1',
                tool_call_id: 'x1',
                tool: 'bash',
                op: 'bash',
                args: {},
                exit_code: 0,
                output_bytes: 0,
                started_at: at(2),
                duration_ms: 340,
            },
        ])[1];
        expect(withExec.type === 'steps' && withExec.steps[0]).toMatchObject({ durationMs: 340, executions: [{ id: 9 }] });
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

describe('looking into subagents (issue #48)', () => {
    it('titles a run by its name, else the first meaningful line of the task, never "Subagent n"', () => {
        expect(runTitle({ agent: 'worker', label: ' summary-datasets ', task: 'Do it' })).toBe('summary-datasets');
        expect(runTitle({ agent: 'worker', task: '\n\n## Task: Summarise the **datasets**\nthen more' })).toBe(
            'Summarise the datasets',
        );
        expect(runTitle({ agent: 'worker', task: '---\n[Context]\n- `ls` the models\n' })).toBe('ls the models');
        expect(runTitle({ agent: 'worker', task: '1. Count   the\timages' })).toBe('Count the images');
        expect(runTitle({ agent: 'worker', task: '## Task\nSummarise the models\n' })).toBe('Summarise the models');
        expect(runTitle({ agent: 'worker', task: 'Context:\nThe platform has 3 datasets.' })).toBe(
            'The platform has 3 datasets.',
        );
        expect(runTitle({ agent: 'worker', task: 'x'.repeat(100) }, 20)).toBe(`${'x'.repeat(19)}…`);
        expect(runTitle({ agent: 'worker', task: '```\n***\n' })).toBe('worker');
        expect(runTitle({ agent: 'worker', task: 'Zähle die Bilder' })).toBe('Zähle die Bilder');
    });

    it('ignores a label that is only the agent name and takes the task instead (issue #52)', () => {
        const task = '## Task\n\nCount the images per class in dataset 42.\nThen write a table.\n\n- step 1\n- step 2';
        expect(runTitle({ agent: 'worker', label: 'worker', task })).toBe('Count the images per class in dataset 42.');
        expect(runTitle({ agent: 'scout', label: ' Scout ', task: 'Find the models' })).toBe('Find the models');
        expect(runTitle({ agent: 'planner', label: '', task: 'Plan the training' })).toBe('Plan the training');
        // a label of its own still wins
        expect(runTitle({ agent: 'worker', label: 'count-images', task })).toBe('count-images');
        // nothing meaningful in the task: the agent name as last fallback
        expect(runTitle({ agent: 'worker', label: 'worker', task: '---' })).toBe('worker');
        expect(runTitle({ agent: 'worker', label: 'worker' })).toBe('worker');
        expect(runTitle({ agent: '', label: 'worker' })).toBe('worker');
        expect(runTitle({ agent: '' })).toBe('Subagent');
    });

    it('lists the sub-entries with title and state; runs without name or task keep apart', () => {
        const runs = groupRuns(entries, [
            meta('run-2', { label: 'labels', state: 'complete' }),
            meta('abcdefgh', { started_at: at(30), state: 'running', agent: 'worker', label: 'worker' }),
            meta('zyxwvuts', { started_at: at(31), state: 'failed', agent: '' }),
        ]);
        const nav = subagentNav(runs, { chatRunning: true, now: T0 + 40_000 });
        expect(nav.map((n) => [n.title, n.status])).toEqual([
            ['Count the images per class', 'done'],
            ['labels', 'done'],
            ['worker · abcdef', 'running'],
            ['Subagent · zyxwvu', 'failed'],
        ]);
        expect(nav[0]).not.toHaveProperty('tooltip');
        expect(nav.some((n) => /^Subagent \d/.test(n.title))).toBe(false);
        expect(subagentStateText('stopped')).toBe('ended');
        expect(subagentStateText('running')).toBe('running');
    });

    it("opens the group while one runs and keeps the user's toggle until the default changes", () => {
        expect(groupOpenByDefault(['done', 'running'])).toBe(true);
        expect(groupOpenByDefault(['done', 'failed', 'stopped'])).toBe(false);
        expect(groupOpenByDefault(['idle'])).toBe(true);
        expect(groupOpen(['running'], undefined)).toBe(true);
        expect(groupOpen(['done'], undefined)).toBe(false);
        // closed by hand while running: stays closed while it runs
        const closed = toggleGroup(['running'], undefined);
        expect(closed).toEqual({ open: false, madeWhenDefault: true });
        expect(groupOpen(['running', 'running'], closed)).toBe(false);
        // all done: the default (closed) applies again; a new run opens it again
        expect(groupOpen(['done'], closed)).toBe(false);
        const opened = toggleGroup(['done'], undefined);
        expect(groupOpen(['done'], opened)).toBe(true);
        expect(groupOpen(['done', 'running'], opened)).toBe(true);
        expect(groupOpen(['done', 'done'], { open: true, madeWhenDefault: true })).toBe(false);
        // the opened subagent keeps its group open
        expect(groupOpen(['done'], undefined, true)).toBe(true);
        expect(toggleGroup(['done'], undefined, true)).toEqual({ open: false, madeWhenDefault: false });
    });

    it('maps a run to transcript items: task as user message, text and steps as agent blocks', () => {
        const [a] = groupRuns(entries);
        const items = runTranscript(a, false);
        expect(items.map((i) => i.kind)).toEqual(['user', 'agent']);
        expect(items[0]).toMatchObject({ kind: 'user', text: 'Task: Count the images per class\nmore' });
        const agent = items[1];
        expect(agent.kind === 'agent' && agent.parts).toMatchObject([
            { type: 'steps', steps: [{ id: 'e2', tool: 'bash', summary: 'ls data', status: 'done' }] },
            { type: 'text', text: 'Two classes, 15 images each.' },
        ]);
        // keys are unique across runs, a second task starts a new user message
        const two = runTranscript(
            {
                runId: 'r',
                entries: [
                    entry('r', 't1', 'task', 1, { text: 'First' }),
                    entry('r', 'x', 'text', 2, { text: 'One' }),
                    entry('r', 't2', 'task', 3, { text: 'Second' }),
                    entry('r', 'c', 'tool_call', 4, { name: 'read', id: 'k' }),
                    entry('r', 'd', 'tool_result', 5, { name: 'read', tool_call_id: 'k', is_error: true }),
                ],
            },
            true,
        );
        // a later task is the main agent's message to the subagent: a note, never a user message (issue #81)
        expect(two.map((i) => i.kind)).toEqual(['user', 'agent', 'note', 'agent']);
        expect(new Set(two.map((i) => i.key)).size).toBe(4);
        const last = two[3];
        expect(last.kind === 'agent' && last.parts[0].type === 'steps' && last.parts[0].steps[0].status).toBe('error');
        // the step keeps its tool call ID, by which files the subagent sent find it (issue #62)
        expect(last.kind === 'agent' && last.parts[0].type === 'steps' && last.parts[0].steps[0]).toMatchObject({
            id: 'c',
            callId: 'k',
        });
        expect(runTranscript({ runId: 'e', entries: [] }, true)).toEqual([]);
    });

    it('assigns runs to the subagent call that started them', () => {
        expect(toolAgents('{"agent":"a","tasks":[{"agent":"b"},{"x":1}]}')).toEqual(['a', 'b']);
        expect(toolAgents({ chain: [{ agent: 'c' }] })).toEqual(['c']);
        expect(toolAgents('not json')).toEqual([]);
        const msg = (seq: number, s: number, calls: { id: string; args: unknown }[]): StoredMessage => ({
            seq,
            role: 'assistant',
            created_at: at(s + 1),
            message: {
                role: 'assistant',
                timestamp: T0 + s * 1000,
                content: calls.map((c) => ({ type: 'toolCall', id: c.id, name: 'subagent', arguments: c.args })),
            },
        });
        const messages = [
            msg(1, 0, [
                { id: 'call-a', args: { agent: 'researcher' } },
                { id: 'call-b', args: { agent: 'reviewer' } },
            ]),
            { seq: 2, role: 'user', created_at: at(5), message: { role: 'user', content: 'hi' } },
            msg(3, 10, [{ id: 'call-c', args: { tasks: [{ agent: 'x' }] } }]),
        ];
        const runs = [
            { runId: 'early', agent: 'researcher', start: T0 - 1000 },
            { runId: 'r1', agent: 'reviewer', start: T0 + 2000 },
            { runId: 'r2', agent: 'researcher', start: T0 + 3000 },
            { runId: 'r3', agent: 'other', start: T0 + 11_000 },
        ];
        expect(runsByCall(messages, runs)).toEqual({ 'call-b': ['r1'], 'call-a': ['r2'], 'call-c': ['r3'] });
        expect(runsByCall([], runs)).toEqual({});
    });
});

const msg = (id: number, run: string, s: number, extra: Partial<SubagentMessage> = {}): SubagentMessage => ({
    id,
    run_id: run,
    ref: `agw-${id}`,
    mode: 'steer',
    text: `text ${id}`,
    status: 'delivered',
    created_at: at(s),
    ...extra,
});

describe('messages to subagents (issue #81)', () => {
    it('folds a continuation into its origin: one entry, its state from the newest run, entries once', () => {
        const runs = groupRuns(
            [
                entry('r1', 't', 'task', 1, { text: 'Count' }),
                entry('r1', 'a', 'text', 2, { text: 'first answer' }),
                // the continuation repeats the earlier entries and carries the relay echo of the user
                entry('r2', 'a', 'text', 2, { text: 'first answer' }),
                entry('r2', 'u', 'user_echo', 3, { relay_ref: 'agw-1', text: 'Shorter please' }),
                entry('r2', 'b', 'text', 4, { text: 'short answer' }),
            ],
            [
                meta('r1', { state: 'complete', pi_run_id: 'p1', started_at: at(0), ended_at: at(2) }),
                meta('r2', {
                    state: 'running',
                    pi_run_id: 'p2',
                    continues_run_id: 'r1',
                    started_at: at(3),
                    ended_at: at(4),
                }),
            ],
        );
        expect(runs.map((r) => r.runId)).toEqual(['r1']);
        expect(threadIds(runs[0])).toEqual(['r1', 'r2']);
        expect(latestRunId(runs[0])).toBe('r2');
        expect(runs[0].piRunId).toBe('p2');
        expect(runs[0].state).toBe('running');
        expect(runs[0].entries.map((e) => e.entry_id)).toEqual(['t', 'a', 'b']);
        expect(runs[0].task).toBe('Count');
    });

    it('keeps a continuation whose origin is unknown as a thread of its own', () => {
        const runs = groupRuns(
            [entry('r2', 'b', 'text', 4, { text: 'short answer' })],
            [meta('r2', { continues_run_id: 'gone', started_at: at(3) })],
        );
        expect(runs.map((r) => r.runId)).toEqual(['r2']);
        expect(runs[0].members).toBeUndefined();
        expect(threadIds(runs[0])).toEqual(['r2']);
    });

    it('lists a thread once in the sub-entries and never a continuation of its own', () => {
        const runs = groupRuns(
            [entry('r1', 't', 'task', 1, { text: 'Count' }), entry('r2', 'b', 'text', 4, { text: 'again' })],
            [meta('r1', { state: 'complete', started_at: at(0) }), meta('r2', { continues_run_id: 'r1', started_at: at(3) })],
        );
        expect(subagentNav(runs, { chatRunning: false, now: Date.parse(at(10)) })).toHaveLength(1);
        expect(foldContinuations(runs)).toHaveLength(1);
    });

    it('places the user\'s messages by time, marks the new run after a resume or restart, and skips other runs', () => {
        const [run] = groupRuns([
            entry('r1', 't', 'task', 1, { text: 'Count' }),
            entry('r1', 'a', 'text', 2, { text: 'first' }),
            entry('r1', 'b', 'text', 6, { text: 'later' }),
        ]);
        const items = runTranscript(run, false, [], [
            msg(1, 'r1', 3, { text: 'Only ten' }),
            msg(2, 'r9', 3, { text: 'of another run' }),
            msg(3, 'r1', 5, { mode: 'restart', target_run_id: 'r2', text: 'Again' }),
        ]);
        expect(items.map((i) => i.kind)).toEqual(['user', 'agent', 'you', 'you', 'continued', 'agent']);
        expect(items[2]).toMatchObject({ kind: 'you', message: { id: 1, text: 'Only ten' } });
        expect(items[4]).toMatchObject({ kind: 'continued', mode: 'restart' });
    });

    it('never shows a later task as a user message, and hides relay echoes', () => {
        const run = {
            runId: 'r',
            entries: [
                entry('r', 't1', 'task', 1, { text: 'First' }),
                entry('r', 't2', 'task', 2, { text: 'Lenkung durch den Hauptagenten' }),
                entry('r', 'e', 'user_echo', 3, { relay_ref: 'agw-1', text: 'Echo' }),
            ],
        };
        const items = runTranscript(run, false);
        expect(items.map((i) => i.kind)).toEqual(['user', 'note']);
        expect(runItems(run, false).map((i) => i.type)).toEqual(['task', 'note']);
    });

    it('states what the user may write to a subagent now', () => {
        expect(subagentInputState({ status: 'running', piRunId: 'p1' })).toEqual({
            mode: 'open',
            placeholder: 'Message the subagent – it reads it after its current step',
            blocked: false,
        });
        expect(subagentInputState({ status: 'idle', piRunId: 'p1' }).mode).toBe('open');
        expect(subagentInputState({ status: 'done' })).toEqual({
            mode: 'open',
            placeholder: 'Ask a follow-up – continues with its history',
            blocked: false,
        });
        // a run inside a step of the main agent cannot be addressed while it runs
        expect(subagentInputState({ status: 'running' })).toMatchObject({
            mode: 'locked',
            note: FOREGROUND_NOTE,
            blocked: true,
        });
        // the last message has not arrived: the field stays, sending waits
        expect(subagentInputState({ status: 'done', pending: true })).toMatchObject({
            mode: 'open',
            note: 'Waiting for your last message to arrive',
            blocked: true,
        });
        expect(subagentInputState({ status: 'done', trashed: true }).mode).toBe('hidden');
    });

    it('names a send error in plain words, from the gateway codes', () => {
        expect(subagentSendErrorText({ code: 'subagent_limit' }, 2)).toBe(
            '2 subagents are already running – try again when one has finished.',
        );
        expect(subagentSendErrorText({ code: 'subagent_limit' }, 1)).toBe(
            '1 subagent is already running – try again when it has finished.',
        );
        expect(subagentSendErrorText({ code: 'foreground_run' })).toBe(FOREGROUND_NOTE);
        expect(subagentSendErrorText({ code: 'message_pending' })).toBe('Waiting for your last message to arrive');
        expect(subagentSendErrorText({ code: 'chat_in_trash' })).toMatch(/trash/);
        expect(subagentSendErrorText({ status: 429 })).toMatch(/within an hour/);
        expect(subagentSendErrorText({ status: 404 })).toBe('This subagent is no longer available.');
        expect(subagentSendErrorText(new Error('boom'))).toBe('boom');
        expect(subagentSendErrorText({})).toBe('The message could not be sent.');
    });

    it('writes the delivery state under a bubble, the gateway reasons in plain words', () => {
        expect(deliveryText({ status: 'sending' })).toBe('Sending …');
        expect(deliveryText({ status: 'sent' })).toBe('Sent');
        expect(deliveryText({ status: 'delivered' })).toBe('Delivered');
        expect(deliveryText({ status: 'failed', error: 'relay timed out' })).toBe(
            'Not delivered: the subagent did not answer in time',
        );
        expect(deliveryText({ status: 'failed', error: 'run ended before the message arrived' })).toBe(
            'Not delivered: the subagent ended before it read the message',
        );
    });

    it('replaces a message by id when its status changes', () => {
        const l = mergeSubagentMessages([msg(1, 'r1', 1, { status: 'sending' })], [
            msg(1, 'r1', 1, { status: 'delivered' }),
            msg(2, 'r1', 2),
        ]);
        expect(l.map((m) => [m.id, m.status])).toEqual([
            [1, 'delivered'],
            [2, 'delivered'],
        ]);
    });
});

describe('message state of a subagent run (issue #82)', () => {
    it('shows a starting run as starting and frees the field once the summary says ok', () => {
        const starting = subagentInputState({ status: 'running', messageState: 'starting' });
        expect(starting).toEqual({
            mode: 'locked',
            placeholder: 'The subagent is starting – you can write to it in a moment.',
            note: STARTING_NOTE,
            blocked: true,
        });
        // the same run after the summary says ok: no reload needed, the field is open
        expect(subagentInputState({ status: 'running', piRunId: 'p1', messageState: 'ok' }).mode).toBe('open');
        expect(subagentInputState({ status: 'running', piRunId: 'p1', messageState: 'ok' }).blocked).toBe(false);
    });

    it('keeps the foreground lock for a foreground run and the old rule without the field', () => {
        expect(subagentInputState({ status: 'running', messageState: 'foreground' })).toMatchObject({
            mode: 'locked',
            note: FOREGROUND_NOTE,
        });
        expect(subagentInputState({ status: 'running' })).toMatchObject({ mode: 'locked', note: FOREGROUND_NOTE });
    });

    it('names a run_starting error like the placeholder', () => {
        expect(subagentSendErrorText({ code: 'run_starting' })).toBe(STARTING_NOTE);
        expect(subagentSendErrorText({ code: 'foreground_run' })).toBe(FOREGROUND_NOTE);
    });

    it('takes message_state from the run metadata and from the newest run of a thread', () => {
        const first = [meta('r1', { state: 'running', message_state: 'starting', started_at: '2026-10-12T10:00:00Z' })];
        expect(groupRuns([], first)[0].messageState).toBe('starting');
        const merged = mergeRunMeta(first, [meta('r1', { message_state: 'ok' })]);
        expect(groupRuns([], merged)[0].messageState).toBe('ok');
    });
});
