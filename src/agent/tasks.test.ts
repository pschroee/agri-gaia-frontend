// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import {
    applyTodoArgs,
    compactButtonLabel,
    listAsPopover,
    POPOVER_MEDIA_QUERY,
    openBlockers,
    sortedTasks,
    taskAriaLabel,
    taskButtonLabel,
    taskCounts,
    tasksFromDetails,
    todoTimeline,
} from './tasks';
import type { Task } from './tasks';
import type { StoredMessage } from './types';

let seq = 0;
const call = (id: string, args: unknown, name = 'todo'): StoredMessage => ({
    seq: ++seq,
    role: 'assistant',
    created_at: '2026-10-12T10:00:00Z',
    message: { role: 'assistant', content: [{ type: 'toolCall', id, name, arguments: args }] },
});
const result = (id: string, details?: unknown, extra: Record<string, unknown> = {}): StoredMessage => ({
    seq: ++seq,
    role: 'toolResult',
    created_at: '2026-10-12T10:00:01Z',
    message: {
        role: 'toolResult',
        toolCallId: id,
        toolName: 'todo',
        content: [{ type: 'text', text: 'ok' }],
        details,
        ...extra,
    },
});
const t = (id: number, status: Task['status'], extra: Partial<Task> = {}): Task => ({
    id,
    subject: `Task ${id}`,
    status,
    ...extra,
});

describe('tasksFromDetails', () => {
    it('reads tasks and drops malformed entries', () => {
        const s = tasksFromDetails({
            nextId: 3,
            tasks: [t(1, 'pending'), { id: 2 }, { id: 3, subject: 'x', status: 'bogus' }],
        });
        expect(s?.tasks.map((x) => x.id)).toEqual([1]);
        expect(s?.nextId).toBe(3);
    });
    it('is undefined for another shape', () => {
        expect(tasksFromDetails({ tasks: [] })).toBeUndefined();
        expect(tasksFromDetails('x')).toBeUndefined();
    });
});

describe('applyTodoArgs', () => {
    const base = { tasks: [t(1, 'pending')], nextId: 2 };
    it('creates, updates, deletes and clears', () => {
        const c = applyTodoArgs(base, { action: 'create', subject: 'New' });
        expect(c.tasks).toHaveLength(2);
        expect(c.nextId).toBe(3);
        expect(
            applyTodoArgs(c, { action: 'update', id: 2, status: 'in_progress', activeForm: 'Doing' }).tasks[1],
        ).toMatchObject({ status: 'in_progress', activeForm: 'Doing' });
        expect(applyTodoArgs(base, { action: 'delete', id: 1 }).tasks[0].status).toBe('deleted');
        expect(applyTodoArgs(base, { action: 'clear' })).toEqual({ tasks: [], nextId: 1 });
    });
    it('parses JSON text and leaves invalid calls alone', () => {
        expect(applyTodoArgs(base, '{"action":"create","subject":"A"}').tasks).toHaveLength(2);
        expect(applyTodoArgs(base, 'not json')).toBe(base);
        expect(applyTodoArgs(base, { action: 'update', id: 99, status: 'completed' })).toBe(base);
        expect(applyTodoArgs(base, { action: 'create' })).toBe(base);
    });
});

describe('todoTimeline', () => {
    it('takes the last result with details', () => {
        const m = [
            call('a', { action: 'create', subject: 'One' }),
            result('a', { nextId: 2, tasks: [t(1, 'pending')] }),
            call('b', { action: 'update', id: 1, status: 'in_progress' }),
            result('b', { nextId: 2, tasks: [t(1, 'in_progress', { activeForm: 'Working' })] }),
        ];
        expect(todoTimeline(m)).toEqual([t(1, 'in_progress', { activeForm: 'Working' })]);
    });
    it('replays the arguments without details', () => {
        const m = [
            call('a', { action: 'create', subject: 'One' }),
            result('a'),
            call('b', { action: 'create', subject: 'Two' }),
            result('b'),
            call('c', { action: 'update', id: 1, status: 'completed' }),
            result('c'),
        ];
        expect(todoTimeline(m).map((x) => [x.id, x.status])).toEqual([
            [1, 'completed'],
            [2, 'pending'],
        ]);
    });
    it('ignores calls without a result yet and failed calls', () => {
        const m = [
            call('a', { action: 'create', subject: 'One' }),
            result('a'),
            call('b', { action: 'create', subject: 'Two' }),
            call('c', { action: 'create', subject: 'Three' }),
            result('c', undefined, { isError: true }),
            call('d', { action: 'create', subject: 'Four' }),
            result('d', { error: 'bad' }),
            call('e', { action: 'create', subject: 'Five' }),
            result('e', undefined, { content: 'Error: nope' }),
        ];
        expect(todoTimeline(m).map((x) => x.subject)).toEqual(['One']);
    });
    it('ignores other tools and handles clear', () => {
        const m = [
            call('x', { command: 'ls' }, 'bash'),
            result('x'),
            call('a', { action: 'create', subject: 'One' }),
            result('a'),
            call('b', { action: 'clear' }),
            result('b'),
        ];
        expect(todoTimeline(m)).toEqual([]);
    });
    it('counts a call once even if its message repeats', () => {
        const a = call('a', { action: 'create', subject: 'One' });
        expect(todoTimeline([a, a, result('a')])).toHaveLength(1);
    });
});

describe('counts and order', () => {
    const tasks = [t(1, 'completed'), t(2, 'pending'), t(3, 'in_progress'), t(4, 'deleted'), t(5, 'completed')];
    it('counts visible tasks only', () => {
        expect(taskCounts(tasks)).toEqual({ total: 4, completed: 2, inProgress: 1, pending: 1 });
        expect(taskCounts([])).toEqual({ total: 0, completed: 0, inProgress: 0, pending: 0 });
    });
    it('orders in progress, pending, completed', () => {
        expect(sortedTasks(tasks).map((x) => x.id)).toEqual([3, 2, 1, 5]);
    });
    it('names only open blockers', () => {
        const all = [t(1, 'completed'), t(2, 'pending'), t(3, 'pending', { blockedBy: [1, 2, 9, 4] }), t(4, 'deleted')];
        expect(openBlockers(all[2], all)).toEqual([2]);
        expect(openBlockers(t(5, 'completed', { blockedBy: [2] }), all)).toEqual([]);
    });
    it('labels the button', () => {
        const c = taskCounts(tasks);
        expect(taskButtonLabel(c, false)).toBe('2/4 tasks');
        expect(taskButtonLabel(c, true)).toBe('2/4');
        expect(taskAriaLabel(c)).toBe('Show tasks (2 of 4 done)');
    });
    it('uses the popover on desktop viewports and the sheet below 600 px', () => {
        expect(listAsPopover(1600)).toBe(true);
        expect(listAsPopover(600)).toBe(true);
        expect(listAsPopover(599)).toBe(false);
        expect(listAsPopover(390)).toBe(false);
        expect(POPOVER_MEDIA_QUERY).toBe('(min-width:600px)');
    });
    it('keeps the compact label for narrow chat areas independent of the list container', () => {
        expect(compactButtonLabel(400)).toBe(true);
        expect(compactButtonLabel(600)).toBe(false);
    });
});
