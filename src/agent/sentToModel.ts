// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// "Sent to model" in the expanded activity row (gateway issue #69): which model call asked for a platform call, and
// what the chat sent to the model in total. Pure functions over the gateway's model calls; the view loads them lazily.

import type { LLMCall } from './types';
import { formatBytes } from './files';
import { formatTokens } from './usage';

/** What the view holds per chat: the loaded model calls, or the state of the load. */
export type LlmLoad = LLMCall[] | 'loading' | 'error';

/** A chat is loaded when nothing is there yet, or the last load failed. */
export function needsLlmLoad(e: LlmLoad | undefined): boolean {
    return e === undefined || e === 'error';
}

/** The model call that asked for one platform call. */
export type SentCall = { model: string; tokensIn: number; cached: number; tokensOut: number; requestBytes?: number };

/** Totals over all model calls of a chat. `measured` counts the calls with a recorded request size. */
export type SentTotals = { calls: number; tokensIn: number; tokensOut: number; requestBytes: number; measured: number };

/**
 * Finds the model call whose tool calls contain `toolCallId` (the platform call's tool_call_id), and sums up the
 * chat. Tokens in are input plus cache reads, as the provider counts them.
 */
export function sentToModel(calls: LLMCall[], toolCallId?: string): { call?: SentCall; chat: SentTotals } {
    const chat: SentTotals = { calls: 0, tokensIn: 0, tokensOut: 0, requestBytes: 0, measured: 0 };
    let call: SentCall | undefined;
    for (const c of calls) {
        const tokensIn = c.input + c.cache_read;
        chat.calls += 1;
        chat.tokensIn += tokensIn;
        chat.tokensOut += c.output;
        if (typeof c.request_bytes === 'number') {
            chat.requestBytes += c.request_bytes;
            chat.measured += 1;
        }
        if (!call && toolCallId && (c.tool_calls ?? []).some((t) => t.id === toolCallId)) {
            call = {
                model: c.model,
                tokensIn,
                cached: c.cache_read,
                tokensOut: c.output,
                requestBytes: typeof c.request_bytes === 'number' ? c.request_bytes : undefined,
            };
        }
    }
    return { call, chat };
}

/** "<model> · <in> tokens in (<cache> from cache) · <out> out · request <size>" */
export function sentCallText(c: SentCall): string {
    const cache = c.cached > 0 ? ` (${formatTokens(c.cached)} from cache)` : '';
    const request = c.requestBytes !== undefined ? `request ${formatBytes(c.requestBytes)}` : 'request size not recorded';
    return `${c.model} · ${formatTokens(c.tokensIn)} tokens in${cache} · ${formatTokens(c.tokensOut)} out · ${request}`;
}

/** "<n> model call(s) · <in> tokens in · <out> out · <sum> sent (<k> of <n> measured)" */
export function sentChatText(t: SentTotals): string {
    const calls = `${t.calls} model call${t.calls === 1 ? '' : 's'}`;
    const sent =
        t.measured === 0
            ? 'request sizes not recorded'
            : `${formatBytes(t.requestBytes)} sent (${t.measured} of ${t.calls} measured)`;
    return `${calls} · ${formatTokens(t.tokensIn)} tokens in · ${formatTokens(t.tokensOut)} out · ${sent}`;
}
