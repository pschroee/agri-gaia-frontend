// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The plan environment of a conversation (A-E4, D4.4): the cards get the notify choice of this user. Without it
// the checkbox of a proposed plan renders and its click has nowhere to go (live finding of 17.10.2026).

import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { WatchJob } from '../jobs';
import type { Step, TranscriptItem } from '../transcript';
import type { Approval } from '../types';
import { AgentBlock, planEnvOf } from './Conversation';

afterEach(cleanup);

describe('planEnvOf', () => {
    const base = {
        approvals: [],
        jobs: [],
        pending: new Set<string>(),
        layout: 'page' as const,
    };

    it('carries the notify choice into the plan environment', () => {
        const onNotify = vi.fn();
        const notifyOptIn = () => true;
        const env = planEnvOf(base, onNotify, notifyOptIn);
        expect(env.onNotify).toBe(onNotify);
        expect(env.notifyOptIn).toBe(notifyOptIn);
        expect(env.layout).toBe('page');
    });

    it('keeps a view without the choice free of it', () => {
        const env = planEnvOf(base);
        expect(env.onNotify).toBeUndefined();
        expect(env.notifyOptIn).toBeUndefined();
    });
});

// Issue #192: the group of calls is cut after every call a card hangs on.
const step = (id: string, over: Partial<Step> = {}): Step => ({ id, tool: 'bash', status: 'done', ...over });
const approval = (over: Partial<Approval>): Approval =>
    ({
        id: 'a1',
        chat_id: 'c1',
        kind: 'internet_access',
        via: 'cli',
        name: 'x',
        size: 0,
        sha256: '',
        content_type: '',
        state: 'approved',
        created_at: '2026-10-21T10:00:00.000Z',
        decided_at: '2026-10-21T10:01:00.000Z',
        ...over,
    } as Approval);

function show(steps: Step[], approvals: Approval[], jobs: WatchJob[] = []) {
    const item: Extract<TranscriptItem, { kind: 'agent' }> = {
        kind: 'agent',
        parts: [{ type: 'steps', steps }],
    } as never;
    const env = planEnvOf({ approvals, jobs, pending: new Set<string>(), layout: 'panel' });
    return render(
        <MemoryRouter>
            <AgentBlock
                item={item}
                dense
                thinking={{ open: {}, onOpenChange: () => undefined }}
                approvals={approvals}
                planEnv={env}
            />
        </MemoryRouter>,
    );
}

/** The test ids of the blocks of the answer, in document order. */
const order = (root: HTMLElement) =>
    [...root.querySelectorAll('[data-testid]')]
        .map((e) => e.getAttribute('data-testid'))
        .filter((t) =>
            ['agent-step-list', 'agent-notebook-approval', 'agent-notebook-run', 'agent-internet-decided', 'agent-platform-decided'].includes(t ?? ''),
        );

describe('AgentBlock cuts the group at the call of a card', () => {
    const six = ['s1', 's2', 's3', 's4', 's5', 's6'].map((id) => step(id));

    it('keeps a group without cards in one block', () => {
        const { container } = show(six, []);
        expect(order(container)).toEqual(['agent-step-list']);
    });

    it('puts approval and run card between the first four calls and the last two', () => {
        const a = approval({
            kind: 'platform_write',
            tool_call_id: 's4',
            notebook: { entry: 'a.py', files: [], datasets: [], limits: { cpus: 1, mem_gb: 1, timeout_min: 1, internet: false } },
        });
        const job = { id: 'j1', chat_id: 'c1', kind: 'notebook_run', state: 'done', tool_call_id: 's4' } as WatchJob;
        const { container } = show(six, [a], [job]);
        expect(order(container)).toEqual([
            'agent-step-list',
            'agent-notebook-approval',
            'agent-notebook-run',
            'agent-step-list',
        ]);
    });

    it('shows a second piece for the calls that still run after the card', () => {
        const calls = [step('s1'), step('s2'), step('s3', { status: 'running' }), step('s4', { status: 'running' })];
        const a = approval({ kind: 'internet_access', tool_call_id: 's2', internet: { kind: 'sites', hosts: [] } as never });
        const { container } = show(calls, [a]);
        expect(order(container)).toEqual(['agent-step-list', 'agent-internet-decided', 'agent-step-list']);
        expect(screen.getAllByTestId('agent-step-list')[1].textContent).toContain('2 tool calls');
    });

    it('cuts the package case after the call that asked, also from stored approvals', () => {
        const calls = [step('s1'), step('s2'), step('s3'), step('s4')];
        const a = approval({ kind: 'internet_access', tool_call_id: 's2', internet: { kind: 'packages', hosts: [] } as never });
        const { container } = show(calls, [a]);
        expect(order(container)).toEqual(['agent-step-list', 'agent-internet-decided', 'agent-step-list']);
    });

    it('puts a decided platform call right after its call', () => {
        const a = approval({ kind: 'platform_write', tool_call_id: 's2', summary: 'Rename dataset 3' });
        const { container } = show([step('s1'), step('s2'), step('s3')], [a]);
        expect(order(container)).toEqual(['agent-step-list', 'agent-platform-decided', 'agent-step-list']);
    });

    it('leaves an open approval out of the history', () => {
        const a = approval({ kind: 'internet_access', state: 'pending', tool_call_id: 's2' });
        const { container } = show([step('s1'), step('s2')], [a]);
        expect(order(container)).toEqual(['agent-step-list']);
    });
});
