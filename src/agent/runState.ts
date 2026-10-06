// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Run state of a chat for the status line, the chat list and the panel header, plus the texts of the run controls
// (stop, let it rest). Pure functions, unit-tested.

import type { Chat, StoredMessage } from './types';
import type { PageContext } from './pageContext';

/**
 * - `working`: pi works on a turn
 * - `waiting`: the turn is blocked on an approval of the user
 * - `resuming`: a dormant chat is being rebuilt in a fresh sandbox
 * - `idle`: active (sandbox assigned), nothing running
 * - `dormant`: resting, session saved and sandbox released; the next message resumes it
 */
export type RunState = 'working' | 'waiting' | 'resuming' | 'idle' | 'dormant';

type RunChat = Pick<Chat, 'state' | 'running' | 'resuming' | 'pending_approvals'>;

/**
 * Derives the run state. `pendingApprovals` is the live count of the open view (approvals arrive over SSE before
 * the chat event); without it the chat's own counter applies. `resumeRunning`: SSE resume steps are coming in.
 */
export function runStateOf(
    chat: RunChat | undefined,
    opts: { pendingApprovals?: number; resumeRunning?: boolean } = {},
): RunState | undefined {
    if (!chat) return undefined;
    if (chat.resuming || opts.resumeRunning) return 'resuming';
    const pending = opts.pendingApprovals ?? chat.pending_approvals ?? 0;
    if (chat.running) return pending > 0 ? 'waiting' : 'working';
    // an open approval also keeps a chat that is not marked running from resting
    if (pending > 0 && chat.state === 'active') return 'waiting';
    return chat.state === 'dormant' ? 'dormant' : 'idle';
}

export const RUN_STATE_LABEL: Record<RunState, string> = {
    working: 'Working',
    waiting: 'Waiting for approval',
    resuming: 'Resuming',
    idle: 'Idle',
    dormant: 'Resting',
};

/** Short label for chat lists (lower case, next to the date). */
export const RUN_STATE_SHORT: Record<RunState, string> = {
    working: 'working',
    waiting: 'waiting for approval',
    resuming: 'resuming',
    idle: 'active',
    dormant: 'resting',
};

export const RUN_STATE_HINT: Record<RunState, string> = {
    working: 'The agent works on your request. Messages you send now are queued.',
    waiting: 'The agent waits for your decision on an approval.',
    resuming: 'The chat was resting; its sandbox is being rebuilt.',
    idle: 'Sandbox ready. Let the chat rest to release it; your next message resumes it.',
    dormant: 'The chat is resting: session saved, sandbox released. Your next message resumes it.',
};

/** Does the state count as a running turn (timer, stop button)? */
export const isRunning = (s: RunState | undefined) => s === 'working' || s === 'waiting';

/**
 * Start of the running turn in ms: the gateway's `running_since`, otherwise the time of the last user message
 * (the turn starts with it). Nothing when the chat does not run or nothing is known.
 */
export function runSince(
    chat: Pick<Chat, 'running' | 'running_since'> | undefined,
    messages: StoredMessage[] = [],
): number | undefined {
    if (!chat?.running) return undefined;
    const server = chat.running_since ? Date.parse(chat.running_since) : NaN;
    if (!Number.isNaN(server)) return server;
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'user') {
            const t = Date.parse(messages[i].created_at);
            return Number.isNaN(t) ? undefined : t;
        }
    }
    return undefined;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Running duration: below a minute "12 s", then "1:05", from one hour "1:02:03". */
export function formatElapsed(ms: number): string {
    if (!Number.isFinite(ms)) return '';
    const secs = Math.floor(Math.max(0, ms) / 1000);
    if (secs < 60) return `${secs} s`;
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Message for a failed stop. 409: the turn had ended already. */
export function abortErrorText(status: number | undefined, message: string): string {
    if (status === 409) return 'The agent had already stopped.';
    return `Stopping failed: ${message}`;
}

/**
 * Message for a failed "Let it rest". The gateway answers 409 with an open approval ("chat has a pending
 * approval") and while the agent works ("agent is working").
 */
export function suspendErrorText(status: number | undefined, message: string): string {
    if (status === 409 && /approval/i.test(message)) {
        return 'The chat cannot rest while an approval is open: the agent waits for your decision. Approve or reject it first, then let the chat rest.';
    }
    if (status === 409) return 'The agent is working. Stop it or wait until it is done, then let the chat rest.';
    return `Could not let the chat rest: ${message}`;
}

/** A message sent outside the queue whose user message is not stored yet (shown greyed in the transcript). */
/** files: names of the attachments sent with it. */
export type PendingSend = { key: string; text: string; afterSeq: number; files?: string[]; context?: PageContext };

/** Has the pending message been stored (a user message after the send)? */
export function pendingSettled(p: PendingSend, messages: StoredMessage[]): boolean {
    return messages.some((m) => m.role === 'user' && m.seq > p.afterSeq);
}
