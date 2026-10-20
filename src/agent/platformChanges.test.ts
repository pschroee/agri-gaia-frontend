// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    CHANGE_WINDOW_MS,
    areasOf,
    notifyPlatformChange,
    onPlatformChange,
    onPlatformChangedEvent,
    pathArea,
    platformChangedOf,
    reportPlatformChanged,
    startedTaskIds,
} from './platformChanges';

/** Pushes the pending change windows past their end. */
const flushWindows = () => vi.advanceTimersByTime(CHANGE_WINDOW_MS);

describe('pathArea', () => {
    it('maps a path to the area the page shows', () => {
        expect(pathArea('/datasets/16')).toBe('datasets');
        expect(pathArea('/train/containers')).toBe('training');
        expect(pathArea('/container-images/build')).toBe('images');
        expect(pathArea('/inference-container-templates/create/git')).toBe('container-templates');
        expect(pathArea('/integrated-services/3')).toBe('integrated-services');
        expect(pathArea('/tasks/abc')).toBe('tasks');
    });

    it('ignores a query string and a trailing slash', () => {
        expect(pathArea('/datasets?limit=2')).toBe('datasets');
        expect(pathArea('/datasets/')).toBe('datasets');
    });

    it('matches whole segments only', () => {
        expect(pathArea('/datasetsX')).toBeUndefined();
        expect(pathArea('/users')).toBeUndefined();
        expect(pathArea('')).toBeUndefined();
    });
});

describe('areasOf', () => {
    it('maps each resource of the gateway to the areas of its pages', () => {
        expect(areasOf({ resource: 'dataset', action: 'update', id: '5' })).toEqual(['datasets']);
        expect(areasOf({ resource: 'model', action: 'create' })).toEqual(['models']);
        expect(areasOf({ resource: 'training', action: 'run' })).toEqual(['training']);
        expect(areasOf({ resource: 'task', action: 'update' })).toEqual(['training', 'tasks']);
        expect(areasOf({ resource: 'container_image', action: 'create' })).toEqual(['images']);
        expect(areasOf({ resource: 'container_template', action: 'create' })).toEqual(['container-templates']);
        expect(areasOf({ resource: 'container_deployment', action: 'run' })).toEqual(['edge-devices']);
        expect(areasOf({ resource: 'edge_device', action: 'delete' })).toEqual(['edge-devices']);
    });

    it('has no page for notebook, assessment or annotation function', () => {
        for (const resource of ['notebook', 'assessment', 'annotation_function', 'unknown']) {
            expect(areasOf({ resource, action: 'create' })).toEqual([]);
        }
    });

    it('resolves the api resource by the path', () => {
        expect(areasOf({ resource: 'api', action: 'update', id: '/integrated-services/3' })).toEqual(['integrated-services']);
        expect(areasOf({ resource: 'api', action: 'update' }, '/edge-groups/2')).toEqual(['edge-groups']);
        expect(areasOf({ resource: 'api', action: 'update', id: '/users' })).toEqual([]);
    });
});

describe('platformChangedOf', () => {
    const msg = (data: unknown, kind = 'platform_changed') => JSON.stringify({ kind, data });
    const good = { chat_id: 'c1', source: 'call', path: '/datasets/5', changes: [{ resource: 'dataset', action: 'update', id: '5' }] };

    it('reads a well-formed event', () => {
        expect(platformChangedOf(msg(good))).toEqual({ ...good, job_id: undefined });
    });

    it('gives undefined for another kind, broken JSON and missing fields', () => {
        expect(platformChangedOf(msg(good, 'approval'))).toBeUndefined();
        expect(platformChangedOf('{not json')).toBeUndefined();
        expect(platformChangedOf(msg({ chat_id: 'c1', source: 'call' }))).toBeUndefined();
        expect(platformChangedOf(msg({ ...good, changes: 'x' }))).toBeUndefined();
        expect(platformChangedOf(msg(null))).toBeUndefined();
    });

    it('drops malformed changes', () => {
        const ev = platformChangedOf(msg({ ...good, changes: [{ resource: 'dataset' }, ...good.changes] }));
        expect(ev?.changes).toEqual(good.changes);
    });
});

describe('onPlatformChange', () => {
    let calls: string[];
    let off: (() => void) | undefined;

    beforeEach(() => {
        vi.useFakeTimers();
        calls = [];
        off = onPlatformChange((area) => calls.push(area));
    });

    afterEach(() => {
        off?.();
        vi.clearAllTimers();
        vi.useRealTimers();
    });

    it('reports a change after the window, not immediately', () => {
        notifyPlatformChange('datasets');
        expect(calls).toEqual([]);
        flushWindows();
        expect(calls).toEqual(['datasets']);
    });

    it('summarises two changes of one area within the window into one call', () => {
        notifyPlatformChange('datasets');
        vi.advanceTimersByTime(100);
        notifyPlatformChange('datasets');
        expect(calls).toEqual([]);
        flushWindows();
        expect(calls).toEqual(['datasets']);
    });

    it('loads again for a change after the window', () => {
        notifyPlatformChange('datasets');
        flushWindows();
        notifyPlatformChange('datasets');
        flushWindows();
        expect(calls).toEqual(['datasets', 'datasets']);
    });

    it('tells the areas apart: each one has its own window', () => {
        notifyPlatformChange('datasets');
        notifyPlatformChange('models');
        flushWindows();
        expect(calls.sort()).toEqual(['datasets', 'models']);
    });

    it('stops with the returned function', () => {
        off?.();
        notifyPlatformChange('datasets');
        flushWindows();
        expect(calls).toEqual([]);
    });
});

describe('reportPlatformChanged', () => {
    let calls: string[];
    let off: (() => void) | undefined;

    const change = (resource: string, path = '') => ({
        chat_id: 'c1',
        source: 'call',
        path,
        changes: [{ resource, action: 'update' }],
    });

    beforeEach(() => {
        vi.useFakeTimers();
        calls = [];
        off = onPlatformChange((area) => calls.push(area));
    });

    afterEach(() => {
        off?.();
        vi.clearAllTimers();
        vi.useRealTimers();
    });

    it('reports every area of the event', () => {
        expect(reportPlatformChanged(change('task')).sort()).toEqual(['tasks', 'training']);
        flushWindows();
        expect(calls.sort()).toEqual(['tasks', 'training']);
    });

    it('stays silent for a resource without a page', () => {
        expect(reportPlatformChanged(change('notebook'))).toEqual([]);
        flushWindows();
        expect(calls).toEqual([]);
    });

    it('summarises ten events into one reload per area', () => {
        for (let i = 0; i < 10; i++) reportPlatformChanged(change('dataset'));
        flushWindows();
        expect(calls).toEqual(['datasets']);
    });
});

describe('startedTaskIds and the raw listener (#173)', () => {
    const ev = (changes: { resource: string; action: string; id?: string }[]) => ({
        chat_id: 'c',
        source: 'call',
        changes,
    });

    it('takes created tasks with a positive whole id', () => {
        expect(startedTaskIds(ev([{ resource: 'task', action: 'create', id: '42' }]))).toEqual([42]);
        expect(
            startedTaskIds(
                ev([
                    { resource: 'task', action: 'create', id: '7' },
                    { resource: 'task', action: 'create', id: '7' },
                ]),
            ),
        ).toEqual([7]);
    });

    it('skips a missing id, a non-number, zero, another action and another resource', () => {
        expect(
            startedTaskIds(
                ev([
                    { resource: 'task', action: 'create' },
                    { resource: 'task', action: 'create', id: 'abc' },
                    { resource: 'task', action: 'create', id: '0' },
                    { resource: 'task', action: 'update', id: '5' },
                    { resource: 'training', action: 'create', id: '5' },
                ]),
            ),
        ).toEqual([]);
    });

    it('calls the raw listener at once, before the change window ends', () => {
        vi.useFakeTimers();
        const seen: string[] = [];
        const off = onPlatformChangedEvent((e) => seen.push(e.chat_id));
        reportPlatformChanged(ev([{ resource: 'task', action: 'create', id: '1' }]));
        expect(seen).toEqual(['c']);
        off();
        reportPlatformChanged(ev([{ resource: 'task', action: 'create', id: '2' }]));
        expect(seen).toEqual(['c']);
        vi.clearAllTimers();
        vi.useRealTimers();
    });

    it('survives a listener that throws', () => {
        vi.useFakeTimers();
        const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const off = onPlatformChangedEvent(() => {
            throw new Error('boom');
        });
        expect(() => reportPlatformChanged(ev([]))).not.toThrow();
        off();
        spy.mockRestore();
        vi.clearAllTimers();
        vi.useRealTimers();
    });
});
