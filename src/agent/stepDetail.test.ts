// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import {
    clipText,
    exitCodeOf,
    formatResponse,
    partialsReducer,
    platformCallsInCommand,
    platformStatus,
    prettyJson,
    shellWords,
    stepDetail,
} from './stepDetail';
import type { DetailBlock } from './stepDetail';
import type { Step } from './transcript';
import type { Approval, SocketCall, ToolExecution } from './types';

const step = (s: Partial<Step>): Step => ({ id: 'c1', tool: s.name ?? 'bash', status: 'done', ...s });

const exec = (extra: Partial<ToolExecution> = {}): ToolExecution => ({
    id: 1,
    chat_id: 'chat',
    session: 'main',
    tool_call_id: 'c1',
    tool: 'bash',
    op: 'bash',
    args: { command: 'x', cwd: '/workspace' },
    output_bytes: 9000,
    started_at: '2026-10-07T10:00:00Z',
    duration_ms: 1500,
    ...extra,
});

const sock = (detail: string, result: string, extra: Partial<SocketCall> = {}): SocketCall => ({
    id: 1,
    slot_id: 's',
    via: 'cli',
    op: 'platform',
    detail,
    result,
    created_at: '2026-10-07T10:00:01Z',
    tool_call_id: 'c1',
    ...extra,
});

const approval = (extra: Partial<Approval> = {}): Approval => ({
    id: 'ap1',
    chat_id: 'chat',
    kind: 'platform_write',
    via: 'cli',
    name: 'DELETE /datasets/5',
    size: 40,
    sha256: '',
    content_type: 'application/json',
    state: 'approved',
    created_at: '2026-10-07T10:00:00Z',
    decided_at: '2026-10-07T10:00:05Z',
    preview: 'DELETE /datasets/5\n{\n  "key": "k",\n  "csrftoken": "[redacted by the orchestrator]"\n}',
    tool_call_id: 'c1',
    ...extra,
});

const ofType = <T extends DetailBlock['type']>(blocks: DetailBlock[], type: T) =>
    blocks.filter((b): b is Extract<DetailBlock, { type: T }> => b.type === type);

describe('bash details', () => {
    const heredoc = "cd /workspace && python3 - <<'EOF'\nimport json\nprint(json.dumps({'a': 1}))\nEOF";

    it('shows the whole command, exit code, duration and the output of pi', () => {
        const d = stepDetail(
            step({
                name: 'bash',
                args: { command: heredoc, timeout: 60 },
                result: { text: '{"a": 1}\n', isError: false },
                executions: [exec({ exit_code: 0 })],
                durationMs: 1500,
            }),
        );
        expect(d.kind).toBe('bash');
        const code = ofType(d.blocks, 'code');
        expect(code[0]).toMatchObject({ label: 'Command', text: heredoc, copy: true });
        expect(code[1]).toMatchObject({ label: 'Output', text: '{"a": 1}\n', copy: true, error: false, clip: true });
        const fields = ofType(d.blocks, 'fields')[0].fields;
        expect(fields).toContainEqual({ label: 'Exit code', value: '0', mono: true, tone: 'ok' });
        expect(fields).toContainEqual({ label: 'Duration', value: '1.5 s' });
        expect(fields).toContainEqual({ label: 'Directory', value: '/workspace', mono: true });
        expect(fields).toContainEqual({ label: 'Timeout', value: '60 s' });
        expect(ofType(d.blocks, 'platform')).toHaveLength(0);
    });

    it('marks a failed command red with its exit code', () => {
        const d = stepDetail(
            step({
                name: 'bash',
                status: 'error',
                args: { command: 'false' },
                result: { text: 'boom\n\nCommand exited with code 2', isError: true },
            }),
        );
        expect(ofType(d.blocks, 'code')[1]).toMatchObject({ label: 'Error', error: true });
        expect(ofType(d.blocks, 'fields')[0].fields[0]).toEqual({
            label: 'Exit code',
            value: '2',
            mono: true,
            tone: 'error',
        });
    });

    it('falls back to the gateway excerpt with a note, and to the output so far while running', () => {
        const ex = stepDetail(
            step({
                name: 'bash',
                status: 'stopped',
                args: { command: 'yes' },
                executions: [exec({ exit_code: 143, output_excerpt: 'y\ny' })],
            }),
        );
        const out = ofType(ex.blocks, 'code')[1];
        expect(out).toMatchObject({ label: 'Output', text: 'y\ny', error: true });
        expect(out.note).toMatch(/Only the gateway's excerpt is available .* 8\.8 KB/);
        const live = stepDetail(step({ name: 'bash', status: 'running', args: { command: 'yes' }, partial: 'y\n' }));
        expect(ofType(live.blocks, 'code')[1]).toMatchObject({ label: 'Output so far', text: 'y\n' });
    });

    it('takes the exit code from the gateway first, else from the result text', () => {
        expect(exitCodeOf(step({ executions: [exec({ exit_code: 1 }), exec({ exit_code: 0 })] }))).toBe(0);
        expect(exitCodeOf(step({ result: { text: 'x\nCommand exited with code 3', isError: true } }))).toBe(3);
        expect(exitCodeOf(step({ result: { text: 'ok', isError: false } }))).toBeUndefined();
    });
});

describe('platform calls', () => {
    it('reads agw-platform requests out of a shell command', () => {
        const cmd =
            'cd /workspace && agw-platform request DELETE /datasets/5 --body \'{"key":"k"}\' | tail -n +2\n' +
            'agw-platform request GET /agrovoc/keywords --query keyword=pig && agw-platform datasets';
        expect(platformCallsInCommand(cmd)).toEqual([
            { method: 'DELETE', path: '/datasets/5', body: '{\n  "key": "k"\n}' },
            { method: 'GET', path: '/agrovoc/keywords', query: ['keyword=pig'] },
            {},
        ]);
        expect(platformCallsInCommand('agw-platform request POST /x --body=@body.json')).toEqual([
            { method: 'POST', path: '/x', body: '@body.json' },
        ]);
        // an unbalanced quote stops the reading instead of guessing
        expect(shellWords("echo 'open")).toEqual([{ w: 'echo' }]);
    });

    it('shows method, path, body from the approval, status and the approval for a bash DELETE', () => {
        const d = stepDetail(
            step({
                name: 'bash',
                args: { command: 'agw-platform request DELETE /datasets/5 --body \'{"key":"k","csrftoken":"t"}\'' },
                result: { text: 'HTTP 200\n{"ok":true}', isError: false },
                executions: [exec({ exit_code: 0 })],
                platformCalls: [sock('DELETE /datasets/5', 'ok 200', { duration_ms: 230 })],
                approvals: [approval()],
            }),
        );
        const [p] = ofType(d.blocks, 'platform');
        expect(p.title).toBe('Platform call');
        expect(p.request).toMatchObject({
            method: 'DELETE',
            path: '/datasets/5',
            status: '200 · ok',
            tone: 'ok',
            durationMs: 230,
            effect: 'irreversible',
            approval: { id: 'ap1' },
        });
        // the gateway's redacted body wins over the command's text
        expect(p.request.body).toContain('[redacted by the orchestrator]');
        expect(ofType(d.blocks, 'code').map((c) => c.label)).toEqual(['Command', 'Response']);
        expect(ofType(d.blocks, 'code')[1].text).toBe('HTTP 200\n{\n  "ok": true\n}');
        // the approval shows with its request, not again on its own
        expect(ofType(d.blocks, 'approval')).toHaveLength(0);
    });

    it('shows a pending request that the socket log does not have yet', () => {
        const d = stepDetail(
            step({
                name: 'mcp_platform_request',
                status: 'waiting',
                args: { method: 'delete', path: '/datasets/5', body: { key: 'k' } },
                approvals: [approval({ state: 'pending', preview: undefined, via: 'mcp' })],
            }),
        );
        expect(d.kind).toBe('platform');
        const [p] = ofType(d.blocks, 'platform');
        expect(p.request).toMatchObject({
            method: 'DELETE',
            path: '/datasets/5',
            body: '{\n  "key": "k"\n}',
            status: 'waiting for your approval',
            approval: { state: 'pending' },
        });
    });

    it('marks a failed MCP call red and shows the arguments of a named tool', () => {
        const d = stepDetail(
            step({
                name: 'mcp_platform_get_dataset',
                status: 'error',
                args: { dataset_id: 99 },
                result: { text: 'HTTP 404\n{"detail":"Not Found"}', isError: true },
                platformCalls: [sock('GET /datasets/99', 'error 404', { via: 'mcp' })],
            }),
        );
        const [p] = ofType(d.blocks, 'platform');
        expect(p.request).toMatchObject({ method: 'GET', path: '/datasets/99', status: '404 · error', tone: 'error' });
        const code = ofType(d.blocks, 'code');
        expect(code[0]).toMatchObject({ label: 'Arguments', text: '{\n  "dataset_id": 99\n}' });
        expect(code[1]).toMatchObject({ label: 'Error', error: true });
        expect(code[1].text).toContain('"detail": "Not Found"');
    });

    it('labels the outcomes of the socket log', () => {
        expect(platformStatus('rejected')).toEqual({ text: 'rejected by you', tone: 'muted' });
        expect(platformStatus('violation blocked: no right to delete')).toEqual({
            text: 'blocked: no right to delete',
            tone: 'error',
        });
        expect(platformStatus('refused: path blocked')).toEqual({ text: 'refused: path blocked', tone: 'error' });
    });
});

describe('file tools', () => {
    it('shows path and content of a write', () => {
        const d = stepDetail(
            step({
                name: 'write',
                args: { path: '/workspace/a.py', content: 'print(1)\n' },
                result: { text: 'Wrote 9 bytes', isError: false },
            }),
        );
        expect(d.kind).toBe('file');
        expect(ofType(d.blocks, 'fields')[0].fields).toEqual([
            { label: 'Path', value: '/workspace/a.py', mono: true },
            { label: 'Size', value: '9 B' },
        ]);
        expect(ofType(d.blocks, 'code').map((c) => [c.label, c.text])).toEqual([
            ['Content', 'print(1)\n'],
            ['Result', 'Wrote 9 bytes'],
        ]);
    });

    it('shows each change of an edit as old and new, also in the old single form', () => {
        const d = stepDetail(
            step({
                name: 'edit',
                args: {
                    path: 'a.py',
                    edits: [
                        { oldText: 'x = 1', newText: 'x = 2' },
                        { oldText: 'y', newText: 'z' },
                    ],
                },
            }),
        );
        expect(ofType(d.blocks, 'code').map((c) => c.label)).toEqual([
            'Change 1: old',
            'Change 1: new',
            'Change 2: old',
            'Change 2: new',
        ]);
        const single = stepDetail(step({ name: 'edit', args: { path: 'a.py', oldText: 'a', newText: 'b' } }));
        expect(ofType(single.blocks, 'code').map((c) => [c.label, c.text])).toEqual([
            ['Change: old', 'a'],
            ['Change: new', 'b'],
        ]);
    });

    it('shows the start of a read and the further arguments of grep', () => {
        const read = stepDetail(
            step({ name: 'read', args: { path: 'log.txt', offset: 10 }, result: { text: 'line', isError: false } }),
        );
        expect(ofType(read.blocks, 'fields')[0].fields).toContainEqual({ label: 'Offset', value: '10', mono: true });
        expect(ofType(read.blocks, 'code')[0]).toMatchObject({ label: 'Content (start)', clip: true });
        const grep = stepDetail(step({ name: 'grep', args: { pattern: 'TODO', path: 'src', ignoreCase: true } }));
        expect(ofType(grep.blocks, 'fields')[0].fields.map((f) => f.label)).toEqual(['Path', 'Pattern', 'Ignore case']);
    });
});

describe('other tools', () => {
    it('shows the arguments as indented JSON and the result text', () => {
        const d = stepDetail(
            step({
                name: 'web_search',
                tool: 'web_search',
                args: { query: 'pig', limit: 3 },
                result: { text: '3 hits', isError: false },
            }),
        );
        expect(d.kind).toBe('generic');
        expect(ofType(d.blocks, 'code').map((c) => [c.label, c.text])).toEqual([
            ['Arguments', '{\n  "query": "pig",\n  "limit": 3\n}'],
            ['Result', '3 hits'],
        ]);
    });

    it('lists an approval of a non-platform call on its own', () => {
        const up = approval({ kind: 'artifact_upload', name: 'report.pdf' });
        const d = stepDetail(step({ name: 'mcp_upload_artifact', args: { path: 'report.pdf' }, approvals: [up] }));
        expect(ofType(d.blocks, 'approval')).toEqual([{ type: 'approval', approval: up }]);
    });
});

describe('helpers', () => {
    it('clips long text by lines and characters', () => {
        const long = Array.from({ length: 30 }, (_, i) => `l${i}`).join('\n');
        const c = clipText(long, 20);
        expect(c.clipped).toBe(true);
        expect(c.text.split('\n')).toHaveLength(20);
        expect(c.totalLines).toBe(30);
        expect(clipText('short').clipped).toBe(false);
        expect(clipText('x'.repeat(5000), 20, 3000).text).toHaveLength(3000);
    });

    it('indents JSON and leaves other text alone', () => {
        expect(prettyJson('{"a":[1]}')).toBe('{\n  "a": [\n    1\n  ]\n}');
        expect(prettyJson('not json')).toBe('not json');
        expect(formatResponse('HTTP 201\nLocation: /tasks/4\n{"id":4}')).toBe(
            'HTTP 201\nLocation: /tasks/4\n{\n  "id": 4\n}',
        );
        expect(formatResponse('plain')).toBe('plain');
    });

    it('keeps the output so far of running calls until they end', () => {
        let s = partialsReducer(
            {},
            {
                type: 'tool_execution_update',
                toolCallId: 'c1',
                partialResult: { content: [{ type: 'text', text: 'a\n' }] },
            },
        );
        s = partialsReducer(s, {
            type: 'tool_execution_update',
            toolCallId: 'c1',
            partialResult: { content: [{ type: 'text', text: 'a\nb\n' }] },
        });
        expect(s).toEqual({ c1: 'a\nb\n' });
        expect(partialsReducer(s, { type: 'message_update' })).toBe(s);
        expect(partialsReducer(s, { type: 'tool_execution_end', toolCallId: 'c1' })).toEqual({});
    });
});
