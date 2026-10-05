// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Queue of a chat: messages sent while the agent works. The gateway keeps them and delivers them together at
// the end of the run (API.md, "Queue"); the UI shows them above the input field until they are delivered.
// Pure state logic, used by useChatStream and QueueList.

import { noteLabel } from './transcript';
import type { Chat, HoldReason, QueueEntry, QueueEvent } from './types';

/** Sent while the agent works, the gateway's response is still pending (optimistic). */
export type LocalQueued = { key: string; text: string };

export type QueueState = {
    /** Open entries according to the gateway. */
    entries: QueueEntry[];
    /** Not yet confirmed by the gateway. */
    local: LocalQueued[];
    /** Entries whose removal is in flight. */
    removing: string[];
};

export const emptyQueue: QueueState = { entries: [], local: [], removing: [] };

export type QueueAction =
    | { type: 'reset' }
    /** Entries from GET /chats/{id} or GET /chats/{id}/queue. */
    | { type: 'loaded'; entries: QueueEntry[] }
    /** SSE event "queue". */
    | { type: 'event'; event: QueueEvent }
    | { type: 'local_add'; item: LocalQueued }
    | { type: 'local_drop'; key: string }
    | { type: 'remove_start'; id: string }
    /** ok: the gateway removed the entry; otherwise it stays (409: already delivered, the SSE event follows). */
    | { type: 'remove_done'; id: string; ok: boolean };

const entriesOf = (e: QueueEntry[] | undefined | null) => (Array.isArray(e) ? e : []);

export function queueReducer(state: QueueState, action: QueueAction): QueueState {
    switch (action.type) {
        case 'reset':
            return emptyQueue;
        case 'loaded':
        case 'event': {
            const entries = entriesOf(action.type === 'loaded' ? action.entries : action.event.entries);
            const open = new Set(entries.map((e) => e.id));
            return { ...state, entries, removing: state.removing.filter((id) => open.has(id)) };
        }
        case 'local_add':
            return { ...state, local: [...state.local, action.item] };
        case 'local_drop':
            return { ...state, local: state.local.filter((l) => l.key !== action.key) };
        case 'remove_start':
            return state.removing.includes(action.id) ? state : { ...state, removing: [...state.removing, action.id] };
        case 'remove_done':
            return {
                ...state,
                entries: action.ok ? state.entries.filter((e) => e.id !== action.id) : state.entries,
                removing: state.removing.filter((id) => id !== action.id),
            };
        default:
            return state;
    }
}

/**
 * State of a row: `sending` not yet confirmed, `removing` removal in flight, `held` waits for the next message
 * or "Send now", `waiting` goes to the agent at the end of the run.
 */
export type QueueRowState = 'sending' | 'removing' | 'held' | 'waiting';

export type QueueRow = {
    key: string;
    /** Gateway id; missing while sending (then it cannot be removed yet). */
    id?: string;
    text: string;
    /** Short line shown instead of the text (gateway notes). */
    label?: string;
    attachments: string[];
    system: boolean;
    state: QueueRowState;
};

/** Is the queue held right now? Only once the agent is idle; while it works the entries wait for the run's end. */
export function isHeld(chat: Pick<Chat, 'queue_held' | 'running'> | undefined): boolean {
    return !!chat?.queue_held && !chat.running;
}

/** Gateway entries in order, followed by the not yet confirmed ones. */
export function queueRows(state: QueueState, chat: Pick<Chat, 'queue_held' | 'running'> | undefined): QueueRow[] {
    const held = isHeld(chat);
    return [
        ...state.entries.map((e): QueueRow => {
            const system = e.kind === 'system';
            return {
                key: e.id,
                id: e.id,
                text: e.text,
                label: system
                    ? noteLabel({ kind: 'system', type: e.note, refs: e.refs }) ?? 'note from the gateway'
                    : undefined,
                attachments: Array.isArray(e.attachments) ? e.attachments : [],
                system,
                state: state.removing.includes(e.id) ? 'removing' : held ? 'held' : 'waiting',
            };
        }),
        ...state.local.map(
            (l): QueueRow => ({ key: l.key, text: l.text, attachments: [], system: false, state: 'sending' }),
        ),
    ];
}

/**
 * Will a new message probably be queued? Then it is shown in the queue right away instead of the history. The
 * gateway's response (`queued`) decides.
 */
export function expectQueued(chat: Pick<Chat, 'running' | 'resuming'> | undefined): boolean {
    return !!chat?.running || !!chat?.resuming;
}

/** Single-line preview of a queued text. */
export function queuePreview(text: string, max = 140): string {
    const one = text.split(/\s+/).filter(Boolean).join(' ');
    return one.length > max ? `${one.slice(0, max).trimEnd()} …` : one;
}

/** Why the queue is held, for the line above the entries. */
export function holdReasonText(reason: HoldReason | undefined): string | undefined {
    switch (reason) {
        case 'abort':
            return 'paused after the abort';
        case 'wake_limit':
            return 'limit of wake-ups per hour reached';
        case 'auto_turns':
            return 'limit of turns without you reached';
        default:
            return undefined;
    }
}

/** Status line of the queue header. */
export function queueStatusText(chat: Pick<Chat, 'queue_held' | 'running' | 'hold_reason'> | undefined): string {
    if (isHeld(chat)) {
        const why = holdReasonText(chat?.hold_reason);
        return `${why ? `${why}, ` : ''}goes along with your next message`;
    }
    return 'goes to the agent when the current run ends';
}

/** Message for a failed removal. */
export function removeErrorText(status: number | undefined, message: string): string {
    if (status === 409) return 'Already handed to the agent.';
    if (status === 404) return 'This entry no longer exists.';
    return `Removing failed: ${message}`;
}
