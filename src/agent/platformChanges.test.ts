// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CHANGE_WINDOW_MS, changedArea, notifyPlatformChange, onPlatformChange, reportPlatformCall } from './platformChanges';

/** Pushes the pending change windows past their end. */
const flushWindows = () => vi.advanceTimersByTime(CHANGE_WINDOW_MS);

describe('changedArea', () => {
    it('maps a writing call to the area the page shows', () => {
        expect(changedArea('POST', '/datasets')).toBe('datasets');
        expect(changedArea('PATCH', '/datasets/16')).toBe('datasets');
        expect(changedArea('DELETE', '/datasets/16/toggle-public')).toBe('datasets');
        expect(changedArea('POST', '/models')).toBe('models');
        expect(changedArea('PUT', '/models/3')).toBe('models');
        expect(changedArea('POST', '/train/containers')).toBe('training');
        expect(changedArea('DELETE', '/train/containers/3')).toBe('training');
        expect(changedArea('POST', '/container-images/build')).toBe('images');
        expect(changedArea('POST', '/edge-devices')).toBe('edge-devices');
        expect(changedArea('PATCH', '/edge-groups/2')).toBe('edge-groups');
    });

    it('ignores a query string and a trailing slash', () => {
        expect(changedArea('DELETE', '/datasets?limit=2')).toBe('datasets');
        expect(changedArea('POST', '/datasets/')).toBe('datasets');
    });

    it('accepts a lower case method', () => {
        expect(changedArea('post', '/datasets')).toBe('datasets');
    });

    it('ignores reads', () => {
        for (const method of ['GET', 'HEAD', '']) expect(changedArea(method, '/datasets')).toBeUndefined();
    });

    it('matches whole segments only', () => {
        expect(changedArea('POST', '/datasetsX')).toBeUndefined();
        expect(changedArea('POST', '/models-of-something')).toBeUndefined();
    });

    it('ignores paths of other areas', () => {
        expect(changedArea('POST', '/users')).toBeUndefined();
        expect(changedArea('DELETE', '/activity')).toBeUndefined();
        expect(changedArea('POST', '')).toBeUndefined();
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

// The entry the chat stream uses: an event of the SSE "socket_call" kind reaches reportPlatformCall unchanged.
describe('reportPlatformCall', () => {
    let calls: string[];
    let off: (() => void) | undefined;

    const call = (op: string, detail: string, result: string) => reportPlatformCall({ op, detail, result });

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

    it('reports a successful platform write', () => {
        expect(call('platform', 'PATCH /datasets/16', 'ok 200')).toBe('datasets');
        flushWindows();
        expect(calls).toEqual(['datasets']);
    });

    it('stays silent on an error', () => {
        expect(call('platform', 'PATCH /datasets/16', 'error 500')).toBeUndefined();
        flushWindows();
        expect(calls).toEqual([]);
    });

    it('stays silent on a refused, blocked or rejected call', () => {
        for (const result of ['rejected by you', 'refused: not allowed', 'violation blocked: delegation']) {
            expect(call('platform', 'POST /datasets', result)).toBeUndefined();
        }
        flushWindows();
        expect(calls).toEqual([]);
    });

    it('stays silent on a read, even a successful one', () => {
        expect(call('platform', 'GET /datasets?limit=100', 'ok 200')).toBeUndefined();
        expect(call('platform', 'GET /models/3', 'ok 200')).toBeUndefined();
        flushWindows();
        expect(calls).toEqual([]);
    });

    it('stays silent for another channel', () => {
        expect(call('llm', 'PATCH /datasets/16', 'ok 200')).toBeUndefined();
        expect(call('exec', 'POST /datasets', 'ok 200')).toBeUndefined();
        flushWindows();
        expect(calls).toEqual([]);
    });

    it('stays silent for a write outside the areas the pages show', () => {
        expect(call('platform', 'POST /users', 'ok 200')).toBeUndefined();
        flushWindows();
        expect(calls).toEqual([]);
    });

    it('summarises a plan of several writes into one reload per area', () => {
        call('platform', 'POST /train/config', 'ok 201');
        call('platform', 'POST /train/containers/3/run', 'ok 200');
        call('platform', 'PATCH /datasets/16', 'ok 200');
        flushWindows();
        expect(calls.sort()).toEqual(['datasets', 'training']);
    });
});
