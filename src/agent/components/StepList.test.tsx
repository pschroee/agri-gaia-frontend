// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Rows of running and background commands (issue #197): one background symbol, one stop control, a row height that
// the buttons do not change, and the chip of the task on the rows of bg_output and bg_stop.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { backgroundById, backgroundByCall } from '../background';
import type { Step } from '../transcript';
import type { BackgroundTask } from '../types';
import StepList from './StepList';
import type { StepControls } from './StepList';

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

const controls = (running: string[], bg: BackgroundTask[]): StepControls => ({
    running: new Set(running),
    onStop: async () => undefined,
    onBackground: async () => bg[0],
    background: backgroundByCall(bg),
    backgroundById: backgroundById(bg),
});

describe('StepList controls', () => {
    const running: Step = { id: 'call-9', tool: 'bash', name: 'bash', status: 'running', summary: 'pip install x' };

    it('offers the background symbol and a grey stop on a running command', () => {
        render(<StepList steps={[running]} controls={controls(['call-9'], [])} />);
        const bg = screen.getByTestId('agent-step-background');
        expect(bg.querySelector('[data-testid="LayersOutlinedIcon"]')).not.toBeNull();
        expect(bg.querySelector('[data-testid="MoveDownIcon"]')).toBeNull();
        const stop = screen.getByTestId('agent-step-stop');
        expect(stop.querySelector('[data-testid="StopCircleOutlinedIcon"]')).not.toBeNull();
    });

    it('does not let the buttons grow the row: negative margin on both', () => {
        render(<StepList steps={[running]} controls={controls(['call-9'], [])} />);
        for (const id of ['agent-step-background', 'agent-step-stop']) {
            const style = getComputedStyle(screen.getByTestId(id));
            expect(style.marginTop).toBe('-1px');
            expect(style.padding).toBe('2px');
            // the tooltip wrapper is a flex box: an inline span would grow to 22 px around the button
            expect(getComputedStyle(screen.getByTestId(id).parentElement as HTMLElement).display).toBe('flex');
        }
    });

    it('names the chip by state and gives its border the state colour', () => {
        const done: Step = { id: 'call-1', tool: 'bash', name: 'bash', status: 'done', summary: 'make' };
        const bg = [task(1, { state: 'exited', exit_code: 2 })];
        render(<StepList steps={[done]} controls={controls([], bg)} />);
        const chip = screen.getByTestId('agent-step-bg');
        expect(chip.textContent).toContain('bg-1 · exit 2');
        expect(getComputedStyle(chip).borderColor).toBe('rgb(240, 180, 176)');
    });

    it('shows the chip of the task on bg_output and bg_stop rows', () => {
        const bg = [task(2, { state: 'exited', exit_code: 0 })];
        const out: Step = { id: 'call-20', tool: 'bg_output', name: 'bg_output', status: 'done', args: { id: 'bg-2' } };
        const stop: Step = { id: 'call-21', tool: 'bg_stop', name: 'bg_stop', status: 'done', args: { id: 'bg-2' } };
        const other: Step = { id: 'call-22', tool: 'bash', name: 'bash', status: 'done', args: { id: 'bg-2' } };
        render(<StepList steps={[out, stop, other]} controls={controls([], bg)} />);
        const chips = screen.getAllByTestId('agent-step-bg');
        expect(chips).toHaveLength(2);
        expect(chips[0].textContent).toContain('bg-2 · exit 0');
    });
});
