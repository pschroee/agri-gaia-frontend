// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The assistant message that is being streamed right now, assembled from pi's message_update events
// (assistantMessageEvent: text_* / thinking_* / toolcall_*, block via contentIndex; agent gateway API.md,
// "Assembling the stream"). The stored message replaces it after message_end. Thinking blocks get their
// start and end time here, the only place where they can be measured: pi stores no timing per block.

import type { PiEvent } from './types';

export type LiveBlock =
    | { type: 'text'; text: string }
    | { type: 'thinking'; thinking: string; startedAt: number; endedAt?: number }
    | { type: 'toolCall'; id: string; name: string; arguments?: unknown };

export type LiveMessage = {
    /** pi's timestamp of the message (message_start), the same as in the stored message. */
    timestamp?: number;
    blocks: LiveBlock[];
    /** message_end has arrived; the stored message takes over with the next reload. */
    ended: boolean;
};

/** Measured span of a thinking block. */
export type ThinkingTime = { startedAt: number; endedAt?: number };

export type LiveState = {
    message?: LiveMessage;
    /** Measured thinking blocks of this view, by thinkingKey; outlive the live message. */
    times: Record<string, ThinkingTime>;
};

export const emptyLive: LiveState = { times: {} };

/** Key of a thinking block: pi's message timestamp and the block's index in the content. */
export function thinkingKey(timestamp: number, index: number): string {
    return `${timestamp}:${index}`;
}

/** Duration of a measured thinking block; undefined while it is still running or when it was not measured. */
export function thinkingDuration(t: ThinkingTime | undefined): number | undefined {
    if (!t || t.endedAt === undefined) return undefined;
    return Math.max(0, t.endedAt - t.startedAt);
}

/** Whether a thinking block has visible text (whitespace and invisible characters do not count). */
export function hasThinkingText(text: unknown): boolean {
    return typeof text === 'string' && text.replace(/[\s\u200b-\u200d\u2060\ufeff]/g, '') !== '';
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/** Index of the block an event goes to: contentIndex, otherwise the last block of the type or a new one. */
function blockIndex(blocks: LiveBlock[], ev: Obj, type: LiveBlock['type']): number {
    if (typeof ev.contentIndex === 'number' && ev.contentIndex >= 0) return ev.contentIndex;
    const last = blocks.length - 1;
    return last >= 0 && blocks[last].type === type ? last : blocks.length;
}

/** Ends every open thinking block (before idx, or all), e.g. when a later block starts or the message ends. */
function closeThinking(blocks: LiveBlock[], now: number, before = Infinity): LiveBlock[] {
    let changed = false;
    const next = blocks.map((b, i) => {
        if (i >= before || b.type !== 'thinking' || b.endedAt !== undefined) return b;
        changed = true;
        return { ...b, endedAt: now };
    });
    return changed ? next : blocks;
}

function withBlock(blocks: LiveBlock[], idx: number, fn: (b: LiveBlock | undefined) => LiveBlock): LiveBlock[] {
    const next = blocks.slice();
    // gaps (missed *_start events) are filled with empty text, which is not shown
    while (next.length < idx) next.push({ type: 'text', text: '' });
    next[idx] = fn(next[idx]);
    return next;
}

function applyAssistantEvent(blocks: LiveBlock[], ev: Obj, now: number): LiveBlock[] {
    const t = str(ev.type);
    switch (t) {
        case 'thinking_start':
        case 'thinking_delta':
        case 'thinking_end': {
            const idx = blockIndex(blocks, ev, 'thinking');
            const next = withBlock(closeThinking(blocks, now, idx), idx, (b) => {
                const prev = b?.type === 'thinking' ? b : { type: 'thinking' as const, thinking: '', startedAt: now };
                if (t === 'thinking_end') {
                    const content = str(ev.content);
                    return { ...prev, thinking: content ?? prev.thinking, endedAt: prev.endedAt ?? now };
                }
                return { ...prev, thinking: prev.thinking + (str(ev.delta) ?? '') };
            });
            return next;
        }
        case 'text_start':
        case 'text_delta':
        case 'text_end': {
            const idx = blockIndex(blocks, ev, 'text');
            return withBlock(closeThinking(blocks, now, idx), idx, (b) => {
                const prev = b?.type === 'text' ? b.text : '';
                if (t === 'text_end') return { type: 'text', text: str(ev.content) ?? prev };
                return { type: 'text', text: prev + (str(ev.delta) ?? '') };
            });
        }
        case 'toolcall_start':
        case 'toolcall_delta':
        case 'toolcall_end': {
            const idx = blockIndex(blocks, ev, 'toolCall');
            const tc = isObj(ev.toolCall) ? ev.toolCall : undefined;
            const partial = isObj(ev.partial) && Array.isArray(ev.partial.content) ? ev.partial.content : undefined;
            const pb = partial && isObj(partial[idx]) ? (partial[idx] as Obj) : undefined;
            return withBlock(closeThinking(blocks, now, idx), idx, (b) => {
                const prev = b?.type === 'toolCall' ? b : { type: 'toolCall' as const, id: '', name: '' };
                return {
                    type: 'toolCall',
                    id: str(tc?.id) ?? str(ev.id) ?? (prev.id || str(pb?.id) || ''),
                    name: str(tc?.name) ?? str(ev.toolName) ?? (prev.name || str(pb?.name) || ''),
                    arguments: tc?.arguments ?? prev.arguments,
                };
            });
        }
        default:
            return blocks;
    }
}

/** Copies the spans of the message's thinking blocks into times (only with a timestamp to key them by). */
function record(times: Record<string, ThinkingTime>, msg: LiveMessage): Record<string, ThinkingTime> {
    if (msg.timestamp === undefined) return times;
    let next = times;
    msg.blocks.forEach((b, i) => {
        if (b.type !== 'thinking') return;
        const k = thinkingKey(msg.timestamp as number, i);
        const cur = times[k];
        if (cur && cur.startedAt === b.startedAt && cur.endedAt === b.endedAt) return;
        if (next === times) next = { ...times };
        next[k] = { startedAt: b.startedAt, endedAt: b.endedAt };
    });
    return next;
}

export type LiveAction =
    | { type: 'pi'; event: PiEvent; now: number }
    | { type: 'clear'; onlyEnded?: boolean }
    | { type: 'reset' };

/** Reducer of the live message; `now` is the receipt time of the event (for the thinking durations). */
export function liveReducer(state: LiveState, action: LiveAction): LiveState {
    if (action.type === 'reset') return emptyLive;
    if (action.type === 'clear') {
        if (!state.message || (action.onlyEnded && !state.message.ended)) return state;
        return { ...state, message: undefined };
    }
    const ev = action.event as Obj;
    const now = action.now;
    const msg = isObj(ev.message) ? ev.message : undefined;
    switch (ev.type) {
        case 'message_start': {
            if (msg?.role !== 'assistant') return state;
            const ts = typeof msg.timestamp === 'number' ? msg.timestamp : undefined;
            return { ...state, message: { timestamp: ts, blocks: [], ended: false } };
        }
        case 'message_update': {
            const a = isObj(ev.assistantMessageEvent) ? ev.assistantMessageEvent : undefined;
            if (!a) return state;
            let cur: LiveMessage = state.message ?? { blocks: [], ended: false };
            if (cur.timestamp === undefined && isObj(a.partial) && typeof a.partial.timestamp === 'number') {
                cur = { ...cur, timestamp: a.partial.timestamp };
            }
            const blocks = applyAssistantEvent(cur.blocks, a, now);
            if (blocks === cur.blocks && cur === state.message) return state;
            const message = { ...cur, blocks };
            return { message, times: record(state.times, message) };
        }
        case 'message_end': {
            if (msg?.role !== 'assistant' || !state.message) return state;
            const message = { ...state.message, blocks: closeThinking(state.message.blocks, now), ended: true };
            if (message.timestamp === undefined && typeof msg.timestamp === 'number') message.timestamp = msg.timestamp;
            return { message, times: record(state.times, message) };
        }
        default:
            return state;
    }
}

/** Text of the live message (text blocks joined by blank lines). */
export function liveTextOf(msg: LiveMessage | undefined): string {
    if (!msg) return '';
    return msg.blocks
        .filter((b): b is Extract<LiveBlock, { type: 'text' }> => b.type === 'text' && !!b.text)
        .map((b) => b.text)
        .join('\n\n');
}
