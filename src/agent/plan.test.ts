// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    agentNote,
    agentTitle,
    fetchPlans,
    placePlans,
    planLabel,
    Plan,
    PlanStep,
    stepCount,
    stepMain,
    stepStatus,
    stepTechnical,
    summaryChanged,
    summaryParts,
} from './plan';
import type { Step, TranscriptItem } from './transcript';
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
        expect(byItem.get('a2')).toEqual([p]);
        expect(byItem.has('a1')).toBe(false);
        expect(rest).toEqual([]);
    });

    it('keeps subagent plans out of the main chat', () => {
        const items = [agent('a1', ['t1'])];
        const sub = plan({ id: 'sub', tool_call_id: 't1', session: 'sub-run-2' });
        const main = plan({ id: 'main', tool_call_id: 't1', session: 'main' });
        const shown = placePlans(items, [sub, main], true);
        expect(shown.byItem.get('a1')).toEqual([main]);
        expect(shown.rest).toEqual([]);
        const inSubagent = placePlans(items, [sub, main], false);
        expect(inSubagent.byItem.get('a1')).toEqual([sub, main]);
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
