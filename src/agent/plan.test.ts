// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    activePlan,
    agentNote,
    agentTitle,
    awaitingPlatform,
    budgetLine,
    createdStay,
    createdSubject,
    currentStep,
    currentStepIndex,
    doneSteps,
    durationText,
    fetchActivePlans,
    fetchPlans,
    grantRows,
    isAutonomous,
    leftText,
    needsInput,
    outputKind,
    outputLink,
    pendingIdsOf,
    pendingStepOf,
    planOutputs,
    runningPlans,
    shortDuration,
    placePlans,
    plansByPart,
    planLabel,
    Plan,
    PlacedPlan,
    PlanStep,
    stepCount,
    stepMain,
    stepMessage,
    stepPhase,
    stepStatus,
    stepTechnical,
    stepTimeLine,
    summaryChanged,
    summaryParts,
} from './plan';
import type { AgentPart, Step, TranscriptItem } from './transcript';
import type { Approval } from './types';

const step = (over: Partial<PlanStep> = {}): PlanStep => ({
    idx: 1,
    method: 'GET',
    path: '/train/containers/7/model',
    effect: 'write',
    covered: true,
    state: 'open',
    ...over,
});

const plan = (over: Partial<Plan> = {}): Plan => ({
    id: 'p1',
    chat_id: 'c1',
    title: 'Build image',
    via: 'cli',
    state: 'proposed',
    created_at: '2026-10-12T10:00:00Z',
    steps: [step()],
    ...over,
});

const agent = (key: string, stepIds: string[]): TranscriptItem => ({
    kind: 'agent',
    key,
    parts: [
        {
            type: 'steps',
            steps: stepIds.map((id): Step => ({ id, tool: 'bash', status: 'done' })),
        },
    ],
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('stepStatus', () => {
    it('maps state and covered', () => {
        expect(stepStatus(step({ state: 'done' }))).toBe('done');
        expect(stepStatus(step({ state: 'running' }))).toBe('running');
        expect(stepStatus(step({ state: 'failed' }))).toBe('failed');
        expect(stepStatus(step({ state: 'open', covered: true }))).toBe('open');
        expect(stepStatus(step({ state: 'open', covered: false, effect: 'irreversible' }))).toBe('approval');
    });
});

describe('planLabel', () => {
    const now = Date.parse('2026-10-12T10:00:00Z');

    it('shows expiry and states', () => {
        const until = new Date(now + 30 * 60 * 1000).toISOString();
        expect(planLabel(plan({ state: 'proposed' }), now)).toBe('Waiting for your approval');
        expect(planLabel(plan({ state: 'approved', expires_at: until }), now)).toMatch(
            /^Approved · valid until \d{2}:\d{2}$/,
        );
        expect(planLabel(plan({ state: 'approved', expires_at: until }), now + 31 * 60 * 1000)).toBe('Expired');
        expect(planLabel(plan({ state: 'completed' }), now)).toBe('Completed');
        expect(planLabel(plan({ state: 'rejected' }), now)).toBe('Not approved');
        expect(planLabel(plan({ state: 'expired' }), now)).toBe('Expired');
        expect(planLabel(plan({ state: 'failed' }), now)).toBe('Stopped: a step failed');
        expect(planLabel(plan({ state: 'superseded' }), now)).toBe('Replaced by a newer plan');
    });
});

describe('placePlans', () => {
    it('puts a plan under the answer with its tool call', () => {
        const items = [agent('a1', ['t0']), agent('a2', ['t1'])];
        const p = plan({ tool_call_id: 't1', session: 'main' });
        const { byItem, rest } = placePlans(items, [p], true);
        expect(byItem.get('a2')).toEqual([{ ...p, afterCallId: 't1' }]);
        expect(byItem.has('a1')).toBe(false);
        expect(rest).toEqual([]);
    });

    it('keeps subagent plans out of the main chat', () => {
        const items = [agent('a1', ['t1'])];
        const sub = plan({ id: 'sub', tool_call_id: 't1', session: 'sub-run-2' });
        const main = plan({ id: 'main', tool_call_id: 't1', session: 'main' });
        const shown = placePlans(items, [sub, main], true);
        expect(shown.byItem.get('a1')).toEqual([{ ...main, afterCallId: 't1' }]);
        expect(shown.rest).toEqual([]);
        const inSubagent = placePlans(items, [sub, main], false);
        expect(inSubagent.byItem.get('a1')).toEqual([
            { ...sub, afterCallId: 't1' },
            { ...main, afterCallId: 't1' },
        ]);
    });

    it("carries the step it was proposed at as the plan's place in the answer (issue #138)", () => {
        const items = [agent('a1', ['t1', 't2'])];
        const p = plan({ tool_call_id: 't2' });
        expect(placePlans(items, [p], true).byItem.get('a1')).toEqual([{ ...p, afterCallId: 't2' }]);
    });

    it('uses the call ID for a subagent step, whose step ID is its log entry', () => {
        const items: TranscriptItem[] = [
            {
                kind: 'agent',
                key: 'a1',
                parts: [{ type: 'steps', steps: [{ id: 'log-7', callId: 't1', tool: 'bash', status: 'done' }] }],
            },
        ];
        const p = plan({ tool_call_id: 't1' });
        expect(placePlans(items, [p], false).byItem.get('a1')).toEqual([{ ...p, afterCallId: 't1' }]);
    });

    it('leaves a plan without a tool call in rest (gateway F28), without a place', () => {
        const items = [agent('a1', ['t1'])];
        const p = plan({ tool_call_id: undefined });
        const { byItem, rest } = placePlans(items, [p], true);
        expect([...byItem.keys()]).toEqual([]);
        expect(rest).toEqual([p]);
    });

    it('keeps several plans of one answer in the order they came in', () => {
        const items = [agent('a1', ['t1', 't2'])];
        const first = plan({ id: 'p1', tool_call_id: 't1' });
        const second = plan({ id: 'p2', tool_call_id: 't2' });
        expect(placePlans(items, [first, second], true).byItem.get('a1')).toEqual([
            { ...first, afterCallId: 't1' },
            { ...second, afterCallId: 't2' },
        ]);
    });
});

describe('plansByPart (issue #138)', () => {
    // an answer as the transcript builds it: text, the first step, more text, the proposing step, the closing text
    const parts: AgentPart[] = [
        { type: 'text', text: 'Both renames are prepared.' },
        { type: 'steps', steps: [{ id: 't1', tool: 'bash', status: 'done' }] },
        { type: 'text', text: 'Step 1 only changes the display name.' },
        { type: 'steps', steps: [{ id: 't2', tool: 'propose_plan', status: 'done' }] },
        { type: 'text', text: 'Tell me if you want me to execute them.' },
    ];

    it('puts the card after the part with its step, the later text stays below', () => {
        const p: PlacedPlan = { ...plan(), afterCallId: 't2' };
        const { byPart, rest } = plansByPart(parts, [p]);
        expect(byPart.get(3)).toEqual([p]);
        expect(byPart.has(4)).toBe(false);
        expect(rest).toEqual([]);
    });

    it('gives each plan of the answer its own part', () => {
        const at1: PlacedPlan = { ...plan({ id: 'p1' }), afterCallId: 't1' };
        const at2: PlacedPlan = { ...plan({ id: 'p2' }), afterCallId: 't2' };
        const { byPart, rest } = plansByPart(parts, [at1, at2]);
        expect(byPart.get(1)).toEqual([at1]);
        expect(byPart.get(3)).toEqual([at2]);
        expect(rest).toEqual([]);
    });

    it('keeps a plan whose step is not among the parts for the end of the answer', () => {
        const p: PlacedPlan = { ...plan(), afterCallId: 'gone' };
        expect(plansByPart(parts, [p])).toEqual({ byPart: new Map(), rest: [p] });
    });

    it('keeps a plan without a place (F28) for the end of the answer', () => {
        const p: PlacedPlan = { ...plan() };
        expect(plansByPart(parts, [p]).rest).toEqual([p]);
    });
});

describe('fetchPlans', () => {
    it('returns [] on 404', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response(null, { status: 404, statusText: 'Not Found' })),
        );
        await expect(fetchPlans('c1')).resolves.toEqual([]);
    });
});

describe('gateway summaries (gateway issue #72)', () => {
    it('shows the gateway summary as the main line, never the agent note', () => {
        const s = step({
            method: 'PATCH',
            path: '/datasets/16',
            summary: 'Rename dataset 16 "mnist-mini" → "a"\nCurrent values as they will be after step 1 of this plan.',
            agent_note: 'Pushes image evil/x:v9',
        });
        expect(stepMain(s)).toEqual({
            head: 'Rename dataset 16 "mnist-mini" → "a"',
            details: ['Current values as they will be after step 1 of this plan.'],
            fromGateway: true,
        });
        expect(agentNote(s)).toBe('Pushes image evil/x:v9');
        expect(JSON.stringify(stepMain(s))).not.toContain('evil');
    });

    it('falls back to the call for steps without a summary (older plans), not to the note', () => {
        const old = step({ method: 'PATCH', path: '/models/3', query: { x: '1' }, description: 'Renames model 3' });
        expect(stepMain(old)).toEqual({ head: 'PATCH /models/3?x=1', details: [], fromGateway: false });
        expect(agentNote(old)).toBe('Renames model 3');
    });

    it('reads the agent title from both gateway versions', () => {
        expect(agentTitle(plan({ title: undefined, agent_title: ' Rename twice ' }))).toBe('Rename twice');
        expect(agentTitle(plan({ title: 'Old title' }))).toBe('Old title');
        expect(agentTitle(plan({ title: undefined }))).toBe('');
    });

    it('keeps the technical details complete', () => {
        const s = step({
            tool: 'build_inference_image',
            args: { model_id: '7', name: 'demo' },
            method: 'POST',
            path: '/container-images/build',
            body: { repository: 'OWNER/demo' },
            files: [{ field: 'f', path: '/workspace/a', sha256: 'aa' }],
        });
        const t = stepTechnical(s);
        expect(t).toContain('POST /container-images/build');
        expect(t).toContain('tool build_inference_image with {');
        expect(t).toContain('"model_id": "7"');
        expect(t).toContain('file f: /workspace/a  sha256 aa');
        expect(t).toContain('body {\n  "repository": "OWNER/demo"\n}');
        expect(stepTechnical(step({ method: 'PATCH', path: '/x', body: { name: 'a' } }))).toBe(
            'PATCH /x\nbody {\n  "name": "a"\n}',
        );
    });

    it('splits summaries and counts steps', () => {
        expect(summaryParts(undefined)).toBeUndefined();
        expect(summaryParts('A\n\nB')).toEqual({ head: 'A', details: ['B'] });
        expect(stepCount(1)).toBe('1 step');
        expect(stepCount(2)).toBe('2 steps');
    });
});

describe('summaryChanged', () => {
    const approval = (over: Partial<Approval>) =>
        ({ state: 'pending', ...over } as Pick<Approval, 'state' | 'summary_changed_at'>);

    it('marks a pending approval whose platform state changed', () => {
        expect(summaryChanged(approval({ summary_changed_at: '2026-10-13T10:00:00Z' }))).toBe(true);
    });

    it('is false without a change and for a decided approval', () => {
        expect(summaryChanged(approval({}))).toBe(false);
        expect(summaryChanged(approval({ summary_changed_at: '2026-10-13T10:00:00Z', state: 'rejected' }))).toBe(false);
        expect(summaryChanged(approval({ summary_changed_at: '2026-10-13T10:00:00Z', state: 'approved' }))).toBe(false);
    });
});

// --- autonomous plans (A-E4) ---------------------------------------------------------------------

const auto = (over: Partial<Plan> = {}): Plan =>
    ({
        ...plan(),
        mode: 'autonomous',
        state: 'approved',
        decided_at: '2026-10-16T12:00:00.000Z',
        budget: { max_duration_s: 3600, max_llm_cost: 1.5, max_auto_turns: 20 },
        usage: { llm_cost: 0.42, auto_turns: 3, compute_used: 2, compute_max: 3 },
        steps: [
            step({ idx: 1, state: 'done' }),
            step({ idx: 2, state: 'running', started_at: '2026-10-16T12:00:00.000Z' }),
        ],
        ...over,
    } as Plan);

describe('isAutonomous', () => {
    it('only a plan the gateway marked so', () => {
        expect(isAutonomous(auto())).toBe(true);
        expect(isAutonomous(plan())).toBe(false);
        expect(isAutonomous(plan({ mode: 'interactive' }))).toBe(false);
    });
});

describe('activePlan', () => {
    const now = Date.parse('2026-10-16T12:30:00.000Z');

    it('takes a running or paused plan, and never a proposed one', () => {
        expect(activePlan([auto()], now)?.id).toBe('p1');
        expect(activePlan([auto({ state: 'paused' })], now)?.id).toBe('p1');
        expect(activePlan([auto({ state: 'proposed' })], now)).toBeUndefined();
        expect(activePlan([plan({ mode: 'interactive' })], now)).toBeUndefined();
    });

    it('keeps an ended plan for ten minutes and then lets the header go quiet', () => {
        const ended = auto({ state: 'completed', ended_at: '2026-10-16T12:25:00.000Z' });
        expect(activePlan([ended], now)?.id).toBe('p1');
        expect(activePlan([ended], Date.parse('2026-10-16T12:36:00.000Z'))).toBeUndefined();
    });

    it('an active plan wins over one that just ended, and the newest wins among equals', () => {
        const ended = auto({ id: 'old', state: 'completed', ended_at: '2026-10-16T12:29:00.000Z' });
        expect(activePlan([ended, auto({ id: 'live' })], now)?.id).toBe('live');
        const older = auto({ id: 'a', created_at: '2026-10-16T11:00:00.000Z' });
        const newer = auto({ id: 'b', created_at: '2026-10-16T12:00:00.000Z' });
        expect(activePlan([older, newer], now)?.id).toBe('b');
    });
});

describe('currentStepIndex', () => {
    it('takes the running step, else the failed one, else the next open, else the last done', () => {
        expect(currentStepIndex(auto())).toBe(2);
        expect(
            currentStepIndex(
                auto({
                    state: 'failed',
                    steps: [
                        step({ idx: 1, state: 'done' }),
                        step({ idx: 2, state: 'failed' }),
                        step({ idx: 3, state: 'open' }),
                    ],
                }),
            ),
        ).toBe(2);
        expect(
            currentStepIndex(auto({ steps: [step({ idx: 1, state: 'done' }), step({ idx: 2, state: 'open' })] })),
        ).toBe(2);
        expect(currentStepIndex(auto({ state: 'completed', steps: [step({ idx: 1, state: 'done' })] }))).toBe(1);
        expect(currentStepIndex(auto({ steps: [] }))).toBe(0);
    });

    it('doneSteps counts only the finished ones, currentStep finds the step', () => {
        expect(doneSteps(auto())).toBe(1);
        expect(currentStep(auto())?.idx).toBe(2);
    });
});

describe('needsInput and the pending step (D2.8)', () => {
    const parked = auto({ steps: [step({ idx: 1, parked_approval: 'a1' })] });

    it('the pending list decides, not the mark on the step', () => {
        expect(needsInput(parked, new Set())).toBe(false);
        expect(needsInput(parked, new Set(['a1']))).toBe(true);
        expect(pendingStepOf(parked, new Set(['a1']))?.idx).toBe(1);
        expect(
            pendingIdsOf([
                { id: 'a1', state: 'pending' },
                { id: 'a2', state: 'approved' },
            ]),
        ).toEqual(new Set(['a1']));
    });

    it('a deciding plan is not waiting, and neither is a paused one', () => {
        expect(needsInput(auto({ state: 'paused', steps: [step({ parked_approval: 'a1' })] }), new Set(['a1']))).toBe(
            false,
        );
        expect(needsInput(auto(), new Set(['a1']))).toBe(false);
    });
});

describe('awaitingPlatform', () => {
    it('true only while a step waits for its job', () => {
        expect(awaitingPlatform(auto({ steps: [step({ state: 'waiting' })] }))).toBe(true);
        expect(awaitingPlatform(auto())).toBe(false);
        expect(awaitingPlatform(auto({ state: 'paused', steps: [step({ state: 'waiting' })] }))).toBe(false);
    });
});

describe('stepPhase', () => {
    it('reads the plan state into the step: queued while paused, stopped after a cancel', () => {
        expect(stepPhase(auto(), step({ state: 'done' }))).toBe('done');
        expect(stepPhase(auto(), step({ state: 'running' }))).toBe('running');
        expect(stepPhase(auto(), step({ state: 'waiting' }))).toBe('running');
        expect(stepPhase(auto({ state: 'paused' }), step({ state: 'running' }))).toBe('paused');
        expect(stepPhase(auto({ state: 'paused' }), step({ state: 'open' }))).toBe('queued');
        expect(stepPhase(auto(), step({ state: 'open' }))).toBe('open');
        expect(stepPhase(auto(), step({ state: 'open', covered: false }))).toBe('approval');
        expect(stepPhase(auto({ state: 'failed' }), step({ state: 'open' }))).toBe('notrun');
        expect(stepPhase(auto({ state: 'cancelled' }), step({ state: 'skipped' }))).toBe('stopped');
        expect(stepPhase(auto({ state: 'cancelled' }), step({ state: 'open' }))).toBe('notrun');
    });
});

describe('the time texts', () => {
    it('a duration reads as the card writes it', () => {
        expect(durationText(11 * 60_000 + 20_000)).toBe('11 min 20 s');
        expect(durationText(18 * 60_000)).toBe('18 min');
        expect(durationText(2 * 3600_000 + 4 * 60_000)).toBe('2 h 4 min');
        expect(durationText(2000)).toBe('2 s');
        expect(durationText(-1)).toBe('');
        expect(shortDuration(2 * 3600_000 + 12 * 60_000)).toBe('2h 12m');
        expect(shortDuration(45_000)).toBe('45s');
        expect(leftText(11.4 * 60_000)).toBe('~12 min left');
        expect(leftText(-1000)).toBe('~0 min left');
    });

    it('the line under a step names the runtime and, where the gateway estimates, the time left', () => {
        const now = Date.parse('2026-10-16T12:11:20.000Z');
        const running = step({
            state: 'running',
            started_at: '2026-10-16T12:00:00.000Z',
            eta: '2026-10-16T12:23:20.000Z',
        });
        expect(stepTimeLine(running, now)).toBe('Runtime 11 min 20 s · ~12 min left');
        const unknown = step({ state: 'waiting', started_at: '2026-10-16T12:00:00.000Z' });
        expect(stepTimeLine(unknown, now)).toBe('Runtime 11 min 20 s · time left unknown');
        expect(stepTimeLine(step({ state: 'running' }), now)).toBe('');
    });

    it('the one line above it is the platform message, else the waiting sentence', () => {
        expect(stepMessage(step({ progress_msg: 'Epoch 5/10 · loss 0.142' }))).toBe('Epoch 5/10 · loss 0.142');
        expect(stepMessage(step({ state: 'waiting' }))).toBe('Waiting for the platform · no progress reported');
        expect(stepMessage(step({ state: 'running' }))).toBe('');
    });
});

describe('budgetLine', () => {
    const now = Date.parse('2026-10-16T12:30:00.000Z');

    it('joins the time left, the cost, the turns and the compute calls (D4.5)', () => {
        expect(budgetLine(auto(), now)).toBe('30m left · 0.42/1.50 USD · 3/20 turns · 2/3 compute calls');
    });

    it('leaves out what the plan does not carry, and an interactive plan has no line', () => {
        // no cost limit, no turns, no compute: the duration the plan carries stays, everything else is left out
        const plain = auto({
            budget: { max_duration_s: 3600, max_llm_cost: 0, max_auto_turns: 0 },
            usage: { llm_cost: 0, auto_turns: 0, compute_used: 0, compute_max: 0 },
        });
        expect(budgetLine(plain, now)).toBe('30m left');
        expect(budgetLine(plan(), now)).toBe('');
    });

    it('an end state says when it ended and how long it took', () => {
        const done = auto({ state: 'completed', ended_at: '2026-10-16T12:41:00.000Z' });
        expect(budgetLine(done, now)).toBe('Finished 12:41 · 41 min · 0.42/1.50 USD · 3/20 turns · 2/3 compute calls');
        expect(budgetLine(auto({ state: 'failed', ended_at: '2026-10-16T12:41:00.000Z' }), now)).toContain(
            'Stopped 12:41',
        );
        expect(budgetLine(auto({ state: 'cancelled', ended_at: '2026-10-16T12:41:00.000Z' }), now)).toContain(
            'Cancelled 12:41',
        );
    });
});

describe('the objects a plan produced (L4)', () => {
    const produced = auto({
        steps: [
            step({
                idx: 1,
                state: 'done',
                outputs: [
                    { resource: 'dataset', id: '7' },
                    { resource: 'model', id: '12' },
                ],
            }),
            step({
                idx: 2,
                state: 'done',
                outputs: [
                    { resource: 'dataset', id: '7' },
                    { resource: 'image', id: 'agent-test/mnist:v1' },
                ],
            }),
        ],
    });

    it('reads the kind and the platform page of an output', () => {
        expect(outputKind({ resource: 'dataset', id: '7' })).toBe('dataset');
        expect(outputKind({ resource: 'model', id: '7' })).toBe('model');
        expect(outputKind({ resource: 'image', id: 'x' })).toBe('image');
        expect(outputKind({ resource: 'whatever', id: 'x' })).toBeUndefined();
        expect(outputLink({ resource: 'dataset', id: '7' })).toBe('/data?dataset=7');
        expect(outputLink({ resource: 'model', id: '12' })).toBe('/models/12');
        expect(outputLink({ resource: 'image', id: 'agent-test/mnist:v1' })).toBe('/container-images');
        expect(outputLink({ resource: 'model', id: '' })).toBeUndefined();
        expect(outputLink({ resource: 'unknown', id: '3' })).toBeUndefined();
    });

    it('lists them once each, in the order of the steps', () => {
        expect(planOutputs(produced).map((o) => o.id)).toEqual(['7', '12', 'agent-test/mnist:v1']);
        expect(createdSubject(produced)).toBe('Dataset, model and image');
        expect(createdStay(produced)).toBe('Dataset, model and image stay.');
        expect(createdStay(auto({ steps: [step({ outputs: [{ resource: 'dataset', id: '7' }] })] }))).toBe(
            'Dataset stays.',
        );
        expect(createdStay(auto())).toBe('');
    });
});

describe('fetchActivePlans and runningPlans', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('collects the autonomous plans of several chats and survives a chat that fails', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: string) => {
                if (url.includes('c2')) return { ok: false, status: 500, statusText: 'Server Error' };
                return { ok: true, status: 200, json: async () => [auto(), plan()] };
            }),
        );
        const list = await fetchActivePlans(['c1', 'c2']);
        expect(list.map((p) => p.id)).toEqual(['p1']);
    });

    it('lists only the plans that are still going, newest first', () => {
        const running = runningPlans(
            [
                auto({ id: 'a', created_at: '2026-10-16T10:00:00.000Z' }),
                auto({ id: 'b', created_at: '2026-10-16T12:00:00.000Z', state: 'paused' }),
                auto({ id: 'c', state: 'completed', ended_at: '2026-10-16T12:20:00.000Z' }),
                auto({ id: 'd', state: 'proposed' }),
            ],
            new Set(),
        );
        expect(running.map((p) => p.id)).toEqual(['b', 'a']);
    });

    it('a plan waiting for the user counts as running, a proposed one does not', () => {
        const parked = auto({ id: 'e', steps: [step({ parked_approval: 'a1' })] });
        expect(runningPlans([parked], new Set(['a1'])).map((p) => p.id)).toEqual(['e']);
        // a plan the user has not approved yet is not running, a parked step or not
        expect(runningPlans([auto({ id: 'e', state: 'proposed', steps: [step({ parked_approval: 'a1' })] })], new Set())).toEqual(
            [],
        );
    });
});

describe('grantRows (L13)', () => {
    it('takes the gateway\'s structured summary where it sends one', () => {
        const p = auto({ grant_summary: [{ effect: 'write', text: 'create dataset' }] });
        expect(grantRows(p)).toEqual([{ effect: 'write', text: 'create dataset' }]);
    });

    it('forms the rows from the raw grant when there is none (E1 sends no summary yet)', () => {
        const p = auto({
            grant: {
                rules: [
                    { action: 'write', resource: 'dataset' },
                    { action: 'compute', resource: 'training', ids: ['7'] },
                    { action: 'read', resource: 'dataset', ids: ['*'] },
                    { action: 'irreversible', resource: 'model' },
                ],
            },
        });
        expect(grantRows(p)).toEqual([
            { effect: 'write', text: 'write dataset' },
            { effect: 'compute', text: 'compute training (7)' },
            { effect: 'read', text: 'read everything' },
            { effect: 'irreversible', text: 'irreversible model' },
        ]);
    });

    it('without a readable grant the block stays empty', () => {
        expect(grantRows(auto())).toEqual([]);
        expect(grantRows(auto({ grant: { rules: [] } }))).toEqual([]);
    });
});
