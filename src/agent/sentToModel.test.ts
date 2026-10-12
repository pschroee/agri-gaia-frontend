// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import { needsLlmLoad, sentCallText, sentChatText, sentToModel } from './sentToModel';
import type { LLMCall } from './types';

const base = (over: Partial<LLMCall>): LLMCall => ({
    id: 1,
    model: 'deepseek/deepseek-flash',
    response_id: 'r',
    input: 1000,
    output: 20,
    cache_read: 500,
    cost: 0,
    peak: false,
    tool_calls: [{ id: 'call_a', name: 'agw-platform', arguments: '{}' }],
    started_at: '2026-10-12T10:00:00Z',
    duration_ms: 900,
    main: true,
    ...over,
});

describe('sentToModel', () => {
    it('finds the call by tool_calls[].id and sums tokens in as input plus cache reads', () => {
        const calls = [base({ request_bytes: 2048 })];
        const { call } = sentToModel(calls, 'call_a');
        expect(call).toEqual({ model: 'deepseek/deepseek-flash', tokensIn: 1500, cached: 500, tokensOut: 20, requestBytes: 2048 });
    });

    it('finds no call without a match or without a tool call id', () => {
        const calls = [base({ request_bytes: 2048 })];
        expect(sentToModel(calls, 'call_zzz').call).toBeUndefined();
        expect(sentToModel(calls, '').call).toBeUndefined();
        expect(sentToModel(calls).call).toBeUndefined();
    });

    it('sums the chat and counts only the measured calls', () => {
        const calls = [base({ request_bytes: 2048 }), base({ id: 2, input: 200, cache_read: 0, output: 10, tool_calls: null })];
        const { chat } = sentToModel(calls, 'call_a');
        expect(chat).toEqual({ calls: 2, tokensIn: 1700, tokensOut: 30, requestBytes: 2048, measured: 1 });
    });
});

describe('sent texts', () => {
    it('writes the call with cache and size', () => {
        const text = sentCallText({ model: 'deepseek/deepseek-flash', tokensIn: 1500, cached: 500, tokensOut: 20, requestBytes: 2048 });
        expect(text).toBe('deepseek/deepseek-flash · 1,500 tokens in (500 from cache) · 20 out · request 2 KB');
    });

    it('writes the call without cache and without size', () => {
        const text = sentCallText({ model: 'm/m', tokensIn: 1000, cached: 0, tokensOut: 5 });
        expect(text).toBe('m/m · 1,000 tokens in · 5 out · request size not recorded');
    });

    it('writes the chat totals, in the singular for one call', () => {
        expect(sentChatText({ calls: 2, tokensIn: 1600, tokensOut: 30, requestBytes: 6144, measured: 2 })).toBe(
            '2 model calls · 1,600 tokens in · 30 out · 6 KB sent (2 of 2 measured)',
        );
        expect(sentChatText({ calls: 1, tokensIn: 1000, tokensOut: 5, requestBytes: 0, measured: 0 })).toBe(
            '1 model call · 1,000 tokens in · 5 out · request sizes not recorded',
        );
    });
});

describe('needsLlmLoad', () => {
    it('loads a chat that is not there or whose load failed', () => {
        expect(needsLlmLoad(undefined)).toBe(true);
        expect(needsLlmLoad('error')).toBe(true);
        expect(needsLlmLoad('loading')).toBe(false);
        expect(needsLlmLoad([])).toBe(false);
    });
});
