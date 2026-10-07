// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import { answerMarkdown, answerSteps } from './answer';
import type { AgentPart, Step, StepStatus } from './transcript';

const step = (id: string, status: StepStatus = 'done'): Step => ({ id, tool: 'bash', status });
const think = (id: string, durationMs?: number): AgentPart => ({ type: 'thinking', id, text: 'hm', durationMs });
const text = (t: string): AgentPart => ({ type: 'text', text: t });

describe('answerSteps', () => {
    it('lists the steps of all step parts in order, without thinking and text', () => {
        const parts: AgentPart[] = [
            think('t1', 2000),
            text('Let me look.'),
            { type: 'steps', steps: [step('a'), step('b', 'running')] },
            text('Found it.'),
            { type: 'steps', steps: [step('c', 'error')] },
            think('t2'),
        ];
        expect(answerSteps(parts).map((s) => s.id)).toEqual(['a', 'b', 'c']);
        expect(answerSteps([think('t')])).toEqual([]);
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
