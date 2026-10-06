// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Queue of a chat: messages sent while the agent works. The gateway keeps them and hands them to pi (steered in
// during a run, or at its end; API.md, "Queue"). pi reads a steered message only after its current step, and the
// user message is stored only then. The UI therefore keeps delivered entries visible above the input field
// ("waiting for the agent") until the matching user message shows in the transcript. After a page reload the gateway
// lists them in `queue_delivered` of GET /chats/{id}, and they show the same way.
// Pure state logic, used by useChatStream and QueueList.

import { noteLabel, textOf } from './transcript';
import type { Chat, HoldReason, QueueDelivery, QueueEntry, QueueEvent, StoredMessage } from './types';

/** Sent while the agent works, the gateway's response is still pending (optimistic). */
export type LocalQueued = { key: string; text: string; attachments?: string[] };

export type QueueState = {
    /** Open entries according to the gateway. */
    entries: QueueEntry[];
    /** Not yet confirmed by the gateway. */
    local: LocalQueued[];
    /** Entries whose removal is in flight. */
    removing: string[];
    /** Handed to pi (SSE "delivered"), but the user message is not in the transcript yet. */
    delivered: Delivered[];
};

/** One delivery: the entries handed to pi together as one user message. */
export type Delivered = {
    /** Queue ids delivered together. */
    ids: string[];
    /** The entries as they were queued (missing when the UI did not know them, then `text` is shown). */
    entries: QueueEntry[];
    /** The instruction as it went to pi. */
    text: string;
    /** Highest stored message seq at the time of delivery; only later user messages can be this one. */
    afterSeq: number;
};

export const emptyQueue: QueueState = { entries: [], local: [], removing: [], delivered: [] };

export type QueueAction =
    | { type: 'reset' }
    /** Entries from GET /chats/{id} or GET /chats/{id}/queue. */
    | { type: 'loaded'; entries: QueueEntry[] }
    /**
     * `queue_delivered` of GET /chats/{id}: deliveries pi has not read yet (after a page reload the SSE event
     * "delivered" is gone); lastSeq: highest seq of the stored messages loaded with them.
     */
    | { type: 'delivered_loaded'; deliveries: QueueDelivery[]; lastSeq: number }
    /** SSE event "queue"; lastSeq: highest stored message seq known when the event arrived. */
    | { type: 'event'; event: QueueEvent; lastSeq: number }
    /** Stored messages (after a reload): delivered entries whose user message is there are done. */
    | { type: 'messages'; messages: StoredMessage[] }
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
            const next = { ...state, entries, removing: state.removing.filter((id) => open.has(id)) };
            return action.type === 'event' ? applyChange(next, state.entries, action.event, action.lastSeq) : next;
        }
        case 'delivered_loaded':
            return addLoadedDeliveries(state, action.deliveries, action.lastSeq);
        case 'messages':
            return settleDelivered(state, action.messages);
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

function applyChange(state: QueueState, before: QueueEntry[], ev: QueueEvent, lastSeq: number): QueueState {
    const ids = Array.isArray(ev.ids) ? ev.ids : [];
    switch (ev.change) {
        case 'delivered': {
            if (ids.length === 0 || state.delivered.some((d) => d.ids.some((id) => ids.includes(id)))) return state;
            const delivered: Delivered = {
                ids,
                entries: before.filter((e) => ids.includes(e.id)),
                text: ev.text ?? '',
                afterSeq: lastSeq,
            };
            return { ...state, delivered: [...state.delivered, delivered] };
        }
        case 'restored':
            // not taken up by pi (abort, failed delivery): the entries are open again
            return { ...state, delivered: state.delivered.filter((d) => !d.ids.some((id) => ids.includes(id))) };
        case 'dropped':
            return { ...state, delivered: [] };
        default:
            return state;
    }
}

/**
 * Adds the gateway's deliveries that the UI does not show yet, in the same form as after the SSE event; deliveries
 * already known (live event before the response) stay as they are. The gateway lists them only until pi reports the
 * user message, so only later stored user messages can settle them.
 */
function addLoadedDeliveries(state: QueueState, deliveries: QueueDelivery[], lastSeq: number): QueueState {
    const known = new Set(state.delivered.flatMap((d) => d.ids));
    const added = (Array.isArray(deliveries) ? deliveries : [])
        .filter((d) => Array.isArray(d.ids) && d.ids.length > 0 && !d.ids.some((id) => known.has(id)))
        .map(
            (d): Delivered => ({
                ids: d.ids,
                entries: entriesOf(d.entries),
                text: d.text ?? '',
                afterSeq: lastSeq,
            }),
        );
    if (added.length === 0) return state;
    // an entry that is delivered is no longer open (in case the open list was older)
    const ids = new Set(added.flatMap((d) => d.ids));
    return {
        ...state,
        entries: state.entries.filter((e) => !ids.has(e.id)),
        delivered: [...state.delivered, ...added],
    };
}

const squash = (t: string) => t.split(/\s+/).filter(Boolean).join(' ');

/** Does the stored user message carry this delivery? It contains the queued texts (or the whole instruction). */
function carries(message: string, d: Delivered): boolean {
    const m = squash(message);
    const texts = d.entries.filter((e) => e.kind !== 'system' && e.text.trim()).map((e) => e.text);
    if (texts.length > 0) return texts.every((t) => m.includes(squash(t)));
    const whole = squash(d.text);
    return whole === '' || m.includes(whole) || whole.includes(m);
}

/** Removes deliveries whose user message has been stored (each user message settles at most one delivery). */
export function settleDelivered(state: QueueState, messages: StoredMessage[]): QueueState {
    if (state.delivered.length === 0) return state;
    const users = (Array.isArray(messages) ? messages : []).filter((m) => m.role === 'user');
    const used = new Set<number>();
    const delivered = state.delivered.filter((d) => {
        // the user message of a turn started from the queue carries trigger queue (wake: notes only); pi may
        // also change the text, so either sign settles the delivery
        const hit = users.find(
            (m) =>
                m.seq > d.afterSeq &&
                !used.has(m.seq) &&
                (m.trigger === 'queue' || m.trigger === 'wake' || carries(textOf(m.message?.content), d)),
        );
        if (!hit) return true;
        used.add(hit.seq);
        return false;
    });
    return delivered.length === state.delivered.length ? state : { ...state, delivered };
}

/** Highest seq of the stored messages (0 without any). */
export function lastSeq(messages: StoredMessage[]): number {
    return messages.reduce((max, m) => Math.max(max, m.seq), 0);
}

/**
 * State of a row: `sending` not yet confirmed, `removing` removal in flight, `held` waits for the next message
 * or "Send now", `waiting` goes to the agent after its current step, `delivered` handed to the agent, which
 * reads it after its current step (cannot be removed any more).
 */
export type QueueRowState = 'sending' | 'removing' | 'held' | 'waiting' | 'delivered';

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
    const row = (e: QueueEntry, rowState: QueueRowState): QueueRow => {
        const system = e.kind === 'system';
        return {
            key: e.id,
            id: rowState === 'delivered' ? undefined : e.id,
            text: e.text,
            label: system
                ? noteLabel(
                      { kind: 'system', type: e.note, refs: e.refs },
                      e.text.split('\n').find((l) => l.trim() && !l.startsWith('[')),
                  ) ?? 'note from the gateway'
                : undefined,
            attachments: Array.isArray(e.attachments) ? e.attachments : [],
            system,
            state: rowState,
        };
    };
    return [
        ...state.delivered.flatMap((d): QueueRow[] =>
            d.entries.length > 0
                ? d.entries.map((e) => row(e, 'delivered'))
                : [{ key: `delivered-${d.ids[0]}`, text: d.text, attachments: [], system: false, state: 'delivered' }],
        ),
        ...state.entries.map((e) => row(e, state.removing.includes(e.id) ? 'removing' : held ? 'held' : 'waiting')),
        ...state.local.map(
            (l): QueueRow => ({
                key: l.key,
                text: l.text,
                attachments: l.attachments ?? [],
                system: false,
                state: 'sending',
            }),
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

/** Status line of the queue header; onlyDelivered: every row has been handed to the agent already. */
export function queueStatusText(
    chat: Pick<Chat, 'queue_held' | 'running' | 'hold_reason'> | undefined,
    onlyDelivered = false,
): string {
    if (onlyDelivered) return 'waiting for the agent, will be read after the current step';
    if (isHeld(chat)) {
        const why = holdReasonText(chat?.hold_reason);
        return `${why ? `${why}, ` : ''}goes along with your next message`;
    }
    return 'goes to the agent after its current step';
}

/** Message for a failed removal. */
export function removeErrorText(status: number | undefined, message: string): string {
    if (status === 409) return 'Already handed to the agent.';
    if (status === 404) return 'This entry no longer exists.';
    return `Removing failed: ${message}`;
}
