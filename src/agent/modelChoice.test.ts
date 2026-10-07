// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import { AgentApiError } from './api';
import {
    allowedLevels,
    effortLabel,
    levelsByModel,
    modelName,
    pickerState,
    priceHint,
    switchFailure,
    tooLargeText,
} from './modelChoice';
import type { Chat } from './types';

type PickChat = Pick<Chat, 'model' | 'running' | 'resuming' | 'starting' | 'thinking_levels' | 'pending_model'>;
const chat = (extra: Partial<PickChat> = {}): PickChat => ({
    model: 'deepseek/deepseek-flash',
    running: false,
    thinking_levels: ['off', 'low', 'high'],
    ...extra,
});

describe('allowedLevels', () => {
    it('takes the open chat’s report for its own model', () => {
        expect(allowedLevels('deepseek/deepseek-flash', chat())).toEqual(['off', 'low', 'high']);
    });

    it('uses what other chats reported for another model', () => {
        const known = { 'openai/gpt': ['off', 'medium'] };
        expect(allowedLevels('openai/gpt', chat(), known)).toEqual(['off', 'medium']);
    });

    it('is empty while unknown, never pi’s full list', () => {
        expect(allowedLevels('x/unknown', chat())).toEqual([]);
        expect(allowedLevels('deepseek/deepseek-flash', chat({ thinking_levels: [] }))).toEqual([]);
    });
});

describe('levelsByModel', () => {
    it('collects the first non-empty report per model', () => {
        const got = levelsByModel([
            { model: 'a', thinking_levels: [] },
            { model: 'a', thinking_levels: ['off', 'high'] },
            { model: 'b' },
            { model: 'a', thinking_levels: ['off'] },
        ]);
        expect(got).toEqual({ a: ['off', 'high'] });
    });
});

describe('pickerState', () => {
    it('allows both pickers on an idle chat with levels', () => {
        const s = pickerState(chat());
        expect(s).toMatchObject({ modelDisabled: false, effortDisabled: false, levels: ['off', 'low', 'high'] });
        expect(s.modelHint).toBeUndefined();
    });

    it('locks both while a new chat waits for its sandbox', () => {
        const s = pickerState(chat({ resuming: true, starting: true }));
        expect(s.modelDisabled).toBe(true);
        expect(s.effortDisabled).toBe(true);
        expect(s.modelHint).toBe('Can be changed once the sandbox of the chat is ready.');
    });

    it('locks both while the agent works, with a tooltip', () => {
        const s = pickerState(chat({ running: true }));
        expect(s.modelDisabled).toBe(true);
        expect(s.effortDisabled).toBe(true);
        expect(s.modelHint).toMatch(/finished its response/);
        expect(s.effortHint).toMatch(/finished its response/);
    });

    it('locks both while a dormant chat resumes', () => {
        const s = pickerState(chat({ resuming: true }));
        expect(s.modelDisabled && s.effortDisabled).toBe(true);
        expect(s.modelHint).toMatch(/resumed/);
    });

    it('disables the level picker without levels or with only one', () => {
        expect(pickerState(chat({ thinking_levels: undefined }))).toMatchObject({
            modelDisabled: false,
            effortDisabled: true,
        });
        expect(pickerState(chat({ thinking_levels: undefined })).effortHint).toMatch(/known once/);
        expect(pickerState(chat({ thinking_levels: ['off'] })).effortHint).toMatch(/no thinking levels/);
    });

    it('keeps the model locked while a switch waits for the compaction', () => {
        const s = pickerState(chat({ pending_model: 'deepseek/deepseek-pro' }));
        expect(s.pending).toBe('deepseek/deepseek-pro');
        expect(s.modelDisabled).toBe(true);
        expect(s.modelHint).toMatch(/after the running compaction/);
        expect(s.effortDisabled).toBe(false);
    });

    it('locks everything while a request is in flight or without a chat', () => {
        expect(pickerState(chat(), true)).toMatchObject({ modelDisabled: true, effortDisabled: true });
        expect(pickerState(undefined)).toMatchObject({ modelDisabled: true, effortDisabled: true, levels: [] });
    });
});

describe('switchFailure', () => {
    it('recognises context_too_large with its details', () => {
        const e = new AgentApiError(409, 'too large', 'context_too_large', {
            model: 'x/small',
            tokens: 90000,
            window: 64000,
            limit: 48000,
        });
        expect(switchFailure(e)).toEqual({
            kind: 'too_large',
            details: { model: 'x/small', tokens: 90000, window: 64000, limit: 48000 },
        });
    });

    it('treats any other 409 as "agent working"', () => {
        expect(switchFailure(new AgentApiError(409, 'agent is working')).kind).toBe('running');
        // context_too_large without usable details cannot offer compacting
        expect(switchFailure(new AgentApiError(409, 'x', 'context_too_large')).kind).toBe('running');
    });

    it('passes other errors through', () => {
        expect(switchFailure(new AgentApiError(400, 'unknown level'))).toEqual({
            kind: 'error',
            message: 'unknown level',
        });
        expect(switchFailure('boom')).toEqual({ kind: 'error', message: 'boom' });
    });
});

describe('texts', () => {
    it('names the numbers in the compaction prompt', () => {
        const t = tooLargeText({ model: 'x', tokens: 90000, window: 64000, limit: 48000 }, 'Small');
        expect(t).toContain('90,000 tokens');
        expect(t).toContain('at most 48,000');
        expect(t).toContain('context window 64,000');
    });

    it('labels levels and models', () => {
        expect(effortLabel('xhigh')).toBe('Very high');
        expect(effortLabel('turbo')).toBe('turbo');
        expect(modelName([{ id: 'a/b', name: 'Bee' }], 'a/b')).toBe('Bee');
        expect(modelName([], 'a/b')).toBe('a/b');
    });

    it('shows prices and the tariff in effect', () => {
        const pricing = { input: 0.28, output: 0.42, cache_read: 0.028, cache_write: 0, currency: 'USD' as const };
        expect(priceHint({ pricing })).toBe('$0.28 in · $0.42 out per 1M tokens');
        const tariff = { peak_windows_utc: [], offpeak_factor: 0.5 };
        expect(priceHint({ pricing, tariff, peak_now: true })).toMatch(/peak tariff now$/);
        expect(priceHint({ pricing, tariff, peak_now: false })).toMatch(/off-peak now \(×0.5\)$/);
        expect(priceHint({ pricing: { ...pricing, input: 2, output: 8 } })).toBe('$2.00 in · $8.00 out per 1M tokens');
        expect(priceHint({})).toBeUndefined();
    });
});

