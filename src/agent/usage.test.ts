// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import { buildTranscript } from './transcript';
import type { ContextUsage, StoredMessage } from './types';
import type { AnswerUsage } from './usage';
import {
    answerUsage,
    cacheHitRate,
    compactingAfter,
    compactionReason,
    contextLevel,
    describeContext,
    formatAnswerUsage,
    formatPercent,
    formatTokensShort,
} from './usage';

// window 128,000, reserve 16,384 → auto-compaction from 111,616 tokens (87.2 %)
const ctx = (tokens: number | null, extra: Partial<ContextUsage> = {}): ContextUsage => ({
    tokens,
    window: 128000,
    percent: tokens === null ? null : (tokens / 128000) * 100,
    threshold_tokens: 111616,
    reserve_tokens: 16384,
    keep_recent_tokens: 20000,
    updated_at: '2026-10-06T10:00:00Z',
    ...extra,
});

describe('formatPercent', () => {
    it('rounds and marks tiny shares', () => {
        expect(formatPercent(42.4)).toBe('42 %');
        expect(formatPercent(0.3)).toBe('< 1 %');
        expect(formatPercent(0)).toBe('0 %');
        expect(formatPercent(null)).toBe('–');
        expect(formatPercent(Number.NaN)).toBe('–');
    });
});

describe('contextLevel', () => {
    const w = 128000;
    const t = 111616;
    it('is normal well below the threshold', () => {
        expect(contextLevel(20000, w, t)).toBe('normal');
        // just outside the warn margin (15 % of the window before the threshold)
        expect(contextLevel(t - 0.15 * w - 1, w, t)).toBe('normal');
    });
    it('turns amber shortly before auto-compaction', () => {
        expect(contextLevel(t - 0.15 * w, w, t)).toBe('warn');
        expect(contextLevel(100000, w, t)).toBe('warn');
    });
    it('turns red right before and beyond the threshold', () => {
        expect(contextLevel(t - 0.05 * w, w, t)).toBe('danger');
        expect(contextLevel(t, w, t)).toBe('danger');
        expect(contextLevel(125000, w, t)).toBe('danger');
    });
    it('falls back to the window without a usable threshold', () => {
        expect(contextLevel(100000, w, 0)).toBe('normal');
        expect(contextLevel(110000, w, 0)).toBe('warn');
        expect(contextLevel(124000, w, 200000)).toBe('danger');
    });
    it('is normal when nothing is measured', () => {
        expect(contextLevel(null, w, t)).toBe('normal');
        expect(contextLevel(1000, 0, t)).toBe('normal');
    });
});

describe('describeContext', () => {
    it('describes a low usage', () => {
        const d = describeContext(ctx(12800));
        expect(d).toMatchObject({
            measured: true,
            percent: '10 %',
            level: 'normal',
            used: '12,800 / 128,000 tokens',
            window: '128,000 tokens',
            threshold: '111,616 tokens',
            reserve: '16,384 tokens',
            headroom: '98,816 tokens until auto-compaction',
        });
        expect(d.ratio).toBeCloseTo(0.1);
        expect(d.thresholdRatio).toBeCloseTo(0.872);
    });
    it('warns near compaction and says when it is due', () => {
        expect(describeContext(ctx(100000)).level).toBe('warn');
        const due = describeContext(ctx(115000));
        expect(due.level).toBe('danger');
        expect(due.headroom).toBe('auto-compaction is due with the next answer');
    });
    it('names the free rest when auto-compaction is off', () => {
        expect(describeContext(ctx(100000), false).headroom).toBe('28,000 tokens free, auto-compaction off');
    });
    it('caps the ring at a full circle', () => {
        expect(describeContext(ctx(140000)).ratio).toBe(1);
    });
    it('is unmeasured right after a compaction', () => {
        const d = describeContext(ctx(null));
        expect(d).toMatchObject({ measured: false, percent: '–', ratio: 0, level: 'normal', headroom: '' });
        expect(d.used).toBe('measured again after the next answer');
    });
    it('derives the percentage when pi gives tokens only', () => {
        expect(describeContext(ctx(64000, { percent: null })).percent).toBe('50 %');
    });
});

describe('formatTokensShort', () => {
    it('shortens token counts', () => {
        expect(formatTokensShort(950)).toBe('950');
        expect(formatTokensShort(12345)).toBe('12.3k');
        expect(formatTokensShort(128000)).toBe('128k');
        expect(formatTokensShort(1_250_000)).toBe('1.3M');
        expect(formatTokensShort(undefined)).toBe('0');
    });
});

const assistant = (seq: number, extra: Partial<StoredMessage> = {}, usage = { input: 1000, output: 200 }) =>
    ({
        seq,
        role: 'assistant',
        created_at: '2026-10-06T10:00:00Z',
        message: { role: 'assistant', content: [{ type: 'text', text: `answer ${seq}` }], usage },
        ...extra,
    }) as StoredMessage;
const user = (seq: number, text: string): StoredMessage => ({
    seq,
    role: 'user',
    created_at: '2026-10-06T10:00:00Z',
    message: { role: 'user', content: [{ type: 'text', text }] },
});

describe('answerUsage', () => {
    it('sums the tokens over the model calls of an answer and leaves the cost out', () => {
        const u = answerUsage([
            assistant(2, { cost: 0.0011, peak: false }, { input: 1000, output: 200, cacheRead: 4000 } as never),
            assistant(4, { cost: 0.0004, peak: false }),
        ]);
        expect(u).toEqual({ input: 2000, output: 400, cacheRead: 4000, calls: 2 });
        expect(formatAnswerUsage(u as AnswerUsage)).toBe('2,000 in · 400 out · 4,000 cache');
    });
    it("ignores pi's flat price", () => {
        const u = answerUsage([assistant(2, {}, { input: 10, output: 5, cost: { total: 0.002 } } as never)]);
        expect(u).toEqual({ input: 10, output: 5, cacheRead: 0, calls: 1 });
        expect(formatAnswerUsage(u as AnswerUsage)).toBe('10 in · 5 out');
    });
    it('is undefined without assistant messages', () => {
        expect(answerUsage([user(1, 'hi')])).toBeUndefined();
    });
});

describe('buildTranscript with usage and compactions', () => {
    const empty = { approvals: [], socketCalls: [], executions: [], running: false };
    it('attaches the usage per answer and shows stored compactions', () => {
        const items = buildTranscript(
            [
                user(1, 'first'),
                assistant(2, { cost: 0.001, peak: true }),
                assistant(3, { cost: 0.002, peak: true }),
                {
                    seq: 4,
                    role: 'compaction',
                    created_at: '2026-10-06T10:00:00Z',
                    cost: 0.0005,
                    message: { role: 'compaction', reason: 'threshold', tokensBefore: 110000, estimatedTokensAfter: 9000 },
                },
                user(5, 'second'),
                assistant(6, { cost: 0.0001, peak: false }),
            ],
            empty,
        );
        expect(items.map((i) => i.kind)).toEqual(['user', 'agent', 'compaction', 'user', 'agent']);
        const first = items[1] as Extract<(typeof items)[number], { kind: 'agent' }>;
        expect(first.usage).toEqual({ input: 2000, output: 400, cacheRead: 0, calls: 2 });
        expect(items[2]).toEqual({
            kind: 'compaction',
            key: 'c4',
            seq: 4,
            reason: 'threshold',
            tokensBefore: 110000,
            tokensAfter: 9000,
        });
        expect((items[4] as typeof first).usage?.calls).toBe(1);
    });
    it('starts a new answer block after a compaction inside a turn', () => {
        const items = buildTranscript(
            [
                user(1, 'go'),
                assistant(2),
                { seq: 3, role: 'compaction', created_at: '', message: { role: 'compaction', reason: 'overflow' } },
                assistant(4),
            ],
            empty,
        );
        expect(items.map((i) => i.kind)).toEqual(['user', 'agent', 'compaction', 'agent']);
    });
});

describe('compactingAfter', () => {
    it('opens on compaction_start and closes on compaction_end or a new turn', () => {
        const c = compactingAfter(undefined, { type: 'compaction_start', reason: 'threshold' }, 1000);
        expect(c).toEqual({ reason: 'threshold', since: 1000 });
        expect(compactingAfter(c, { type: 'message_update' }, 2000)).toBe(c);
        expect(compactingAfter(c, { type: 'compaction_end', reason: 'threshold' }, 3000)).toBeUndefined();
        expect(compactingAfter(c, { type: 'agent_start' }, 3000)).toBeUndefined();
        expect(compactingAfter(undefined, { type: 'compaction_start' }, 1)?.reason).toBe('manual');
    });
    it('labels the reasons', () => {
        expect(compactionReason('threshold')).toBe('context near its limit');
        expect(compactionReason('overflow')).toBe('context overflowed');
        expect(compactionReason('other')).toBe('other');
        expect(compactionReason(undefined)).toBe('');
    });
});

describe('cacheHitRate', () => {
    it('computes the cache share', () => {
        expect(cacheHitRate(1000, 3000)).toBe(0.75);
        expect(cacheHitRate(0, 0)).toBeUndefined();
    });
});
