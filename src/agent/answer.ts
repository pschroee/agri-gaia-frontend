// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// One answer of the agent as the chat shows it: its parts in the order they happened (text, thinking blocks, tool
// steps; issue #57 brought that back after the summary line of #54). Pure logic, used by Conversation (AgentBlock).

import type { AgentPart, Step } from './transcript';

export type TextPart = Extract<AgentPart, { type: 'text' }>;

/** All tool steps of an answer, in order (for the subagent card under it). */
export function answerSteps(parts: AgentPart[]): Step[] {
    return parts.flatMap((p) => (p.type === 'steps' ? p.steps : []));
}
