// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Settings of a chat that the user switches in the UI: internet access of the sandbox, automatic compaction,
// "Compact now" and the subagent limit (gateway API.md: POST /chats/{id}/internet, /autocompact, /subagents,
// /commands with "/compact"). Pure functions; the components only render what these return.

import { AgentApiError } from './api';
import type { Approval, Chat, Config } from './types';
import type { Compacting } from './usage';

export type Setting = 'internet' | 'autocompact' | 'subagents' | 'compact';

const SETTING_LABEL: Record<Setting, string> = {
    internet: 'Switching internet access',
    autocompact: 'Switching auto-compaction',
    subagents: 'Changing the subagent limit',
    compact: 'Compaction',
};

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Tooltip of the internet switch: what on and off mean, and when a change takes effect. */
export function internetHint(chat: Pick<Chat, 'internet' | 'state'>): string {
    const base = chat.internet
        ? 'Internet access on: the sandbox can reach the web. The language model and the gateway are always reachable.'
        : 'Internet access off: the sandbox reaches only the language model and the gateway. The agent can ask for internet; you approve it in the chat.';
    const when = chat.state === 'dormant' ? ' The change takes effect when the chat resumes.' : '';
    return `${base}${when}`;
}

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
 * State of the "Compact now" button. Locked while the agent works or a compaction runs, and while a dormant chat
 * resumes; for a dormant chat the hint says that compacting resumes it first.
 */
export function compactNowState(
    chat: Pick<Chat, 'running' | 'resuming' | 'state'> | undefined,
    compacting: Compacting | undefined,
    busy = false,
): { disabled: boolean; hint?: string } {
    if (!chat) return { disabled: true };
    if (compacting || busy) return { disabled: true, hint: 'Compacting the context …' };
    if (chat.running) return { disabled: true, hint: 'Only possible while the agent is not working.' };
    if (chat.resuming) return { disabled: true, hint: 'The chat is resuming; try again in a moment.' };
    if (chat.state === 'dormant') return { disabled: false, hint: 'Resumes the chat in a sandbox, then compacts.' };
    return { disabled: false, hint: 'Summarises older parts of the conversation now.' };
}

/** Automatic compaction is on unless the chat says otherwise (pi's default). */
export const autoCompactOn = (chat: Pick<Chat, 'auto_compact'> | undefined): boolean => chat?.auto_compact ?? true;

export type SubagentLimit = {
    /** Allowed subagents. */
    max: number;
    /** Started so far. */
    used: number;
    /** More started than allowed (the gateway aborted the turn). */
    over: boolean;
    /** Upper bound from the config; undefined when unknown. */
    limit?: number;
    /** "Subagents 1 / 3". */
    label: string;
    /** "1/3", for the narrow panel. */
    short: string;
    canDecrease: boolean;
    canIncrease: boolean;
};

/** Subagent limit of a chat, bounded by max_subagents_limit of the config. */
export function subagentLimit(
    chat: Pick<Chat, 'max_subagents' | 'subagents'>,
    config?: Pick<Config, 'max_subagents_limit'>,
): SubagentLimit {
    const max = Math.max(0, chat.max_subagents ?? 0);
    const used = Math.max(0, chat.subagents ?? 0);
    const raw = config?.max_subagents_limit;
    const limit = typeof raw === 'number' && raw >= 0 ? raw : undefined;
    return {
        max,
        used,
        over: used > max,
        limit,
        label: `Subagents ${used} / ${max}`,
        short: `${used}/${max}`,
        canDecrease: max > 0,
        canIncrease: limit === undefined || max < limit,
    };
}

/** A new limit within 0 … limit (an integer); without a known limit only the lower bound applies. */
export function clampSubagents(n: number, limit?: number): number {
    const v = Number.isFinite(n) ? Math.round(n) : 0;
    const lower = Math.max(0, v);
    return limit === undefined ? lower : Math.min(lower, limit);
}

/** The agent or one of its subagents (the session of a subagent is not "main"). */
export const approvalWho = (a: Pick<Approval, 'session'>): string =>
    a.session && a.session !== 'main' ? 'A subagent' : 'The agent';

/**
 * Texts of the approval card for an internet request (agw-internet, MCP request_internet): who asks, the reason the
 * agent gave (the approval's name; the gateway writes "(no reason given)" without one), and what approving does.
 */
export function internetApprovalText(a: Pick<Approval, 'session' | 'name' | 'via'>): {
    title: string;
    reason?: string;
    explain: string;
} {
    const reason = a.name?.trim();
    return {
        title: `${approvalWho(a)} asks for internet access`,
        reason: reason && reason !== '(no reason given)' ? reason : undefined,
        explain:
            'Allowing switches on internet access for the sandbox of this chat; it stays on until you switch it off with the globe in the chat header. Rejecting keeps the sandbox offline.',
    };
}
