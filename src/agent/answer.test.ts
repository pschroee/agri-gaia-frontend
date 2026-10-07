// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import {
    answerMarkdown,
    currentStep,
    formatSeconds,
    processSteps,
    processSummary,
    showsWorking,
    splitAnswer,
} from './answer';
import type { AgentPart, Step, StepStatus } from './transcript';

const step = (id: string, status: StepStatus = 'done'): Step => ({ id, tool: 'bash', status });
const think = (id: string, durationMs?: number): AgentPart => ({ type: 'thinking', id, text: 'hm', durationMs });
const text = (t: string): AgentPart => ({ type: 'text', text: t });

describe('splitAnswer', () => {
    it('keeps every text visible and the process in order, joining step lists that became neighbours', () => {
        const parts: AgentPart[] = [
            think('t1', 2000),
            text('Let me look.'),
            { type: 'steps', steps: [step('a')] },
            text('Found it.'),
            { type: 'steps', steps: [step('b')] },
            think('t2', 3000),
            text('There are 3 datasets.'),
        ];
        const { texts, process } = splitAnswer(parts);
        expect(texts.map((t) => t.text)).toEqual(['Let me look.', 'Found it.', 'There are 3 datasets.']);
        expect(process.map((p) => (p.type === 'steps' ? p.steps.map((s) => s.id).join('+') : p.id))).toEqual([
            't1',
            'a+b',
            't2',
        ]);
        expect(processSteps(process).map((s) => s.id)).toEqual(['a', 'b']);
        // the input is not changed
        expect(parts[2]).toEqual({ type: 'steps', steps: [step('a')] });
    });
});

describe('processSummary', () => {
    it('reads like "Thought 9 s · 3 tool calls"', () => {
        const { process } = splitAnswer([
            think('t1', 4200),
            think('t2', 4600),
            { type: 'steps', steps: [step('a'), step('b'), step('c')] },
        ]);
        expect(processSummary(process)).toBe('Thought 9 s · 3 tool calls');
    });

    it('says "Thought" without a measured time and counts failed and blocked steps', () => {
        const { process } = splitAnswer([
            think('t1'),
            { type: 'steps', steps: [step('a', 'error'), step('b', 'blocked'), step('c', 'error')] },
        ]);
        expect(processSummary(process)).toBe('Thought · 3 tool calls · 2 failed · 1 blocked');
        expect(processSummary(splitAnswer([{ type: 'steps', steps: [step('a')] }]).process)).toBe('1 tool call');
        expect(processSummary(splitAnswer([think('t', 61000)]).process)).toBe('Thought 1 min 1 s');
        expect(processSummary([])).toBe('');
    });

    it('formats seconds and minutes, never zero', () => {
        expect(formatSeconds(200)).toBe('1 s');
        expect(formatSeconds(9400)).toBe('9 s');
        expect(formatSeconds(120000)).toBe('2 min');
        expect(formatSeconds(125000)).toBe('2 min 5 s');
    });
});

describe('working state', () => {
    it('names the running step, else one waiting for approval', () => {
        const { process } = splitAnswer([
            { type: 'steps', steps: [step('a', 'waiting'), step('b', 'running'), step('c')] },
        ]);
        expect(currentStep(process)?.id).toBe('b');
        expect(currentStep(splitAnswer([{ type: 'steps', steps: [step('a', 'waiting')] }]).process)?.id).toBe('a');
        expect(currentStep(splitAnswer([think('t')]).process)).toBeUndefined();
    });

    it('shows "Thinking …" while the active answer does not end in text', () => {
        expect(showsWorking([], true)).toBe(true);
        expect(showsWorking([think('t')], true)).toBe(true);
        expect(showsWorking([text('Hi'), { type: 'steps', steps: [step('a', 'running')] }], true)).toBe(true);
        expect(showsWorking([think('t'), text('Writing …')], true)).toBe(false);
        expect(showsWorking([think('t')], false)).toBe(false);
    });
});

describe('answerMarkdown', () => {
    it('copies the texts as Markdown, without thinking and steps', () => {
        expect(
            answerMarkdown([
                think('t1'),
                text('**Bold** start.\n'),
                { type: 'steps', steps: [step('a')] },
                text('  \n'),
                text('| a | b |\n|---|---|'),
            ]),
        ).toBe('**Bold** start.\n\n| a | b |\n|---|---|');
        expect(answerMarkdown([think('t')])).toBe('');
    });
});
