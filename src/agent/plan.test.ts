// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    agentNote,
    agentTitle,
    fetchPlans,
    placePlans,
    plansByPart,
    planLabel,
    Plan,
    PlacedPlan,
    PlanStep,
    stepCount,
    stepMain,
    stepStatus,
    stepTechnical,
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
        expect(planLabel(plan({ state: 'approved', expires_at: until }), now)).toMatch(/^Approved · valid until \d{2}:\d{2}$/);
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

    it('carries the step it was proposed at as the plan\'s place in the answer (issue #138)', () => {
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
        expect(stepTechnical(step({ method: 'PATCH', path: '/x', body: { name: 'a' } }))).toBe('PATCH /x\nbody {\n  "name": "a"\n}');
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
        ({ state: 'pending', ...over }) as Pick<Approval, 'state' | 'summary_changed_at'>;

    it('marks a pending approval whose platform state changed', () => {
        expect(summaryChanged(approval({ summary_changed_at: '2026-10-13T10:00:00Z' }))).toBe(true);
    });

    it('is false without a change and for a decided approval', () => {
        expect(summaryChanged(approval({}))).toBe(false);
        expect(summaryChanged(approval({ summary_changed_at: '2026-10-13T10:00:00Z', state: 'rejected' }))).toBe(false);
        expect(summaryChanged(approval({ summary_changed_at: '2026-10-13T10:00:00Z', state: 'approved' }))).toBe(false);
    });
});
