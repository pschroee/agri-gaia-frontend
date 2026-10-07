// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// One answer of the agent as the chat shows it since issue #54: the text in full, the model's thinking and the tool
// steps behind one collapsed line ("Thought 9 s · 3 tool calls"), opened in the order they happened. Pure logic,
// used by Conversation (AgentBlock, ProcessLine) and the copy button.

import type { AgentPart, Step, ThinkingPart } from './transcript';

/** What the collapsed line hides: thinking blocks and step lists, in order (adjacent step lists joined). */
export type ProcessPart = ThinkingPart | { type: 'steps'; steps: Step[] };

export type TextPart = Extract<AgentPart, { type: 'text' }>;

/**
 * Splits an answer into its text (shown in full, in order) and its process (thinking and steps, in order). Texts
 * between steps stay with the text, so nothing the agent wrote is hidden; step lists that become neighbours by taking
 * the text out are joined.
 */
export function splitAnswer(parts: AgentPart[]): { texts: TextPart[]; process: ProcessPart[] } {
    const texts: TextPart[] = [];
    const process: ProcessPart[] = [];
    for (const p of parts) {
        if (p.type === 'text') {
            texts.push(p);
            continue;
        }
        if (p.type === 'steps') {
            const last = process[process.length - 1];
            if (last?.type === 'steps') {
                process[process.length - 1] = { type: 'steps', steps: [...last.steps, ...p.steps] };
                continue;
            }
            process.push({ type: 'steps', steps: p.steps.slice() });
            continue;
        }
        process.push(p);
    }
    return { texts, process };
}

/** All steps of the process, in order. */
export function processSteps(process: ProcessPart[]): Step[] {
    return process.flatMap((p) => (p.type === 'steps' ? p.steps : []));
}

/** "9 s", "1 min 5 s"; at least one second (a measured block never reads "0 s"). */
export function formatSeconds(ms: number): string {
    const s = Math.max(1, Math.round(ms / 1000));
    if (s < 60) return `${s} s`;
    const m = Math.floor(s / 60);
    const r = s % 60;
    return r ? `${m} min ${r} s` : `${m} min`;
}

/**
 * Text of the collapsed line: "Thought 9 s · 3 tool calls", "Thought · 1 tool call · 1 failed", "2 tool calls".
 * The thinking time is the sum of the measured blocks; pi stores no timing, so after a reload it is "Thought".
 * Failed and blocked steps are counted, so a failure is visible without opening the line. Empty without process.
 */
export function processSummary(process: ProcessPart[]): string {
    const thinking = process.filter((p): p is ThinkingPart => p.type === 'thinking');
    const steps = processSteps(process);
    const pieces: string[] = [];
    if (thinking.length) {
        const measured = thinking.filter((t) => t.durationMs !== undefined);
        const total = measured.reduce((sum, t) => sum + (t.durationMs ?? 0), 0);
        pieces.push(measured.length ? `Thought ${formatSeconds(total)}` : 'Thought');
    }
    if (steps.length) pieces.push(`${steps.length} ${steps.length === 1 ? 'tool call' : 'tool calls'}`);
    const failed = steps.filter((s) => s.status === 'error').length;
    const blocked = steps.filter((s) => s.status === 'blocked').length;
    if (failed) pieces.push(`${failed} failed`);
    if (blocked) pieces.push(`${blocked} blocked`);
    return pieces.join(' · ');
}

/**
 * The step to show below "Thinking …" while the answer is being worked on: the last running one, else the last one
 * waiting for approval; none while the model thinks or writes.
 */
export function currentStep(process: ProcessPart[]): Step | undefined {
    const steps = processSteps(process);
    for (let i = steps.length - 1; i >= 0; i--) if (steps[i].status === 'running') return steps[i];
    for (let i = steps.length - 1; i >= 0; i--) if (steps[i].status === 'waiting') return steps[i];
    return undefined;
}

/**
 * Whether the answer is still being worked on in a way the user should see as "Thinking …" with a progress bar: it is
 * the turn that runs right now and its last part is not text (the model thinks or a tool runs). While text streams,
 * the text itself is the progress.
 */
export function showsWorking(parts: AgentPart[], active: boolean): boolean {
    if (!active) return false;
    const last = parts[parts.length - 1];
    return !last || last.type !== 'text';
}

/** The answer as Markdown for the copy button: its text parts in order, separated by blank lines. */
export function answerMarkdown(parts: AgentPart[]): string {
    return parts
        .filter((p): p is TextPart => p.type === 'text')
        .map((p) => p.text.trim())
        .filter(Boolean)
        .join('\n\n');
}
