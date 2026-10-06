// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import { AgentApiError } from './api';
import {
    activityText,
    approvalSubject,
    formatAgo,
    formatPeakWindows,
    formatPrice,
    gatewayCheck,
    modelRows,
    platformChecks,
    poolByVariant,
    poolTotals,
    shortImage,
    signedInAs,
    sortApprovals,
} from './status';
import type { Approval, Chat, Model, PlatformStatus, Pool, Slot, Variant } from './types';

const slot = (id: string, variant: Slot['variant'], state: Slot['state'], extra: Partial<Slot> = {}): Slot => ({
    id,
    variant,
    state,
    image: 'agwpoc/agw-pi:dev',
    created_at: '2026-10-06T08:00:00Z',
    ...extra,
});

const chat = (id: string, extra: Partial<Chat> = {}): Chat =>
    ({ id, title: `Chat ${id}`, model: 'm1', variant: 'cli', state: 'active', ...extra } as Chat);

const variants: Variant[] = [
    { id: 'cli', label: 'gateway cli', tools: [] },
    { id: 'mcp', label: 'gateway mcp', tools: [] },
    { id: 'api', label: 'gateway api', tools: [] },
];

describe('poolByVariant', () => {
    const pool: Pool = {
        targets: { cli: 2, mcp: 1, both: 1 },
        slots: [
            slot('s1', 'cli', 'idle'),
            slot('s2', 'cli', 'assigned', { chat_id: 'c1', activity: { kind: 'tool', tool: 'bash', since: 'x' } }),
            slot('s3', 'cli', 'assigned'), // other user's chat: no id
            slot('s4', 'mcp', 'starting', { image: 'reg/agwpoc/agw-pi:v2' }),
            slot('s5', 'both', 'idle'),
        ],
    };

    it('counts free, busy and starting slots per variant in the order of the variant list', () => {
        const list = poolByVariant(pool, variants, [chat('c1')]);
        expect(list.map((p) => p.variant)).toEqual(['cli', 'mcp', 'both']); // api: no target, no slots
        const cli = list[0];
        expect([cli.target, cli.free, cli.busy, cli.starting, cli.others]).toEqual([2, 1, 2, 0, 1]);
        expect(cli.label).toBe('Command line (bash, artifacts, subagents)');
        expect(list[2].label).toBe('MCP and command line'); // not in the gateway's list, English label anyway
        expect(list[1].images).toEqual(['reg/agwpoc/agw-pi:v2']);
    });

    it("lists the user's chats with title from the chat list and the slot's activity", () => {
        const [cli] = poolByVariant(pool, variants, [chat('c1', { title: 'Train a model' })]);
        expect(cli.mine).toHaveLength(1);
        expect(cli.mine[0]).toMatchObject({ slotId: 's2', chatId: 'c1', title: 'Train a model' });
        expect(activityText(cli.mine[0].activity)).toBe('Running bash');
        const [noChat] = poolByVariant(
            { ...pool, slots: [slot('s9', 'cli', 'assigned', { chat_id: 'c7', chat_title: 'From pool' })] },
            variants,
            [],
        );
        expect(noChat.mine[0].title).toBe('From pool');
    });

    it('totals and empty input', () => {
        expect(poolTotals(poolByVariant(pool, variants, []))).toEqual({
            target: 4,
            free: 2,
            busy: 2,
            starting: 1,
            mine: 1,
        });
        expect(poolByVariant(undefined, variants, [])).toEqual([]);
        expect(poolByVariant({ targets: {}, slots: null as unknown as Slot[] }, variants, [])).toEqual([]);
    });
});

describe('activityText and shortImage', () => {
    it('names what the agent does', () => {
        expect(activityText(undefined)).toBe('Idle');
        expect(activityText({ kind: 'waiting_approval', since: '' })).toBe('Waiting for approval');
        expect(activityText({ kind: 'tool', since: '' })).toBe('Running a tool');
        expect(activityText({ kind: 'something_new', since: '' })).toBe('something_new');
    });
    it('shortens image references', () => {
        expect(shortImage('registry.example.org/agwpoc/agw-pi:dev')).toBe('agw-pi:dev');
        expect(shortImage('agw-pi')).toBe('agw-pi');
    });
});

describe('modelRows', () => {
    const tariff = { peak_windows_utc: [{ days: 'daily', from: '00:30', to: '16:30' }], offpeak_factor: 0.5 };
    const models: Model[] = [
        {
            id: 'deepseek/flash',
            provider: 'deepseek',
            model: 'flash',
            name: 'DeepSeek Flash',
            default: true,
            pricing: { input: 0.28, output: 0.42, cache_read: 0.028, cache_write: 0, currency: 'USD' },
            tariff,
            peak_now: false,
            context_window: 128000,
        },
        { id: 'local/x', provider: 'ollama', model: 'x', name: '', default: false, context_window: 0 },
    ];

    it('applies the off-peak factor to the prices now', () => {
        const [a, b] = modelRows(
            models,
            [chat('c', { model: 'deepseek/flash', thinking_levels: ['off', 'high'] })],
            'UTC',
        );
        expect(a).toMatchObject({ name: 'DeepSeek Flash', isDefault: true, window: 128000, tariff: 'off-peak' });
        expect([a.input, a.output, a.cacheRead]).toEqual([0.14, 0.21, 0.014]);
        expect(a.levels).toEqual(['off', 'high']);
        expect(a.peakHours).toBe('daily 00:30–16:30');
        expect(b).toMatchObject({
            name: 'local/x',
            window: undefined,
            input: undefined,
            tariff: undefined,
            levels: [],
        });
    });

    it('keeps the peak price during peak hours', () => {
        const [a] = modelRows([{ ...models[0], peak_now: true }], [], 'UTC');
        expect([a.tariff, a.input]).toEqual(['peak', 0.28]);
    });

    it('formats prices', () => {
        expect(formatPrice(undefined)).toBe('–');
        expect(formatPrice(0.014)).toBe('$0.014');
        expect(formatPrice(2.5)).toBe('$2.50');
        expect(formatPrice(1.095)).toBe('$1.095');
        expect(formatPrice(0.1400001)).toBe('$0.14');
    });
});

describe('formatPeakWindows', () => {
    it('shows UTC windows in local time, shifting weekdays across midnight', () => {
        const summer = new Date('2026-07-01T12:00:00Z');
        expect(formatPeakWindows([{ days: 'mon-fri', from: '01:00', to: '04:00' }], 'Europe/Berlin', summer)).toBe(
            'Mon–Fri 03:00–06:00',
        );
        expect(formatPeakWindows([{ days: 'mon-fri', from: '23:00', to: '23:30' }], 'Europe/Berlin', summer)).toBe(
            'Tue–Sat 01:00–01:30',
        );
        expect(
            formatPeakWindows(
                [
                    { days: 'daily', from: '01:00', to: '02:00' },
                    { days: 'daily', from: '06:00', to: '07:00' },
                ],
                'UTC',
                summer,
            ),
        ).toBe('daily 01:00–02:00 and 06:00–07:00');
    });
});

describe('approvals', () => {
    const ap = (
        id: string,
        kind: Approval['kind'],
        name: string,
        created: string,
        state: Approval['state'] = 'pending',
    ) =>
        ({
            id,
            chat_id: 'c1',
            kind,
            via: 'cli',
            name,
            size: 0,
            sha256: '',
            content_type: '',
            state,
            created_at: created,
        } as Approval);

    it('names the subject and hides the missing reason', () => {
        expect(approvalSubject(ap('a', 'platform_write', 'POST /datasets', 'x'))).toBe('POST /datasets');
        expect(approvalSubject(ap('a', 'internet_access', '(no reason given)', 'x'))).toBe('No reason given');
        expect(approvalSubject(ap('a', 'internet_access', 'pip install torch', 'x'))).toBe('pip install torch');
    });

    it('sorts the pending ones oldest first', () => {
        const list = [
            ap('b', 'artifact_upload', 'r.csv', '2026-10-06T10:05:00Z'),
            ap('a', 'platform_write', 'POST /x', '2026-10-06T10:00:00Z'),
            ap('c', 'platform_write', 'POST /y', '2026-10-06T09:00:00Z', 'approved'),
        ];
        expect(sortApprovals(list).map((a) => a.id)).toEqual(['a', 'b']);
    });
});

describe('reachability', () => {
    const now = Date.parse('2026-10-06T10:00:00Z');
    const me = { mode: 'oidc' as const, sub: 'u1', username: 'agent-test', name: 'Agent Test' };

    it('formats relative times', () => {
        expect(formatAgo('2026-10-06T09:59:40Z', now)).toBe('just now');
        expect(formatAgo('2026-10-06T09:56:00Z', now)).toBe('4 min ago');
        expect(formatAgo('2026-10-06T07:00:00Z', now)).toBe('3 h ago');
        expect(formatAgo('2026-10-01T10:00:00Z', now)).toBe('5 d ago');
    });

    it('names the signed-in user', () => {
        expect(signedInAs(me)).toBe('Agent Test (agent-test)');
        expect(signedInAs({ mode: 'oidc', username: 'x', name: 'x' })).toBe('x');
        expect(signedInAs({ mode: 'token' })).toBe('API token (no platform user)');
    });

    it('gateway: reachable with round trip, or the error', () => {
        expect(gatewayCheck({ ms: 42 }, me)).toMatchObject({
            tone: 'ok',
            text: 'Reachable · 42 ms · signed in as Agent Test (agent-test)',
        });
        expect(gatewayCheck({ error: new Error('Failed to fetch') }, me)).toMatchObject({
            tone: 'bad',
            text: 'Unreachable: Failed to fetch',
        });
    });

    const base: PlatformStatus = {
        configured: true,
        api_url: 'https://api.example.org',
        login: 'user',
        client_id: 'agw-agent',
        token_exchange: true,
        probe: { reachable: true, http_status: 404, latency_ms: 35, checked_at: '2026-10-06T10:00:00Z' },
    };

    it('platform: reachable, login as the owner, last exchange ok', () => {
        const checks = platformChecks(
            { ...base, last_exchange: { chat_id: 'c1', at: '2026-10-06T09:58:00Z', ok: true } },
            undefined,
            me,
            now,
        );
        expect(checks.map((c) => [c.key, c.tone, c.text])).toEqual([
            ['platform', 'ok', 'Reachable · 35 ms'],
            ['login', 'ok', "As the chat's owner · Agent Test (agent-test)"],
            ['exchange', 'ok', 'Last ok · 2 min ago'],
        ]);
        expect(checks[0].detail).toBe('https://api.example.org · HTTP 404 without login');
    });

    it('platform: unreachable, failed exchange, no exchange yet, exchange off', () => {
        const down = platformChecks(
            {
                ...base,
                probe: { reachable: false, error: 'dial tcp: i/o timeout', latency_ms: 5000, checked_at: '' },
                last_exchange: { chat_id: 'c1', at: '2026-10-06T09:00:00Z', ok: false, error: "user's login expired" },
            },
            undefined,
            me,
            now,
        );
        expect(down[0]).toMatchObject({ tone: 'bad', text: 'Unreachable: dial tcp: i/o timeout' });
        expect(down[2]).toMatchObject({ tone: 'bad', text: 'Last failed · 1 h ago', detail: "user's login expired" });
        expect(platformChecks(base, undefined, me, now)[2]).toMatchObject({ tone: 'off', text: 'No exchange yet' });
        const account = platformChecks(
            { ...base, login: 'account', account: 'svc', token_exchange: false },
            undefined,
            me,
            now,
        );
        expect(account[1].text).toBe('Shared account "svc"');
        expect(account[2].tone).toBe('warn');
    });

    it('platform: binding off, old gateway, error, loading', () => {
        expect(platformChecks({ configured: false }, undefined, me)[0].tone).toBe('off');
        expect(platformChecks(undefined, new AgentApiError(404, 'unknown endpoint'), me)[0].text).toBe(
            'Not reported by this gateway version',
        );
        expect(platformChecks(undefined, new AgentApiError(502, 'Bad Gateway'), me)[0]).toMatchObject({
            tone: 'bad',
            text: 'Status unavailable: Bad Gateway',
        });
        expect(platformChecks(undefined, undefined, me)[0].text).toBe('Loading …');
    });
});
