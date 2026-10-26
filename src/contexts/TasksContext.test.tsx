// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The task widget takes in tasks the agent started (issue #173): the gateway names the task in platform_changed,
// the context fetches it and the existing poll follows it.

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { reportPlatformChanged } from '../agent/platformChanges';
import useApplicationTasks, { TasksProvider } from './TasksContext';

const httpGet = vi.fn();

vi.mock('../api', () => ({ httpGet: (...a: unknown[]) => httpGet(...a), httpDelete: vi.fn() }));
const kc = vi.hoisted(() => ({ authenticated: true, loadUserProfile: () => Promise.resolve({ username: 'u' }) }));
vi.mock('./KeycloakContext', () => ({ default: () => kc }));

const task = (id: number, over: Record<string, unknown> = {}) => ({
    id,
    initiator: 'u',
    title: `Task ${id}`,
    creation_date: '2026-10-20T10:00:00',
    status: 'inprogress',
    completion_percentage: 0.1,
    ...over,
});

const started = (id: string) =>
    reportPlatformChanged({ chat_id: 'c', source: 'call', changes: [{ resource: 'task', action: 'create', id }] });

function List() {
    const tasks = useApplicationTasks();
    return (
        <ul data-loaded={String(!!tasks?.loaded)}>
            {tasks?.tasksList.map((t) => (
                <li key={t.id} data-testid={`t${t.id}`}>
                    {t.id}:{t.status}:{t.startedByAgent ? 'agent' : 'user'}
                </li>
            ))}
        </ul>
    );
}

const setup = async (initial: unknown[] = []) => {
    httpGet.mockImplementation((_k: unknown, url: string) => {
        if (url.startsWith('/tasks?initiator=')) return Promise.resolve(initial);
        return Promise.reject(new Error(`unexpected ${url}`));
    });
    render(
        <TasksProvider>
            <List />
        </TasksProvider>,
    );
    await waitFor(() => expect(httpGet).toHaveBeenCalled());
    await act(async () => undefined);
};

beforeEach(() => {
    httpGet.mockReset();
    localStorage.clear();
});
afterEach(cleanup);

describe('TasksContext loaded (#228)', () => {
    it('is false before the server list has arrived and true after', async () => {
        let release: (v: unknown) => void = () => undefined;
        httpGet.mockImplementation(() => new Promise((r) => (release = r)));
        const { container } = render(
            <TasksProvider>
                <List />
            </TasksProvider>,
        );
        await waitFor(() => expect(httpGet).toHaveBeenCalled());
        expect(container.querySelector('ul')?.getAttribute('data-loaded')).toBe('false');
        await act(async () => release([task(1, { status: 'failed' })]));
        await waitFor(() => expect(container.querySelector('ul')?.getAttribute('data-loaded')).toBe('true'));
    });
});

describe('TasksContext and platform_changed', () => {
    it('fetches a started task and marks it', async () => {
        await setup();
        httpGet.mockResolvedValue(task(42));
        act(() => started('42'));
        expect((await screen.findByTestId('t42')).textContent).toBe('42:inprogress:agent');
        expect(httpGet.mock.calls.some((c) => String(c[1]).endsWith('/42'))).toBe(true);
        expect(JSON.parse(localStorage.getItem('agentTaskIds') ?? '[]')).toContain(42);
    });

    it('does not add the same task twice', async () => {
        await setup();
        httpGet.mockResolvedValue(task(42));
        act(() => started('42'));
        await screen.findByTestId('t42');
        act(() => started('42'));
        await act(async () => undefined);
        expect(screen.getAllByTestId('t42')).toHaveLength(1);
    });

    it('keeps the mark when the poll answers', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        try {
            await setup();
            httpGet.mockImplementation((_k: unknown, url: string) =>
                Promise.resolve(url.includes('?id=') ? [task(42, { status: 'completed' })] : task(42)),
            );
            act(() => started('42'));
            await screen.findByTestId('t42');
            await act(async () => {
                vi.advanceTimersByTime(3500);
            });
            await waitFor(() => expect(screen.getByTestId('t42').textContent).toBe('42:completed:agent'));
        } finally {
            vi.useRealTimers();
        }
    });

    it('keeps a task added while a poll request is running', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        try {
            await setup([task(1)]);
            let release: (v: unknown) => void = () => undefined;
            httpGet.mockImplementation((_k: unknown, url: string) => {
                if (url.includes('?id=')) return new Promise((r) => (release = r));
                return Promise.resolve(task(2));
            });
            await act(async () => {
                vi.advanceTimersByTime(3500);
            });
            act(() => started('2'));
            await screen.findByTestId('t2');
            await act(async () => release([task(1, { status: 'completed' })]));
            await waitFor(() => expect(screen.getByTestId('t1').textContent).toBe('1:completed:user'));
            expect(screen.getByTestId('t2')).toBeTruthy();
        } finally {
            vi.useRealTimers();
        }
    });

    it('sorts the start list oldest first and marks remembered tasks', async () => {
        localStorage.setItem('agentTaskIds', JSON.stringify([5]));
        await setup([
            task(9, { status: 'completed' }),
            task(5, { status: 'completed' }),
            task(7, { status: 'completed' }),
        ]);
        const ids = screen.getAllByRole('listitem').map((li) => li.textContent);
        expect(ids).toEqual(['5:completed:agent', '7:completed:user', '9:completed:user']);
    });

    it('survives a storage that throws', async () => {
        const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('blocked');
        });
        const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('blocked');
        });
        try {
            await setup();
            httpGet.mockResolvedValue(task(3));
            act(() => started('3'));
            expect((await screen.findByTestId('t3')).textContent).toBe('3:inprogress:agent');
        } finally {
            get.mockRestore();
            set.mockRestore();
        }
    });
});
