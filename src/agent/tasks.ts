// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The agent's task list, rebuilt from the calls of its `todo` tool (pi extension rpiv-todo): every result carries the
// complete list after the call in `details.tasks`, the last one wins. Without details (old messages) the arguments of
// successful calls are replayed. Pure functions, after the gateway web UI's lib/tasks.ts (issue #88).

import type { PiMessage, StoredMessage } from './types';

export const TODO_TOOL = 'todo';

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'deleted';
export type Task = {
    id: number;
    subject: string;
    status: TaskStatus;
    description?: string;
    /** Label while the task is in progress ("Building training container"). */
    activeForm?: string;
    blockedBy?: number[];
    owner?: string;
};
export type TaskState = { tasks: Task[]; nextId: number };
export type TaskCounts = { total: number; completed: number; inProgress: number; pending: number };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v : undefined);
const STATUSES: TaskStatus[] = ['pending', 'in_progress', 'completed', 'deleted'];
const isStatus = (v: unknown): v is TaskStatus => STATUSES.includes(v as TaskStatus);
const nums = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : undefined);

function toTask(v: unknown): Task | undefined {
    if (!isObj(v) || typeof v.id !== 'number' || !str(v.subject) || !isStatus(v.status)) return undefined;
    const t: Task = { id: v.id, subject: v.subject as string, status: v.status };
    if (str(v.description)) t.description = v.description as string;
    if (str(v.activeForm)) t.activeForm = v.activeForm as string;
    const blocked = nums(v.blockedBy);
    if (blocked?.length) t.blockedBy = blocked;
    if (str(v.owner)) t.owner = v.owner as string;
    return t;
}

/** List from the `details` of a todo result; undefined if the shape does not match. */
export function tasksFromDetails(details: unknown): TaskState | undefined {
    if (!isObj(details) || !Array.isArray(details.tasks) || typeof details.nextId !== 'number') return undefined;
    return { tasks: details.tasks.map(toTask).filter((t): t is Task => t !== undefined), nextId: details.nextId };
}

function parseArgs(args: unknown): Obj | undefined {
    if (isObj(args)) return args;
    if (typeof args !== 'string') return undefined;
    try {
        const v: unknown = JSON.parse(args);
        return isObj(v) ? v : undefined;
    } catch {
        return undefined;
    }
}

/** Applies a todo call to the list (fallback without details); invalid calls leave it unchanged. */
export function applyTodoArgs(state: TaskState, rawArgs: unknown): TaskState {
    const a = parseArgs(rawArgs);
    if (!a) return state;
    const patch = (id: unknown, fn: (t: Task) => Task): TaskState => {
        if (typeof id !== 'number' || !state.tasks.some((t) => t.id === id)) return state;
        return { ...state, tasks: state.tasks.map((t) => (t.id === id ? fn(t) : t)) };
    };
    switch (a.action) {
        case 'create': {
            const t = toTask({ ...a, id: state.nextId, status: 'pending' });
            return t ? { tasks: [...state.tasks, t], nextId: state.nextId + 1 } : state;
        }
        case 'update':
            return patch(a.id, (t) => {
                const next = { ...t };
                if (str(a.subject)) next.subject = a.subject as string;
                if (str(a.description)) next.description = a.description as string;
                if (str(a.activeForm)) next.activeForm = a.activeForm as string;
                if (str(a.owner)) next.owner = a.owner as string;
                if (isStatus(a.status)) next.status = a.status;
                return next;
            });
        case 'delete':
            return patch(a.id, (t) => ({ ...t, status: 'deleted' }));
        case 'clear':
            return { tasks: [], nextId: 1 };
        default:
            return state;
    }
}

const textOfResult = (m: PiMessage) =>
    typeof m.content === 'string'
        ? m.content
        : (m.content ?? []).map((b) => (b.type === 'text' ? b.text : '')).join('');

/**
 * Walks the stored messages in order and returns the current list. A finished call (its tool result is stored) with
 * details sets the list; without details the arguments of a successful call are replayed. Calls without a result yet
 * (still running) and failed calls change nothing.
 */
export function todoTimeline(messages: StoredMessage[]): Task[] {
    const results = new Map<string, PiMessage>();
    for (const m of messages)
        if (m.message.role === 'toolResult' && m.message.toolCallId) results.set(m.message.toolCallId, m.message);
    let state: TaskState = { tasks: [], nextId: 1 };
    const seen = new Set<string>();
    for (const m of messages) {
        if (m.message.role !== 'assistant' || !Array.isArray(m.message.content)) continue;
        for (const b of m.message.content) {
            if (b.type !== 'toolCall' || b.name !== TODO_TOOL || !b.id || seen.has(b.id)) continue;
            seen.add(b.id);
            const res = results.get(b.id);
            if (!res) continue;
            const detailErr = isObj(res.details) ? str(res.details.error) : undefined;
            const failed = !!res.isError || !!detailErr || /^Error:/.test(textOfResult(res));
            if (failed) continue;
            state = tasksFromDetails(res.details) ?? applyTodoArgs(state, b.arguments);
        }
    }
    return state.tasks;
}

/** Tasks the user sees: without removed ones. */
export const visibleTasks = (tasks: Task[]) => tasks.filter((t) => t.status !== 'deleted');

export function taskCounts(tasks: Task[]): TaskCounts {
    const v = visibleTasks(tasks);
    return {
        total: v.length,
        completed: v.filter((t) => t.status === 'completed').length,
        inProgress: v.filter((t) => t.status === 'in_progress').length,
        pending: v.filter((t) => t.status === 'pending').length,
    };
}

const RANK: Record<string, number> = { in_progress: 0, pending: 1, completed: 2 };

/** Visible tasks in display order: in progress, pending, completed (each by id). */
export function sortedTasks(tasks: Task[]): Task[] {
    return [...visibleTasks(tasks)].sort((a, b) => RANK[a.status] - RANK[b.status] || a.id - b.id);
}

/** Open dependencies of a task: blockers that exist, are visible and not completed. */
export function openBlockers(task: Task, tasks: Task[]): number[] {
    if (task.status === 'completed') return [];
    const byId = new Map(visibleTasks(tasks).map((t) => [t.id, t]));
    return (task.blockedBy ?? []).filter((id) => {
        const b = byId.get(id);
        return b && b.status !== 'completed';
    });
}

/** Button label: "3/7 tasks", compact "3/7". */
export const taskButtonLabel = (c: TaskCounts, compact: boolean) =>
    compact ? `${c.completed}/${c.total}` : `${c.completed}/${c.total} tasks`;

export const taskAriaLabel = (c: TaskCounts) => `Show tasks (${c.completed} of ${c.total} done)`;

/** The list opens as popover on a viewport at least this wide (px), else as bottom sheet (mobile). */
export const POPOVER_MIN_WIDTH = 600;
export const POPOVER_MEDIA_QUERY = `(min-width:${POPOVER_MIN_WIDTH}px)`;
export const listAsPopover = (viewportWidth: number) => viewportWidth >= POPOVER_MIN_WIDTH;
/** Gap between the panel edge and the task popover in the context panel (px, each side). */
export const PANEL_POPOVER_MARGIN = 8;
/** Position and width of the task popover in the panel: the width of the panel header minus the margin, right below it. */
export const panelPopoverGeometry = (header: { left: number; bottom: number; width: number }) => ({
    top: header.bottom,
    left: header.left + PANEL_POPOVER_MARGIN,
    width: Math.max(0, header.width - 2 * PANEL_POPOVER_MARGIN),
});
/** The button label is compact ("3/7") where the chat area (header) is narrower than this, e.g. in the panel. */
export const compactButtonLabel = (hostWidth: number) => hostWidth < POPOVER_MIN_WIDTH;
