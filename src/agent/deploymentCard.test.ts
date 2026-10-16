// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import {
    deploymentCardOf,
    deploymentCardsIn,
    deploymentDetails,
    deploymentHint,
    deploymentRefId,
    deploymentTool,
    deploymentToolOf,
    deploymentView,
    detailTimeText,
    jobOfDeployment,
    jsonObjectIn,
    lastSeenText,
    midSplit,
    parseTime,
    portList,
    taskLine,
    updatedAt,
    updatedText,
} from './deploymentCard';
import type { DeploymentCardData } from './deploymentCard';
import type { WatchJob } from './jobs';
import type { Step } from './transcript';

const job = (over: Partial<WatchJob> = {}): WatchJob => ({
    id: 'j1',
    chat_id: 'c1',
    kind: 'edge_deployment',
    ref: 'deployment:7|task:12',
    tool_call_id: 'c1',
    state: 'running',
    ...over,
});

/** A tool result as the agent gets it: the HTTP line, the body, then what the platform tools append. */
const result = (json: unknown) => `HTTP 200\n${JSON.stringify(json)}`;

/** The answer of platform_deployment_status (edge E2, `internal/platform/tools_edge.go`). */
const status = (over: Record<string, unknown> = {}) => ({
    deployment_id: 7,
    name: 'agw-mnist-v1',
    status: 'created',
    device: { id: 1, name: 'sim-edge-01', online: true, last_heartbeat: '2026-10-16T12:51:58' },
    image: 'agent-test/mnist-triton:v1',
    ports: ['18100->8000/tcp'],
    docker_container_id_present: false,
    created_at: '2026-10-16T12:52:07',
    ...over,
});

const data = (over: Partial<DeploymentCardData> = {}): DeploymentCardData => ({
    id: '7',
    name: 'agw-mnist-v1',
    status: 'created',
    device: { id: '1', name: 'sim-edge-01', online: true, lastHeartbeat: '2026-10-16T12:51:58' },
    image: 'agent-test/mnist-triton:v1',
    ports: ['18100 → 8000/tcp'],
    containerIdPresent: false,
    createdAt: '2026-10-16T12:52:07',
    ...over,
});

const step = (over: Partial<Step> = {}): Step => ({
    id: 'call-1',
    tool: 'platform.deployment_status',
    name: 'mcp_platform_deployment_status',
    status: 'done',
    result: { text: result(status()), isError: false },
    ...over,
});

describe('jsonObjectIn', () => {
    it('reads the object out of the text the tools answer with', () => {
        expect(jsonObjectIn(result({ a: 1, b: 'x' }))).toEqual({ a: 1, b: 'x' });
    });

    it('keeps a note behind the object out and ignores braces inside strings', () => {
        const text = `HTTP 200\n{"name":"a{b}c","n":{"k":2}}\nthe platform does not check`;
        expect(jsonObjectIn(text)).toEqual({ name: 'a{b}c', n: { k: 2 } });
    });

    it('is undefined without an object', () => {
        expect(jsonObjectIn('HTTP 404 · not found')).toBeUndefined();
        expect(jsonObjectIn('{broken')).toBeUndefined();
    });
});

describe('deploymentTool', () => {
    it('knows the MCP names and the subcommands of the command line', () => {
        expect(deploymentTool('platform.deployment_status')).toBe('status');
        expect(deploymentTool('deployment-status')).toBe('status');
        expect(deploymentTool('platform_start_deployment')).toBe('start');
        expect(deploymentTool('undeploy')).toBe('undeploy');
    });

    it('is undefined for every other tool', () => {
        expect(deploymentTool('platform.list_datasets')).toBeUndefined();
        expect(deploymentTool(undefined)).toBeUndefined();
    });
});

describe('deploymentToolOf', () => {
    it('reads the MCP call of a step', () => {
        expect(deploymentToolOf(step())).toBe('status');
        expect(deploymentToolOf(step({ name: 'mcp_platform_undeploy', tool: 'platform.undeploy' }))).toBe('undeploy');
    });

    it('reads the command line call inside a bash step', () => {
        const s = step({
            tool: 'bash',
            name: 'bash',
            args: { command: 'agw-platform deployment-status 7 --task_id 12 | tail -n +2' },
        });
        expect(deploymentToolOf(s)).toBe('status');
        const start = step({
            tool: 'bash',
            name: 'bash',
            args: { command: 'cd /workspace && /usr/local/bin/agw-platform start-deployment 7' },
        });
        expect(deploymentToolOf(start)).toBe('start');
    });

    it('says nothing for another command', () => {
        // the name has to go with it: the fixture's own name is an MCP call of a deployment tool
        expect(
            deploymentToolOf(step({ tool: 'bash', name: 'bash', args: { command: 'agw-platform datasets' } })),
        ).toBeUndefined();
        expect(deploymentToolOf(step({ tool: 'read', name: 'read' }))).toBeUndefined();
    });
});

describe('deploymentCardOf', () => {
    it('reads the deployment, its device, image and ports from a status answer', () => {
        expect(deploymentCardOf('platform.deployment_status', result(status()))).toEqual({
            id: '7',
            name: 'agw-mnist-v1',
            status: 'created',
            device: { id: '1', name: 'sim-edge-01', online: true, lastHeartbeat: '2026-10-16T12:51:58' },
            image: 'agent-test/mnist-triton:v1',
            ports: ['18100 → 8000/tcp'],
            containerIdPresent: false,
            createdAt: '2026-10-16T12:52:07',
            task: undefined,
            hint: undefined,
        });
    });

    it('reads the task with its status, message and times', () => {
        const json = status({
            task: {
                id: 12,
                status: 'inprogress',
                completion_percentage: 40,
                message: 'pulling',
                creation_date: '2026-10-16T12:53:02',
            },
        });
        const card = deploymentCardOf('platform.deployment_status', result(json));
        expect(card?.task).toEqual({
            id: '12',
            status: 'inprogress',
            message: 'pulling',
            percent: 40,
            createdAt: '2026-10-16T12:53:02',
            startedAt: undefined,
            finishedAt: undefined,
        });
    });

    it('knows the command line name of the tool as well', () => {
        expect(deploymentCardOf('deployment-status', result(status()))?.name).toBe('agw-mnist-v1');
    });

    it('draws no card for another tool, for a broken answer or for the thin answers of start and undeploy', () => {
        expect(deploymentCardOf('platform.list_deployments', result(status()))).toBeNull();
        expect(deploymentCardOf('platform.deployment_status', 'HTTP 404 · not found')).toBeNull();
        expect(deploymentCardOf('platform.deployment_status', result({ foo: 1 }))).toBeNull();
        // no status: the platform's status of the deployment is not in the answer
        expect(deploymentCardOf('platform.deployment_status', result(status({ status: undefined })))).toBeNull();
        // a name is what the card is headed with
        expect(deploymentCardOf('platform.deployment_status', result(status({ name: undefined })))).toBeNull();
        expect(
            deploymentCardOf('platform.start_deployment', result({ deployment_id: 7, task: '/tasks/12', note: '…' })),
        ).toBeNull();
        expect(deploymentCardOf('platform.undeploy', result({ deployment_id: 7, status: 'undeployed' }))).toBeNull();
    });
});

describe('portList', () => {
    it('writes the arrow of the design', () => {
        expect(portList(['18100->8000/tcp', '18101 -> 8001/tcp'])).toEqual(['18100 → 8000/tcp', '18101 → 8001/tcp']);
    });

    it('is empty without ports', () => {
        expect(portList(undefined)).toEqual([]);
        expect(portList([])).toEqual([]);
    });
});

describe('deploymentView', () => {
    it('is the platform status without a task and without a job', () => {
        expect(deploymentView(data({ status: 'created' }))).toBe('created');
        expect(deploymentView(data({ status: 'deployed' }))).toBe('deployed');
        expect(deploymentView(data({ status: 'undeployed' }))).toBe('undeployed');
    });

    it('is starting while the task runs or the job observes it', () => {
        expect(deploymentView(data({ task: { status: 'inprogress' } }))).toBe('starting');
        expect(deploymentView(data(), job())).toBe('starting');
    });

    it('is failed when the task or the job failed', () => {
        expect(deploymentView(data({ task: { status: 'failed' } }))).toBe('failed');
        expect(deploymentView(data(), job({ state: 'failed' }))).toBe('failed');
    });

    it('lets the device offline win over deployed, but not over created', () => {
        const offline = data({ status: 'deployed', device: { name: 'sim-edge-01', online: false } });
        expect(deploymentView(offline)).toBe('offline');
        expect(deploymentView(data({ device: { name: 'sim-edge-01', online: false } }))).toBe('created');
    });

    it('is deployed when the job the gateway watched came through', () => {
        expect(deploymentView(data({ status: 'created' }), job({ state: 'done', message: 'deployed' }))).toBe(
            'deployed',
        );
        expect(deploymentView(data({ status: 'undeployed' }), job({ state: 'done' }))).toBe('undeployed');
    });
});

describe('taskLine', () => {
    it('names the task of every state', () => {
        expect(taskLine('created', data())).toEqual({ text: 'No task yet', status: '' });
        expect(taskLine('starting', data())).toEqual({ text: 'Pulling image on device…', status: 'in progress' });
        expect(taskLine('deployed', data())).toEqual({ text: 'Container started on device', status: 'completed' });
        expect(taskLine('offline', data())).toEqual({ text: 'Container started on device', status: 'completed' });
        expect(taskLine('undeployed', data())).toEqual({ text: 'Container stopped and removed', status: 'completed' });
    });

    it('shows the platform message of a failed task, and a line of its own without one', () => {
        const failed = data({ task: { status: 'failed', message: 'Image pull failed: manifest unknown' } });
        expect(taskLine('failed', failed)).toEqual({
            text: 'Image pull failed: manifest unknown',
            status: 'failed',
        });
        expect(taskLine('failed', data()).text).toBe('The start failed.');
    });
});

describe('deploymentHint', () => {
    it('names the limits of the platform per state', () => {
        expect(deploymentHint('created', data())).toEqual({
            text: 'Nothing runs until the deployment is started.',
            warn: false,
        });
        expect(deploymentHint('deployed', data())).toEqual({
            text: 'The platform does not check whether the container still runs.',
            warn: false,
        });
        expect(deploymentHint('starting', data())).toBeUndefined();
        expect(deploymentHint('undeployed', data())).toBeUndefined();
    });

    it('prefers the gateway wording where it sends one', () => {
        const withHint = data({
            hint: 'the platform does not check whether the container still runs; deployed means it was started.',
        });
        expect(deploymentHint('deployed', withHint)?.text).toContain('deployed means it was started');
        const failed = data({ name: 'agw-mnist-v1', task: { status: 'failed' } });
        expect(deploymentHint('failed', failed)).toEqual({
            text: 'A container named agw-mnist-v1 may be left on the device and needs manual removal.',
            warn: true,
        });
    });

    it('warns about a device that stopped checking in, in every state but failed and undeployed', () => {
        const offline = data({ device: { name: 'sim-edge-01', online: false } });
        expect(deploymentHint('created', offline)).toEqual({
            text: 'The device has not checked in for more than 5 minutes.',
            warn: true,
        });
        expect(deploymentHint('starting', offline)?.warn).toBe(true);
        expect(deploymentHint('offline', offline)?.warn).toBe(true);
        expect(deploymentHint('undeployed', data({ status: 'undeployed', device: { online: false } }))).toBeUndefined();
        expect(deploymentHint('failed', data({ device: { online: false } }))?.text).toContain('may be left');
    });
});

describe('parseTime', () => {
    it('reads a value without a zone as UTC, the way the platform sends it (F8)', () => {
        expect(parseTime('2026-10-16T12:52:07')).toBe(Date.parse('2026-10-16T12:52:07Z'));
        expect(parseTime('2026-10-16T12:52:07.500')).toBe(Date.parse('2026-10-16T12:52:07.500Z'));
    });

    it('keeps a value that carries a zone', () => {
        expect(parseTime('2026-10-16T14:52:07+02:00')).toBe(Date.parse('2026-10-16T12:52:07Z'));
    });

    it('is undefined for a missing or unreadable value', () => {
        expect(parseTime(undefined)).toBeUndefined();
        expect(parseTime('')).toBeUndefined();
        expect(parseTime('—')).toBeUndefined();
    });
});

describe('times of the card', () => {
    const now = Date.parse('2026-10-16T12:52:07Z');

    it('writes a detail time of today, yesterday or the date, local time', () => {
        expect(detailTimeText('2026-10-16T12:52:07Z', now + 60000)).toMatch(/^today, \d{2}:\d{2}:\d{2}$/);
        expect(detailTimeText('2026-10-14T12:52:07Z', now)).toMatch(
            /^(yesterday, \d{2}:\d{2}:\d{2}|\d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}:\d{2})$/,
        );
    });

    it('shows a missing value as "—" (W2)', () => {
        expect(detailTimeText(undefined, now)).toBe('—');
        expect(lastSeenText(undefined, now)).toBe('—');
    });

    it('writes how long ago a device checked in', () => {
        expect(lastSeenText('2026-10-16T12:52:00Z', now)).toBe('just now');
        expect(lastSeenText('2026-10-16T12:50:07Z', now)).toBe('2 min ago');
        expect(lastSeenText('2026-10-16T09:52:07Z', now)).toBe('3 h ago');
    });

    it('writes the moment of the head as "updated <time>"', () => {
        expect(updatedText(now, now)).toMatch(/^today, \d{2}:\d{2}$/);
        expect(updatedText(undefined, now)).toBeUndefined();
    });

    it('takes the newest moment of the result and of its job', () => {
        const withTask = data({
            task: { status: 'completed', createdAt: '2026-10-16T12:53:02', finishedAt: '2026-10-16T12:53:41' },
        });
        expect(updatedAt(withTask)).toBe(Date.parse('2026-10-16T12:53:41Z'));
        expect(updatedAt(withTask, job({ checked_at: '2026-10-16T12:54:10Z' }))).toBe(
            Date.parse('2026-10-16T12:54:10Z'),
        );
    });
});

describe('deploymentDetails', () => {
    it('keeps the six rows in the order of the design and shows what is missing as "—"', () => {
        const now = Date.parse('2026-10-16T12:52:07Z');
        expect(deploymentDetails(data(), now)).toEqual([
            { label: 'Task ID', value: '—', mono: true, truncate: true },
            { label: 'Container ID present', value: 'No' },
            { label: 'Created', value: detailTimeText('2026-10-16T12:52:07', now) },
            { label: 'Task started', value: '—' },
            { label: 'Task finished', value: '—' },
            { label: 'Device last check-in', value: detailTimeText('2026-10-16T12:51:58', now) },
        ]);
    });

    it('names the task id and the container, and the times the gateway passes on', () => {
        const now = Date.parse('2026-10-16T12:52:07Z');
        const rows = deploymentDetails(
            data({
                containerIdPresent: true,
                task: { id: '12', status: 'completed', startedAt: '2026-10-16T12:53:02', finishedAt: '2026-10-16T12:53:41' },
            }),
            now,
        );
        expect(rows.map((r) => r.value).slice(0, 5)).toEqual([
            '12',
            'Yes',
            detailTimeText('2026-10-16T12:52:07', now),
            detailTimeText('2026-10-16T12:53:02', now),
            detailTimeText('2026-10-16T12:53:41', now),
        ]);
    });
});

describe('midSplit', () => {
    it('keeps the tag of an image and the number of a device', () => {
        expect(midSplit('agent-test/mnist-triton:v1', { min: 10, cap: 16, boundary: /(?=[:/])/ })).toEqual({
            head: 'agent-test',
            tail: '/mnist-triton:v1',
        });
        expect(midSplit('jetson-orin-nx-greenhouse-osnabrueck-07', { min: 6, cap: 16 })).toEqual({
            head: 'jetson-orin-nx-greenhouse',
            tail: '-osnabrueck-07',
        });
        expect(midSplit('agw-efficientnet-b0-weed-detection-field-north-v12', { min: 8, cap: 14 })).toEqual({
            head: 'agw-efficientnet-b0-weed-detection-field',
            tail: '-north-v12',
        });
    });

    it('does not split a value that is only a little longer than its tail', () => {
        expect(midSplit('agw-mnist-v1', { min: 14, cap: 14 })).toEqual({ head: 'agw-mnist-v1', tail: '' });
    });

    it('takes the last characters of a task id, without a word boundary', () => {
        expect(midSplit('7d1c2a9e-4b10-4f6e-9e1a-2c5b8f03d6a1', { min: 6 })).toEqual({
            head: '7d1c2a9e-4b10-4f6e-9e1a-2c5b8f',
            tail: '03d6a1',
        });
        expect(midSplit('12', { min: 6 })).toEqual({ head: '12', tail: '' });
    });
});

describe('the job of a deployment', () => {
    it('reads the deployment out of the reference the gateway writes', () => {
        expect(deploymentRefId('deployment:7|task:12')).toBe('7');
        expect(deploymentRefId('deployment:7')).toBe('7');
        expect(deploymentRefId('task:12')).toBeUndefined();
        expect(deploymentRefId(undefined)).toBeUndefined();
    });

    it('finds the job by the deployment, not only by the call that started it', () => {
        const other = job({ id: 'j0', kind: 'training', ref: 'model:3' });
        const jobs = [other, job({ tool_call_id: 'call-9' })];
        expect(jobOfDeployment(jobs, '7')?.id).toBe('j1');
        expect(jobOfDeployment(jobs, '8')).toBeUndefined();
    });
});

describe('deploymentCardsIn', () => {
    it('draws the card of the status call and hands it the job of its deployment', () => {
        const jobs = [job({ tool_call_id: 'call-9' })];
        const cards = deploymentCardsIn([step(), step({ id: 'call-2', tool: 'read', name: 'read' })], jobs);
        expect(cards).toHaveLength(1);
        expect(cards[0].key).toBe('call-1');
        expect(cards[0].data.name).toBe('agw-mnist-v1');
        expect(cards[0].job?.id).toBe('j1');
    });

    it('leaves a call without a usable answer out', () => {
        const broken = step({ result: { text: 'HTTP 500 · error', isError: true } });
        expect(deploymentCardsIn([broken], [])).toEqual([]);
    });
});
