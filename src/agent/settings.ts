// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Settings of a chat that the user switches in the UI: internet access of the sandbox, automatic compaction,
// "Compact now" (gateway API.md: POST /chats/{id}/internet, /autocompact, /commands with "/compact"). The subagent
// limit is fixed in the gateway (at most 5 at the same time) and not a setting. Pure functions; the components only render what these return.

import { AgentApiError } from './api';
import type { Approval, Chat } from './types';
import type { Compacting } from './usage';

export type Setting = 'internet' | 'autocompact' | 'compact';

const SETTING_LABEL: Record<Setting, string> = {
    internet: 'Switching internet access',
    autocompact: 'Switching auto-compaction',
    compact: 'Compaction',
};

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Why switching a setting failed, in words. */
export function settingErrorText(setting: Setting, e: unknown): string {
    if (setting === 'compact') return compactErrorText(e);
    if (e instanceof AgentApiError && e.status === 409)
        return `${SETTING_LABEL[setting]} is not possible right now: ${e.message}`;
    return `${SETTING_LABEL[setting]} failed: ${messageOf(e)}`;
}

/** Why "Compact now" failed; 409: the agent works (or a compaction already runs). */
export function compactErrorText(e: unknown): string {
    if (e instanceof AgentApiError && e.status === 409)
        return 'The agent is working right now. Compacting is possible once the current response has finished.';
    return `Compaction failed: ${messageOf(e)}`;
}

/**
 * State of the "Compact now" button. Locked while the agent works or a compaction runs, and while the chat is being
 * resumed; for a chat the gateway let idle the hint says that compacting loads it first.
 */
export function compactNowState(
    chat: Pick<Chat, 'running' | 'resuming' | 'starting' | 'state'> | undefined,
    compacting: Compacting | undefined,
    busy = false,
): { disabled: boolean; hint?: string } {
    if (!chat) return { disabled: true };
    if (compacting || busy) return { disabled: true, hint: 'Compacting the context …' };
    if (chat.running) return { disabled: true, hint: 'Only possible while the agent is not working.' };
    if (chat.starting) return { disabled: true, hint: 'The chat is being prepared; nothing to compact yet.' };
    if (chat.resuming) return { disabled: true, hint: 'The chat is resuming; try again in a moment.' };
    if (chat.state === 'dormant') return { disabled: false, hint: 'Loads the chat, then compacts.' };
    return { disabled: false, hint: 'Summarises older parts of the conversation now.' };
}

/** Automatic compaction is on unless the chat says otherwise (pi's default). */
export const autoCompactOn = (chat: Pick<Chat, 'auto_compact'> | undefined): boolean => chat?.auto_compact ?? true;

/** The agent or one of its subagents (the session of a subagent is not "main"). */
export const approvalWho = (a: Pick<Approval, 'session'>): string =>
    a.session && a.session !== 'main' ? 'A subagent' : 'The agent';

