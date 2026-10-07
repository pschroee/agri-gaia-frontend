// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Run state of a chat for the status line, the chat list and the panel header, plus the texts of the run control
// (stop). Pure functions, unit-tested. The gateway's idle state (`dormant`: session saved, sandbox released after
// AGW_IDLE_TIMEOUT) is never shown (issue #31): such a chat counts as idle, and opening it resumes it at once. Idle
// itself is not shown either (issue #35): a state appears only while something happens (`runStateText`).

import type { Chat, StoredMessage } from './types';
import type { PageContext } from './pageContext';

/**
 * - `working`: pi works on a turn
 * - `waiting`: the turn is blocked on an approval of the user
 * - `starting`: a new chat waits for its first sandbox (the pool had no free slot)
 * - `resuming`: the chat is being loaded into a fresh sandbox (on opening it, or by a message)
 * - `idle`: nothing running; the gateway's `dormant` counts as idle too, it is not shown
 */
export type RunState = 'working' | 'waiting' | 'starting' | 'resuming' | 'idle';

type RunChat = Pick<Chat, 'state' | 'running' | 'resuming' | 'starting' | 'pending_approvals'>;

/**
 * Derives the run state. `pendingApprovals` is the live count of the open view (approvals arrive over SSE before
 * the chat event); without it the chat's own counter applies. `resumeRunning`: SSE resume steps are coming in.
 */
export function runStateOf(
    chat: RunChat | undefined,
    opts: { pendingApprovals?: number; resumeRunning?: boolean } = {},
): RunState | undefined {
    if (!chat) return undefined;
    if (chat.starting) return 'starting';
    if (chat.resuming || opts.resumeRunning) return 'resuming';
    const pending = opts.pendingApprovals ?? chat.pending_approvals ?? 0;
    if (chat.running) return pending > 0 ? 'waiting' : 'working';
    // an open approval also keeps a chat that is not marked running from idling
    if (pending > 0 && chat.state === 'active') return 'waiting';
    return 'idle';
}

/**
 * Where a state can show: `header` is the chip in the panel header and the chat header of /ai-agent, `list` the
 * history list and the panel's chat selector. Since issue #54 the input field shows no state (decision: the state
 * stays in the header); Stop in the field still says that a turn runs.
 */
export type StatePlace = 'header' | 'list';

/** Loading the chat into a sandbox, for a dormant chat (resuming) or a new one without a warm slot (starting). */
export const isLoading = (s: RunState | undefined) => s === 'starting' || s === 'resuming';

/** Does the state count as a running turn (timer, stop button)? */
export const isRunning = (s: RunState | undefined) => s === 'working' || s === 'waiting';

const TEXT: Record<StatePlace, Partial<Record<RunState, string>>> = {
    header: { working: 'working', waiting: 'needs approval', starting: 'loading', resuming: 'loading' },
    list: { working: 'working', waiting: 'waiting for approval', starting: 'loading', resuming: 'loading' },
};

/**
 * Label of a state at a place, or nothing when the place shows no state (issue #35). A state shows only while
 * something happens: a ready chat (the gateway's `active` or `dormant`, nothing running) shows nowhere, there is no
 * "active" or "Idle". Loading shows as "loading" in header and lists, its steps in the transcript; working and
 * waiting show everywhere. Errors are not a run state: a failed resume stays in its block in the transcript, a failed
 * stop below the input field (`ChatInput`, only until the state changes or the user dismisses it).
 */
export function runStateText(state: RunState | undefined, place: StatePlace): string | undefined {
    return state ? TEXT[place][state] : undefined;
}

/** A button at the end of the input field. `queue`: send while the agent works, the gateway queues the message. */
export type InputButton = 'send' | 'queue' | 'stop';

export type InputControls = {
    /** Buttons at the end of the field, left to right; the last one is the primary action (Enter does the same). */
    buttons: InputButton[];
    /** What the primary action and Enter do with text in the field. */
    enter: 'send' | 'queue';
};

/**
 * Buttons of the input field (issue #39). Stop lives in the field again, there is no status bar above it:
 * - nothing running: the send arrow;
 * - a turn runs (working or waiting for approval) and the field is empty: the send arrow becomes Stop;
 * - a turn runs and there is text: Stop moves left and the queue arrow takes the last place, Enter queues.
 * The last place is always what fits the field's content, so a click there after typing never stops the agent by
 * mistake (stopping cancels the turn; a queued message can be removed again). `queued`: the gateway queues a message
 * sent now (the chat runs); without it, a running state counts.
 */
export function inputControls(state: RunState | undefined, hasText: boolean, queued = isRunning(state)): InputControls {
    const enter = queued ? 'queue' : 'send';
    if (!isRunning(state)) return { buttons: [enter], enter };
    return { buttons: hasText ? ['stop', enter] : ['stop'], enter };
}

export const RUN_STATE_HINT: Record<RunState, string> = {
    working: 'The agent works on your request. Messages you send now are queued.',
    waiting: 'The agent waits for your decision on an approval.',
    starting: 'No sandbox was free; one is being started for this chat. You can type already: your message goes to the agent once the sandbox is ready.',
    resuming: 'The chat is being loaded into a sandbox. You can type already: your message goes to the agent once it is ready.',
    idle: 'Ready for your next message.',
};

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

/** A message sent outside the queue whose user message is not stored yet (shown greyed in the transcript). */
/** files: names of the attachments sent with it. */
export type PendingSend = { key: string; text: string; afterSeq: number; files?: string[]; context?: PageContext };

/** Has the pending message been stored (a user message after the send)? */
export function pendingSettled(p: PendingSend, messages: StoredMessage[]): boolean {
    return messages.some((m) => m.role === 'user' && m.seq > p.afterSeq);
}
