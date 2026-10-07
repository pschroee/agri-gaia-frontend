// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// One answer of the agent as the chat shows it: its parts in the order they happened (text, thinking blocks, tool
// steps; issue #57 brought that back after the summary line of #54). Pure logic, used by Conversation (AgentBlock) and
// the copy button.

import type { AgentPart, Step } from './transcript';

export type TextPart = Extract<AgentPart, { type: 'text' }>;

/** All tool steps of an answer, in order (for the subagent card under it). */
export function answerSteps(parts: AgentPart[]): Step[] {
    return parts.flatMap((p) => (p.type === 'steps' ? p.steps : []));
}

/** The answer as Markdown for the copy button: its text parts in order, separated by blank lines. */
export function answerMarkdown(parts: AgentPart[]): string {
    return parts
        .filter((p): p is TextPart => p.type === 'text')
        .map((p) => p.text.trim())
        .filter(Boolean)
        .join('\n\n');
}
