// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The "Background" strip (issue #197): its name, one state symbol per row and one stop control.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BackgroundTask } from '../types';
import TaskStrip from './TaskStrip';

afterEach(cleanup);

const task = (seq: number, extra: Partial<BackgroundTask> = {}): BackgroundTask => ({
    id: `bg-${seq}`,
    seq,
    chat_id: 'c1',
    session: 'main',
    tool_call_id: `call-${seq}`,
    command: 'sleep 8',
    log_path: `/tmp/agw-bg/bg-${seq}.log`,
    state: 'running',
    started_at: '2026-10-06T10:00:00Z',
    output_bytes: 0,
    output_lines: 0,
    ...extra,
});

function strip(background: BackgroundTask[], onStop = vi.fn(async () => undefined)) {
    render(
        <TaskStrip
            chatId="c1"
            chatRunning={false}
            background={background}
            onStopBackground={onStop}
            subagentEntries={[]}
            subagentRuns={[]}
            llmCalls={[]}
        />,
    );
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    return onStop;
}

describe('TaskStrip', () => {
    it('is called Background, never Tasks', () => {
        strip([task(1)]);
        const root = screen.getByTestId('agent-tasks');
        expect(root.textContent).toContain('Background');
        expect(root.textContent).toContain('1 command running');
        expect(root.textContent).not.toMatch(/\bTasks\b/);
        expect(root.textContent).toContain('Commands (1)');
    });

    it('gives every row a state symbol', () => {
        strip([
            task(1),
            task(2, { state: 'exited', exit_code: 0 }),
            task(3, { state: 'exited', exit_code: 2 }),
            task(4, { state: 'stopped', stopped_by: 'user' }),
        ]);
        const rows = screen.getAllByTestId('agent-bg-task');
        expect(rows).toHaveLength(4);
        for (const r of rows) expect(r.querySelectorAll('[data-testid="agent-bg-state-icon"]')).toHaveLength(1);
        expect(rows.map((r) => r.querySelector('[data-testid="agent-bg-state-icon"]')?.getAttribute('data-tone')).sort()).toEqual(
            ['error', 'muted', 'ok', 'running'],
        );
    });

    it('stops with an icon button named after the task', () => {
        const onStop = strip([task(1), task(2, { state: 'exited', exit_code: 0 })]);
        const btn = screen.getByLabelText('Stop bg-1');
        expect(btn.tagName).toBe('BUTTON');
        expect(screen.queryByLabelText('Stop bg-2')).toBeNull();
        fireEvent.click(btn);
        expect(onStop).toHaveBeenCalledWith('bg-1');
    });
});
