// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Smoke tests of the plan card (A-E4): the chip and the controls per state, the confirmation before a cancel, the
// stop button of a running job, the embedded approval of a step the plan does not cover and the log as plain text.
// The wording itself is checked in planText.test.ts; here the card only has to put it together.

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { agentApi } from '../api';
import type { WatchJob } from '../jobs';
import type { Plan, PlanStep } from '../plan';
import type { Approval } from '../types';
import PlanCard from './PlanCard';

beforeEach(() => {
    vi.spyOn(agentApi, 'activity').mockResolvedValue({
        calls: [],
        chats: {},
        summary: { total: 0, outcomes: {}, chats: 0, runs: 0 },
    } as never);
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

/** Puts a Notification interface of the given permission into the window for one test. */
function withPermission(permission: 'granted' | 'denied' | 'default') {
    const g = window as unknown as { Notification?: unknown };
    const before = g.Notification;
    const requestPermission = vi.fn(async () => permission);
    g.Notification = Object.assign(vi.fn(), { permission, requestPermission });
    return {
        requestPermission,
        restore: () => {
            g.Notification = before;
        },
    };
}

const step = (over: Partial<PlanStep> = {}): PlanStep => ({
    idx: 1,
    method: 'POST',
    path: '/datasets',
    effect: 'write',
    covered: true,
    state: 'open',
    ...over,
});

const plan = (over: Partial<Plan> = {}): Plan =>
    ({
        id: 'p1',
        chat_id: 'c1',
        via: 'cli',
        state: 'approved',
        mode: 'autonomous',
        created_at: '2026-10-16T12:00:00.000Z',
        decided_at: '2026-10-16T12:00:30.000Z',
        budget: { max_duration_s: 7200, max_llm_cost: 1.5, max_auto_turns: 20 },
        usage: { llm_cost: 0.42, auto_turns: 3, compute_used: 1, compute_max: 3 },
        steps: [
            step({ idx: 1, state: 'done' }),
            step({ idx: 2, state: 'running', started_at: '2026-10-16T12:00:00.000Z' }),
        ],
        ...over,
    } as Plan);

const job = (over: Partial<WatchJob> = {}): WatchJob => ({
    id: 'j1',
    chat_id: 'c1',
    kind: 'training',
    state: 'running',
    ...over,
});

const approval = (over: Partial<Approval> = {}): Approval =>
    ({
        id: 'a1',
        chat_id: 'c1',
        kind: 'platform_write',
        via: 'cli',
        name: 'POST /models',
        size: 1,
        sha256: '',
        content_type: 'application/json',
        state: 'pending',
        created_at: '2026-10-16T12:00:00.000Z',
        ...over,
    } as Approval);

describe('the state chip and the controls per state (L1)', () => {
    it('a running plan can be paused and cancelled, but not resumed', () => {
        render(<PlanCard plan={plan()} onControl={vi.fn()} />);
        expect(screen.getByTestId('agent-plan-state').textContent).toBe('Running');
        expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Resume' })).toBeNull();
        expect(screen.getByRole('button', { name: 'Cancel plan' })).toBeTruthy();
    });

    it('a paused plan can be resumed, a budget pause only cancelled', () => {
        const { unmount } = render(
            <PlanCard plan={plan({ state: 'paused', pause_reason: 'user' })} onControl={vi.fn()} />,
        );
        expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
        unmount();

        render(<PlanCard plan={plan({ state: 'paused', pause_reason: 'budget_turns' })} onControl={vi.fn()} />);
        expect(screen.queryByRole('button', { name: 'Resume' })).toBeNull();
        expect(screen.getByRole('button', { name: 'Cancel plan' })).toBeTruthy();
    });

    it('an ended plan carries no controls at all', () => {
        for (const state of ['completed', 'failed', 'cancelled'] as const) {
            const { unmount } = render(
                <PlanCard plan={plan({ state, ended_at: '2026-10-16T12:41:00.000Z' })} onControl={vi.fn()} />,
            );
            expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
            expect(screen.queryByRole('button', { name: 'Resume' })).toBeNull();
            expect(screen.queryByRole('button', { name: 'Cancel plan' })).toBeNull();
            unmount();
        }
    });

    it('the panel draws the controls as named icon buttons', () => {
        render(<PlanCard plan={plan()} layout="panel" onControl={vi.fn()} />);
        expect(screen.getByRole('button', { name: 'Pause plan' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Cancel plan' })).toBeTruthy();
    });

    it('a step waiting for the user reads as "Needs input"', () => {
        const p = plan({ steps: [step({ idx: 1, parked_approval: 'a1' })] });
        render(<PlanCard plan={p} pending={new Set(['a1'])} onControl={vi.fn()} />);
        expect(screen.getByTestId('agent-plan-state').textContent).toBe('Needs input');
    });
});

describe('the cancel dialog', () => {
    it('asks first and calls cancel only after the confirmation', async () => {
        const onControl = vi.fn(async () => undefined);
        render(<PlanCard plan={plan()} onControl={onControl} />);
        fireEvent.click(screen.getByRole('button', { name: 'Cancel plan' }));

        const dialog = await screen.findByRole('dialog');
        expect(within(dialog).getByText('Cancel plan?')).toBeTruthy();
        expect(onControl).not.toHaveBeenCalled();

        fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel plan' }));
        await screen.findByTestId('agent-plan-card');
        expect(onControl).toHaveBeenCalledWith('cancel', undefined);
    });

    it('"Keep running" leaves the plan alone', async () => {
        const onControl = vi.fn(async () => undefined);
        render(<PlanCard plan={plan()} onControl={onControl} />);
        fireEvent.click(screen.getByRole('button', { name: 'Cancel plan' }));
        const dialog = await screen.findByRole('dialog');
        fireEvent.click(within(dialog).getByRole('button', { name: 'Keep running' }));
        expect(onControl).not.toHaveBeenCalled();
    });
});

describe('the progress of a step (D2.4, D4.6)', () => {
    it('shows the percent, the platform line and the time left', () => {
        render(
            <PlanCard
                plan={plan({
                    steps: [
                        step({
                            idx: 1,
                            state: 'running',
                            started_at: new Date(Date.now() - 60_000).toISOString(),
                            progress: 48,
                            progress_msg: 'Epoch 5/10 · loss 0.142',
                        }),
                    ],
                })}
                onControl={vi.fn()}
            />,
        );
        expect(screen.getByText('48 %')).toBeTruthy();
        // The step's subline and its live block both carry the platform's line (#221).
        expect(screen.getAllByText(/Epoch 5\/10 · loss 0.142/).length).toBeGreaterThan(0);
        expect(screen.getByText(/Runtime 1 min · time left unknown/)).toBeTruthy();
    });

    it('stops the job only while it runs, and only for a step that observes one (D2.9)', () => {
        const p = plan({ steps: [step({ idx: 1, state: 'waiting', watch_job: 'j1' })] });
        const { unmount } = render(
            <PlanCard plan={p} jobs={[job({ id: 'j1', state: 'running' })]} onControl={vi.fn()} />,
        );
        expect(screen.getByTestId('agent-plan-stop-job')).toBeTruthy();
        unmount();

        render(<PlanCard plan={p} jobs={[job({ id: 'j1', state: 'done' })]} onControl={vi.fn()} />);
        expect(screen.queryByTestId('agent-plan-stop-job')).toBeNull();
    });

    it('the stop button reports the step it belongs to', async () => {
        const onControl = vi.fn(async () => undefined);
        render(
            <PlanCard
                plan={plan({ steps: [step({ idx: 3, state: 'waiting', watch_job: 'j1' })] })}
                jobs={[job({ id: 'j1', state: 'running' })]}
                onControl={onControl}
            />,
        );
        fireEvent.click(screen.getByTestId('agent-plan-stop-job'));
        await screen.findByTestId('agent-plan-card');
        expect(onControl).toHaveBeenCalledWith('stop', 3);
    });
});

describe('the log tail', () => {
    it('shows the lines of the job as plain text, never as markup', () => {
        render(
            <PlanCard
                plan={plan({ steps: [step({ idx: 1, state: 'waiting', watch_job: 'j1' })] })}
                jobs={[job({ id: 'j1', state: 'running', log_tail: 'epoch 1\n<b>bold</b>' })]}
                onControl={vi.fn()}
            />,
        );
        const log = screen.getByTestId('agent-plan-log');
        expect(log.textContent).toContain('<b>bold</b>');
        expect(log.querySelector('b')).toBeNull();
    });
});

describe('the embedded approval of a step the plan does not cover (D2.8)', () => {
    const parked = plan({ steps: [step({ idx: 4, covered: false, effect: 'irreversible', parked_approval: 'a1' })] });

    it('is shown and calls back with the step approval', async () => {
        const onDecide = vi.fn(async () => undefined);
        render(
            <PlanCard
                plan={parked}
                approvals={[approval()]}
                pending={new Set(['a1'])}
                onDecide={onDecide}
                onControl={vi.fn()}
            />,
        );
        fireEvent.click(screen.getByTestId('agent-plan-step-approve'));
        await screen.findByTestId('agent-plan-card');
        expect(onDecide).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }), true);
    });

    it('without a pending approval of that step there is no embedded approval', () => {
        render(<PlanCard plan={parked} approvals={[approval({ state: 'approved' })]} onControl={vi.fn()} />);
        expect(screen.queryByTestId('agent-plan-step-approval')).toBeNull();
    });
});

describe('the created objects (L4)', () => {
    it('links every object to its platform page', () => {
        render(
            <PlanCard
                plan={plan({
                    state: 'completed',
                    ended_at: '2026-10-16T12:41:00.000Z',
                    steps: [
                        step({
                            idx: 1,
                            state: 'done',
                            outputs: [
                                { resource: 'dataset', id: '7' },
                                { resource: 'model', id: '12' },
                            ],
                        }),
                    ],
                })}
                onControl={vi.fn()}
            />,
        );
        const links = within(screen.getByTestId('agent-plan-created')).getAllByRole('link');
        expect(links.map((l) => l.getAttribute('href'))).toEqual(['/data?dataset=7', '/models/12']);
    });
});

describe('the rights block of a proposed plan (L13)', () => {
    it('lists one row per right of the raw grant, with its effect chip', () => {
        render(
            <PlanCard
                plan={plan({
                    state: 'proposed',
                    decided_at: undefined,
                    grant: { rules: [{ action: 'write', resource: 'dataset' }] },
                })}
                onControl={vi.fn()}
            />,
        );
        expect(screen.getByText('RIGHTS WHILE IT RUNS')).toBeTruthy();
        expect(screen.getByText('write dataset')).toBeTruthy();
        // the chip carries the effect's label in the theme's case; the uppercasing is its CSS (EffectChip)
        expect(screen.getAllByTestId('agent-effect-chip').map((c) => c.textContent)).toContain('Write');
    });

    it('is left out entirely without a grant', () => {
        render(<PlanCard plan={plan({ state: 'proposed', decided_at: undefined })} onControl={vi.fn()} />);
        expect(screen.queryByText('RIGHTS WHILE IT RUNS')).toBeNull();
    });
});

describe('the card as a group', () => {
    it('is announced with its number of steps and its state (accessibility)', () => {
        render(<PlanCard plan={plan({ state: 'paused', pause_reason: 'login' })} onControl={vi.fn()} />);
        const card = screen.getByTestId('agent-plan-card');
        expect(card.getAttribute('aria-label')).toBe('Plan, 2 steps: Paused');
        expect(card.getAttribute('data-plan-state')).toBe('paused');
    });
});

describe('the browser notification checkbox (D4.4)', () => {
    const proposed = () => plan({ state: 'proposed', decided_at: undefined });

    it('a permission granted earlier shows "On" and counts as opted in', () => {
        const browser = withPermission('granted');
        try {
            const onNotify = vi.fn();
            render(<PlanCard plan={proposed()} onNotify={onNotify} onControl={vi.fn()} />);
            // the checkbox says On from the permission alone, and it stays switchable (one plan may stay quiet)
            expect(screen.getByTestId('agent-plan-notify-state').textContent).toContain('On · completes, fails');
            expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
            expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(false);
            expect(onNotify).not.toHaveBeenCalled();
        } finally {
            browser.restore();
        }
    });

    it('a blocked permission says so instead of pretending "On"', () => {
        const browser = withPermission('denied');
        try {
            render(<PlanCard plan={proposed()} onNotify={vi.fn()} onControl={vi.fn()} />);
            const state = screen.getByTestId('agent-plan-notify-state');
            expect(state.textContent).toContain('Notifications are blocked');
            expect(state.textContent).not.toContain('On ·');
            expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
        } finally {
            browser.restore();
        }
    });

    it("the user's own click is reported, and the browser is asked only while it has not decided", () => {
        const browser = withPermission('default');
        try {
            const onNotify = vi.fn();
            render(<PlanCard plan={proposed()} onNotify={onNotify} onControl={vi.fn()} />);
            fireEvent.click(screen.getByRole('checkbox'));
            expect(onNotify).toHaveBeenCalledWith(true);
            expect(browser.requestPermission).toHaveBeenCalledTimes(1);
        } finally {
            browser.restore();
        }
    });

    it('a plan switched off shows off although the browser allows it, and can be switched on again', () => {
        const browser = withPermission('granted');
        try {
            const onNotify = vi.fn();
            render(<PlanCard plan={proposed()} onNotify={onNotify} notifyOptIn={() => false} onControl={vi.fn()} />);
            // the permission is there, but this plan was switched off: the box shows off and the click reports it
            expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
            fireEvent.click(screen.getByRole('checkbox'));
            expect(onNotify).toHaveBeenCalledWith(true);
        } finally {
            browser.restore();
        }
    });
});

describe('approving a plan (issue #166)', () => {
    const proposed = plan({
        state: 'proposed',
        mode: 'interactive',
        approval_id: 'a1',
        budget: undefined,
        usage: undefined,
        steps: [step({ idx: 1 })],
    });
    const planApproval = approval({ kind: 'plan' });

    it('turns the button into a disabled "Approving…" at the click', async () => {
        let finish: () => void = () => undefined;
        const onDecide = vi.fn(() => new Promise<void>((r) => (finish = r)));
        render(<PlanCard plan={proposed} approval={planApproval} onDecide={onDecide} onControl={vi.fn()} />);
        fireEvent.click(screen.getByText('Approve plan'));
        const button = await screen.findByText('Approving…');
        expect((button.closest('button') as HTMLButtonElement).disabled).toBe(true);
        finish();
    });

    it('returns to "Approve plan" when the approval fails', async () => {
        const onDecide = vi.fn(async () => {
            throw new Error('nope');
        });
        render(<PlanCard plan={proposed} approval={planApproval} onDecide={(a, b) => onDecide().catch(() => undefined)} onControl={vi.fn()} />);
        fireEvent.click(screen.getByText('Approve plan'));
        expect(await screen.findByText('Approve plan')).toBeTruthy();
    });
});

describe('an upload step of many files (gateway issue #172)', () => {
    const uploads = (files: number) => ({
        files,
        bytes: files * 100,
        root: '/workspace/pu',
        folders: [{ path: 'a', files, bytes: files * 100 }],
        extensions: [{ ext: '.png', files }],
        manifest_sha256: 'f'.repeat(64),
    });

    it('shows the folders and the closed list for 500 files, without a row', () => {
        const up = plan({ mode: 'interactive', steps: [step({ idx: 1, uploads: uploads(500) })] } as Partial<Plan>);
        render(<PlanCard plan={up} layout="panel" onControl={vi.fn()} />);
        expect(screen.getByTestId('agent-upload-files')).toBeTruthy();
        expect(screen.getByText('Show all 500 files')).toBeTruthy();
        expect(screen.queryAllByTestId('agent-upload-row')).toHaveLength(0);
    });

    it('draws no list component up to ten files and for a step without uploads', () => {
        const up = plan({
            mode: 'interactive',
            steps: [step({ idx: 1, uploads: uploads(10) }), step({ idx: 2, path: '/datasets/1', method: 'PATCH' })],
        } as Partial<Plan>);
        render(<PlanCard plan={up} layout="panel" onControl={vi.fn()} />);
        expect(screen.queryByTestId('agent-upload-files')).toBeNull();
    });
});

describe('PlanCard step starting (#176)', () => {
    it('shows the first step of an approved plan as Starting while the agent works', () => {
        const p = plan({ steps: [step({ idx: 1 }), step({ idx: 2, path: '/datasets/1', method: 'PATCH' })] });
        render(<PlanCard plan={p} layout="panel" onControl={vi.fn()} working />);
        const rows = screen.getAllByTestId('agent-plan-step-row');
        expect(rows[0].getAttribute('data-status')).toBe('starting');
        expect(within(rows[0]).getByText('Starting…')).toBeTruthy();
        expect(within(rows[0]).queryByText('Open')).toBeNull();
        expect(rows[1].getAttribute('data-status')).toBe('open');
    });
});

describe('plan step references (#177, #221)', () => {
    const refPlan = (first: Partial<PlanStep>) =>
        plan({
            steps: [
                step({ idx: 1, created_resource: 'dataset', created_id: '66', ...first }),
                step({ idx: 2, path: '/datasets/{{step1.id}}/split', state: 'running' }),
            ],
        });
    it('RendersResolvedPathAfterRun', () => {
        render(<PlanCard plan={refPlan({ state: 'done' })} onControl={vi.fn()} />);
        expect(screen.getByTestId('agent-plan-step-resolved').textContent).toContain('/datasets/66/split');
    });
    it('NoResolvedPathBeforeRun', () => {
        render(<PlanCard plan={refPlan({ state: 'open', created_id: undefined })} onControl={vi.fn()} />);
        expect(screen.queryByTestId('agent-plan-step-resolved')).toBeNull();
    });
});

describe('the step list of a running plan (#221)', () => {
    it('marks the step the plan is on and opens only that one', () => {
        render(<PlanCard plan={plan()} onControl={vi.fn()} />);
        const rows = screen.getAllByTestId('agent-plan-step-row');
        expect(rows).toHaveLength(2);
        expect(rows[0].getAttribute('data-current')).toBe('false');
        expect(rows[1].getAttribute('data-current')).toBe('true');
        expect(within(rows[0]).getByTestId('agent-plan-step-head').getAttribute('aria-expanded')).toBe('false');
        expect(within(rows[1]).getByTestId('agent-plan-step-head').getAttribute('aria-expanded')).toBe('true');
    });

    it('keeps the embedded approval and the stop button inside the opened step', () => {
        const p = plan({
            steps: [
                step({ idx: 1, state: 'done' }),
                step({ idx: 2, state: 'waiting', watch_job: 'j1' }),
            ],
        });
        render(<PlanCard plan={p} jobs={[job({ id: 'j1', state: 'running' })]} onControl={vi.fn()} />);
        const rows = screen.getAllByTestId('agent-plan-step-row');
        expect(within(rows[1]).getByTestId('agent-plan-stop-job')).toBeTruthy();
        expect(within(rows[0]).queryByTestId('agent-plan-stop-job')).toBeNull();
    });

    it('leaves a proposed plan with the full view of every step', () => {
        const proposed = plan({ state: 'proposed', mode: 'interactive', steps: [step({ idx: 1 })] });
        render(<PlanCard plan={proposed} onControl={vi.fn()} />);
        expect(screen.getByTestId('agent-plan-step')).toBeTruthy();
        expect(screen.queryByTestId('agent-plan-step-row')).toBeNull();
    });
});

describe('why a step asks again, and where the image comes from (gateway #219)', () => {
    const proposed = (steps: PlanStep[]) => plan({ state: 'proposed', mode: 'interactive', steps });

    it('shows the reason on the step that asks again and a line over the buttons', () => {
        const p = proposed([
            step({ idx: 1, effect: 'compute', covered: true }),
            step({ idx: 2, effect: 'compute', covered: false, uncovered_reason: 'image_origin' }),
        ]);
        render(<PlanCard plan={p} />);
        expect(screen.getByTestId('agent-plan-step-asks-again').textContent).toContain(
            'that this plan does not build',
        );
        expect(screen.getByTestId('agent-plan-uncovered-summary').textContent).toContain(
            'Step 2 asks you again on its own',
        );
    });

    it('shows where the image of a covered start comes from, and no summary line', () => {
        const p = proposed([
            step({ idx: 1, effect: 'compute', covered: true }),
            step({ idx: 2, effect: 'compute', covered: true, confirm_each: true, image_origin: { step: 1 } }),
        ]);
        render(<PlanCard plan={p} />);
        expect(screen.getByTestId('agent-plan-step-image-origin').textContent).toContain(
            'the image is built in step 1',
        );
        expect(screen.queryByTestId('agent-plan-step-asks-again')).toBeNull();
        expect(screen.queryByTestId('agent-plan-uncovered-summary')).toBeNull();
    });

    it('a finished step carries neither line', () => {
        const p = plan({
            steps: [
                step({ idx: 1, state: 'done', covered: false, uncovered_reason: 'runs_code' }),
                step({ idx: 2, state: 'done', image_origin: { step: 1 } }),
            ],
        });
        render(<PlanCard plan={p} />);
        expect(screen.queryByTestId('agent-plan-step-asks-again')).toBeNull();
        expect(screen.queryByTestId('agent-plan-step-image-origin')).toBeNull();
    });
});
