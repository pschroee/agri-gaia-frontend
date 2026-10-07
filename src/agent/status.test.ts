// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import { AgentApiError } from './api';
import { variantLabel } from './format';
import {
    activeConnection,
    activityText,
    bindingsText,
    approvalSubject,
    formatAgo,
    gatewayCheck,
    modelRows,
    platformChecks,
    poolByVariant,
    poolTotals,
    shortImage,
    signedInAs,
    sortApprovals,
    subagentsAtOnce,
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

describe('connection fixed by the gateway (AGW_TOOLSETS)', () => {
    const cliApi: Variant = {
        id: 'cli,api',
        label: 'Command line + REST API',
        bindings: ['cli', 'api'],
        tools: ['bash', 'platform_http'],
        active: true,
    };

    it('takes the connection from the config, else from the active variant', () => {
        expect(activeConnection({ toolsets: cliApi }, variants)).toBe(cliApi);
        expect(activeConnection({}, [...variants, cliApi])?.id).toBe('cli,api');
        expect(activeConnection(undefined, variants)).toBeUndefined(); // older gateway: no fixed connection
    });

    it('names the bindings of a key', () => {
        expect(bindingsText('cli')).toBe('CLI');
        expect(bindingsText('cli,api')).toBe('CLI + REST API');
        expect(bindingsText('cli,mcp,api')).toBe('CLI + MCP + REST API');
        expect(bindingsText('both')).toBe('CLI + MCP');
    });

    it('labels combinations, keeping the gateway text for new ones', () => {
        expect(variantLabel({ id: 'cli,mcp', label: 'x' })).toBe('MCP and command line');
        expect(variantLabel({ id: 'both', label: 'x' })).toBe('MCP and command line');
        expect(variantLabel(cliApi)).toBe('Command line + REST API');
    });

    it('marks the pool of the configured connection; older ones only hold older chats', () => {
        const pool: Pool = {
            targets: { 'cli,api': 4 },
            toolsets: 'cli,api',
            slots: [slot('s1', 'cli,api', 'idle'), slot('s2', 'both', 'assigned', { chat_id: 'c1' })],
        };
        const list = poolByVariant(pool, [...variants, { ...cliApi }], [chat('c1', { variant: 'both' })]);
        expect(list.map((p) => [p.variant, p.active, p.target])).toEqual([
            ['cli,api', true, 4],
            ['both', false, 0],
        ]);
        expect(list[1].mine.map((m) => m.chatId)).toEqual(['c1']);
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

    it('lists name, provider, window and thinking levels, without prices or tariff', () => {
        const [a, b] = modelRows(models, [chat('c', { model: 'deepseek/flash', thinking_levels: ['off', 'high'] })]);
        expect(a).toEqual({
            id: 'deepseek/flash',
            name: 'DeepSeek Flash',
            provider: 'deepseek',
            isDefault: true,
            window: 128000,
            levels: ['off', 'high'],
        });
        expect(b).toEqual({
            id: 'local/x',
            name: 'local/x',
            provider: 'ollama',
            isDefault: false,
            window: undefined,
            levels: [],
        });
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

describe('subagentsAtOnce', () => {
    it('shows the fixed limit of the gateway', () => {
        expect(subagentsAtOnce({ max_subagents: 5 })).toBe('at most 5');
    });
    it('falls back to the default of an older gateway, or a dash', () => {
        expect(subagentsAtOnce({ max_subagents_default: 3 })).toBe('at most 3');
        expect(subagentsAtOnce({})).toBe('–');
    });
});
