// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The shared step list of the plan dialog, the panel view and the plan card (issue #221): which step is open, the
// activity of a step and the lines of a live training.

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { agentApi } from '../../api';
import type { WatchJob } from '../../jobs';
import type { Plan, PlanStep } from '../../plan';
import PlanStepList from './PlanStepList';

const activity = vi.fn();

beforeEach(() => {
    activity.mockReset();
    activity.mockResolvedValue({ calls: [], chats: {}, summary: { total: 0, outcomes: {}, chats: 0, runs: 0 } });
    vi.spyOn(agentApi, 'activity').mockImplementation(activity);
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

const step = (over: Partial<PlanStep> = {}): PlanStep => ({
    idx: 1,
    method: 'POST',
    path: '/datasets',
    effect: 'write',
    covered: true,
    state: 'open',
    ...over,
});

const plan = (steps: PlanStep[], over: Partial<Plan> = {}): Plan =>
    ({
        id: 'p1',
        chat_id: 'c1',
        via: 'cli',
        state: 'approved',
        mode: 'autonomous',
        created_at: '2026-10-26T15:50:00.000Z',
        decided_at: '2026-10-26T15:51:00.000Z',
        steps,
        ...over,
    }) as Plan;

const none: ReadonlySet<string> = new Set();
const list = (p: Plan, jobs: WatchJob[] = []) => (
    <PlanStepList plan={p} jobs={jobs} pending={none} variant="detail" chatId="c1" />
);
const rowOf = (idx: number) =>
    screen.getAllByTestId('agent-plan-step-row').find((r) => r.getAttribute('data-idx') === String(idx)) as HTMLElement;
const headOf = (idx: number) => within(rowOf(idx)).getByTestId('agent-plan-step-head');
const expanded = (idx: number) => headOf(idx).getAttribute('aria-expanded') === 'true';

describe('which step is open', () => {
    const steps = (running: number) => [
        step({ idx: 1, state: running > 1 ? 'done' : 'running' }),
        step({ idx: 2, state: running > 2 ? 'done' : running === 2 ? 'running' : 'open' }),
        step({ idx: 3, state: running === 3 ? 'running' : 'open' }),
    ];

    it('marks the running step and opens only that one', () => {
        render(list(plan(steps(2))));
        expect(rowOf(2).getAttribute('data-current')).toBe('true');
        expect(rowOf(1).getAttribute('data-current')).toBe('false');
        expect([expanded(1), expanded(2), expanded(3)]).toEqual([false, true, false]);
    });

    it('moves the open step along when the plan moves on', () => {
        const { rerender } = render(list(plan(steps(2))));
        rerender(list(plan(steps(3))));
        expect([expanded(1), expanded(2), expanded(3)]).toEqual([false, false, true]);
        expect(rowOf(3).getAttribute('data-current')).toBe('true');
    });

    it('keeps a step the user opened or closed by hand', () => {
        const { rerender } = render(list(plan(steps(2))));
        fireEvent.click(headOf(1));
        fireEvent.click(headOf(2));
        expect([expanded(1), expanded(2)]).toEqual([true, false]);
        rerender(list(plan(steps(3))));
        expect([expanded(1), expanded(2), expanded(3)]).toEqual([true, false, true]);
    });

    it('opens nothing in a plan that is over', () => {
        render(list(plan([step({ idx: 1, state: 'done' }), step({ idx: 2, state: 'done' })], { state: 'completed' })));
        expect([expanded(1), expanded(2)]).toEqual([false, false]);
    });
});

describe('the activity of a step', () => {
    it('is read when the step opens, with the plan and the step number', async () => {
        render(list(plan([step({ idx: 1, state: 'done' }), step({ idx: 2, state: 'running' })])));
        await waitFor(() => expect(activity).toHaveBeenCalledTimes(1));
        expect(activity).toHaveBeenCalledWith('?plan=p1&step=2&limit=20');
        fireEvent.click(headOf(1));
        await waitFor(() => expect(activity).toHaveBeenCalledTimes(2));
        expect(activity).toHaveBeenLastCalledWith('?plan=p1&step=1&limit=20');
    });

    it('says so when the step has no calls and when the read fails', async () => {
        const { unmount } = render(list(plan([step({ idx: 1, state: 'running' })])));
        expect(await screen.findByText('No platform calls recorded for this step.')).toBeTruthy();
        unmount();
        activity.mockRejectedValue(new Error('500'));
        render(list(plan([step({ idx: 1, state: 'running' })])));
        expect(await screen.findByText('Activity could not be loaded.')).toBeTruthy();
    });

    it('lists the calls and links to the activity of the chat', async () => {
        activity.mockResolvedValue({
            calls: [
                { id: 2, op: 'platform', detail: 'PATCH /models/35', result: 'ok', created_at: '2026-10-26T15:55:00Z', duration_ms: 120, tool_call_id: 't2' },
                { id: 1, op: 'platform', detail: 'POST /models', result: 'error 422', created_at: '2026-10-26T15:54:00Z', tool_call_id: 't1' },
            ],
            chats: {},
            summary: { total: 2, outcomes: {}, chats: 1, runs: 0 },
        });
        render(list(plan([step({ idx: 1, state: 'running' })])));
        const rows = await screen.findAllByTestId('agent-plan-step-activity-row');
        expect(rows).toHaveLength(2);
        expect(rows[0].textContent).toContain('PATCH /models/35');
        expect(rows[1].textContent).toContain('error');
        expect(screen.getByTestId('agent-plan-step-activity-link').getAttribute('href')).toContain('call=t1');
    });
});

describe('a live training', () => {
    it('shows the epoch, the figures and the end of the log', () => {
        const s = step({ idx: 1, state: 'waiting', watch_job: 'j1' });
        const j: WatchJob = {
            id: 'j1',
            chat_id: 'c1',
            kind: 'training',
            state: 'running',
            progress: 30,
            log_tail: 'epoch 3\nloss 0.2',
            last_epoch: { epoch: 3, epochs: 10, values: { val_accuracy: 0.912, loss: 0.231 } },
        };
        render(list(plan([s]), [j]));
        expect(screen.getByTestId('agent-plan-epoch').textContent).toContain('Epoch 3 of 10');
        expect(screen.getByTestId('agent-plan-epoch').textContent).toContain('val_accuracy 0.912');
        expect(screen.getByTestId('agent-plan-log').textContent).toContain('loss 0.2');
        expect(screen.getByTestId('agent-plan-step-subline').textContent).toBe('Epoch 3 of 10 · val_accuracy 0.912 · loss 0.231');
    });

    it('says a build has no log', () => {
        const s = step({ idx: 1, state: 'waiting', watch_job: 'j1' });
        render(list(plan([s]), [{ id: 'j1', chat_id: 'c1', kind: 'image', state: 'running', progress: 40 }]));
        expect(screen.getByTestId('agent-plan-no-log').textContent).toBe('The platform reports no build log.');
    });
});

describe('the opened step', () => {
    it('shows the request with its placeholder resolved, the arguments and the JSON on demand', () => {
        const done = step({ idx: 1, state: 'done', created_resource: 'model', created_id: '35' });
        const s = step({
            idx: 2,
            state: 'running',
            method: 'PATCH',
            path: '/models/{{step1.id}}',
            body: { name: 'm', token: 'abc' },
        });
        render(list(plan([done, s])));
        expect(screen.getByTestId('agent-plan-step-resolved').textContent).toBe('→ PATCH /models/35');
        const args = screen.getByTestId('agent-plan-step-args');
        expect(args.textContent).toContain('[redacted]');
        expect(args.textContent).not.toContain('abc');
        expect(screen.queryByTestId('agent-plan-step-json')).toBeNull();
        fireEvent.click(screen.getByTestId('agent-plan-step-json-toggle'));
        expect(screen.getByTestId('agent-plan-step-json')).toBeTruthy();
    });

    it('shows a failed step with its error', () => {
        const s = step({ idx: 1, state: 'failed', result: 'error 422: name taken' });
        render(list(plan([s], { state: 'failed' })));
        expect(rowOf(1).getAttribute('data-status')).toBe('failed');
        expect(within(rowOf(1)).getByTestId('agent-plan-step-error-text').textContent).toContain('name taken');
    });
});

describe('a finished step with the call as it was sent (issue #225)', () => {
    it('shows the sent summary as the title, the approved text on demand and no "Created resource"', () => {
        const s = step({
            idx: 1,
            state: 'done',
            tool: 'start_training',
            summary: 'Start training of the container created by step 0\nOld detail',
            summary_run: 'Start training "flowers-mini" (id 7)',
            created_resource: 'task',
            created_id: '145',
        });
        render(list(plan([s], { state: 'completed' })));
        fireEvent.click(headOf(1));
        expect(headOf(1).textContent).toContain('Start training "flowers-mini" (id 7)');
        expect(headOf(1).textContent).not.toContain('created by step 0');
        const approved = within(rowOf(1)).getByTestId('agent-plan-step-approved');
        expect(approved.textContent).toContain('As approved');
        expect(approved.textContent).toContain('Start training of the container created by step 0');
        const result = within(rowOf(1)).getByTestId('agent-plan-step-result');
        expect(result.textContent).toContain('Training run finished · task 145');
        expect(result.textContent).not.toContain('Created resource');
    });

    it('shows no approved text when the call went out unchanged', () => {
        const s = step({ idx: 1, state: 'done', summary: 'Create dataset "a"' });
        render(list(plan([s], { state: 'completed' })));
        fireEvent.click(headOf(1));
        expect(within(rowOf(1)).queryByTestId('agent-plan-step-approved')).toBeNull();
    });
});
