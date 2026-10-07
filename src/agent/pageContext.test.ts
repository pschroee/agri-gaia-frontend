// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import { sectionOf } from './format';
import { AgentApiError, isOldGatewayRefusal } from './api';
import {
    MAX_CONTEXT_NAME,
    MAX_CONTEXT_OBJECTS,
    canonicalId,
    cleanName,
    contextKey,
    contextLabel,
    contextObjects,
    contextTitle,
    hasSelection,
    inputPlaceholder,
    isPageContext,
    pageContextOf,
    visibleContext,
    wireContext,
} from './pageContext';

describe('pageContextOf', () => {
    it('maps every platform route to the gateway page id', () => {
        const pages: Record<string, string> = {
            '/': 'datasets',
            '/data': 'datasets',
            '/train': 'model-training',
            '/models': 'models',
            '/models/7': 'models',
            '/inference-container-templates': 'container-templates',
            '/container-images': 'container-registry',
            '/edge': 'edge-devices',
            '/edge/3': 'edge-devices',
            '/edge-groups': 'edge-groups',
            '/applications': 'applications',
            '/integrated-services': 'integrated-services',
            '/network': 'network',
            '/licenses': 'licenses',
        };
        for (const [path, page] of Object.entries(pages)) expect(pageContextOf(path)?.page, path).toBe(page);
    });

    it('has no context on the agent page and pages outside the list', () => {
        for (const path of ['/ai-agent', '/debug', '/open-data', '/docker', '/edc-debug', '/dataset', '/modelsx'])
            expect(pageContextOf(path), path).toBeUndefined();
    });

    it('takes the object from a detail route, the name only from a matching selection', () => {
        expect(pageContextOf('/models/7')).toEqual({ page: 'models', objects: [{ kind: 'model', id: '7' }] });
        expect(pageContextOf('/models/7', { kind: 'model', id: 7, name: 'resnet-pigs' })).toEqual({
            page: 'models',
            objects: [{ kind: 'model', id: '7', name: 'resnet-pigs' }],
        });
        // a stale selection of another model does not rename the opened one
        expect(pageContextOf('/models/7', { kind: 'model', id: 8, name: 'other' })?.objects?.[0]).toEqual({
            kind: 'model',
            id: '7',
        });
        expect(pageContextOf('/edge/3/', { kind: 'edge_device', id: 3, name: 'barn-cam' })?.objects?.[0]).toEqual({
            kind: 'edge_device',
            id: '3',
            name: 'barn-cam',
        });
    });

    it('takes a selected dataset on the datasets page', () => {
        expect(pageContextOf('/data', { kind: 'dataset', id: 42, name: 'smarttail-bucht-3-kw31' })).toEqual({
            page: 'datasets',
            objects: [{ kind: 'dataset', id: '42', name: 'smarttail-bucht-3-kw31' }],
        });
        expect(pageContextOf('/', { kind: 'dataset', id: 1 })?.objects).toEqual([{ kind: 'dataset', id: '1' }]);
    });

    it('takes all checked datasets, each id once, at most 50 (issue #45)', () => {
        expect(
            pageContextOf('/data', [
                { kind: 'dataset', id: 42, name: 'bay-3' },
                { kind: 'dataset', id: 7, name: ' bay\n4 ' },
                { kind: 'dataset', id: 42, name: 'again' },
                { kind: 'dataset', id: -1 },
                { kind: 'model', id: 5 },
            ]),
        ).toEqual({
            page: 'datasets',
            objects: [
                { kind: 'dataset', id: '42', name: 'bay-3' },
                { kind: 'dataset', id: '7', name: 'bay 4' },
            ],
        });
        expect(pageContextOf('/data', [])).toEqual({ page: 'datasets' });
        const many = Array.from({ length: 60 }, (_, i) => ({ kind: 'dataset' as const, id: i + 1 }));
        expect(pageContextOf('/data', many)?.objects).toHaveLength(MAX_CONTEXT_OBJECTS);
        // a detail route keeps its own object whatever else is selected
        expect(pageContextOf('/models/7', [{ kind: 'model', id: 8 }, { kind: 'model', id: 7, name: 'm7' }])?.objects).toEqual([
            { kind: 'model', id: '7', name: 'm7' },
        ]);
    });

    it('ignores selections of another kind and ids the gateway would refuse', () => {
        expect(pageContextOf('/data', { kind: 'model', id: 4, name: 'm' })).toEqual({ page: 'datasets' });
        expect(pageContextOf('/train', { kind: 'dataset', id: 4 })).toEqual({ page: 'model-training' });
        expect(pageContextOf('/models/abc')).toEqual({ page: 'models' });
        expect(pageContextOf('/models/007')).toEqual({ page: 'models' });
        expect(pageContextOf('/models/abc', { kind: 'model', id: 5, name: 'x' })).toEqual({ page: 'models' });
        expect(pageContextOf('/data', { kind: 'dataset', id: -1 })).toEqual({ page: 'datasets' });
        expect(pageContextOf('/data', { kind: 'dataset', id: 1.5 })).toEqual({ page: 'datasets' });
    });

    it('keeps the section labels of the panel header', () => {
        expect(sectionOf('/data')).toBe('Datasets');
        expect(sectionOf('/edge/3')).toBe('Edge Devices');
        expect(sectionOf('/edge-groups')).toBe('Edge Groups');
        expect(sectionOf('/ai-agent')).toBeUndefined();
    });
});

describe('canonicalId and cleanName', () => {
    it('accepts only canonical non-negative integers', () => {
        expect(canonicalId(0)).toBe('0');
        expect(canonicalId(' 12 ')).toBe('12');
        expect(canonicalId('012')).toBeUndefined();
        expect(canonicalId('1e3')).toBeUndefined();
        expect(canonicalId('1'.repeat(19))).toBeUndefined();
        expect(canonicalId(undefined)).toBeUndefined();
    });

    it('turns control and formatting characters into spaces and bounds the length', () => {
        expect(cleanName(' \n ')).toBeUndefined();
        expect(cleanName('a\u2028b')).toBe('a b');
        expect(cleanName('  bay\n3\u202e\u200bkw31\t ')).toBe('bay 3 kw31');
        expect(cleanName('a\u2028b')).toBe('a b');
        expect(cleanName(' \n ')).toBeUndefined();
        expect(cleanName(undefined)).toBeUndefined();
        const long = cleanName('ä'.repeat(MAX_CONTEXT_NAME + 10)) ?? '';
        expect(Array.from(long)).toHaveLength(MAX_CONTEXT_NAME);
        expect(long.endsWith('…')).toBe(true);
        expect(cleanName('ä'.repeat(MAX_CONTEXT_NAME))).toBe('ä'.repeat(MAX_CONTEXT_NAME));
    });
});

describe('context chip', () => {
    const ds = { page: 'datasets', object: { kind: 'dataset' as const, id: '42', name: 'bay-3' } };
    const two = {
        page: 'datasets',
        objects: [
            { kind: 'dataset' as const, id: '42', name: 'bay-3' },
            { kind: 'dataset' as const, id: '7' },
        ],
    };

    it('labels by the object name, else kind and id, several by their count, else the page', () => {
        expect(contextLabel(ds)).toBe('bay-3');
        expect(contextLabel({ page: 'datasets', objects: [ds.object] })).toBe('bay-3');
        expect(contextLabel({ page: 'models', object: { kind: 'model', id: '7' } })).toBe('Model 7');
        expect(contextLabel({ page: 'edge-devices', object: { kind: 'edge_device', id: '3' } })).toBe('Edge device 3');
        expect(contextLabel(two)).toBe('2 datasets');
        expect(contextLabel({ page: 'model-training' })).toBe('Model Training');
        expect(contextTitle(ds)).toBe('Dataset 42 · bay-3 · on Datasets');
        expect(contextTitle(two)).toBe('2 datasets on Datasets:\nbay-3 (42)\nDataset 7');
        expect(contextTitle({ page: 'licenses' })).toBe('Page: Licenses');
    });

    it('shows a chip for 1 and n selected objects, none for the page alone (issue #45)', () => {
        expect(hasSelection(undefined)).toBe(false);
        expect(hasSelection({ page: 'datasets' })).toBe(false);
        expect(hasSelection({ page: 'datasets', objects: [] })).toBe(false);
        expect(hasSelection(ds)).toBe(true);
        expect(hasSelection(two)).toBe(true);
        expect(inputPlaceholder(undefined)).toBe('Ask the agent …');
        expect(inputPlaceholder({ page: 'datasets' })).toBe('Ask the agent …');
        expect(inputPlaceholder({ page: 'datasets' }, 'Reply …')).toBe('Reply …');
        expect(inputPlaceholder(ds)).toBe('Ask about this dataset …');
        expect(inputPlaceholder({ page: 'edge-devices', objects: [{ kind: 'edge_device', id: '3' }] })).toBe(
            'Ask about this edge device …',
        );
        expect(inputPlaceholder(two)).toBe('Ask about the 2 selected datasets …');
    });

    it('the cross leaves out exactly this selection, the page still goes along', () => {
        const key = contextKey(ds);
        expect(visibleContext(ds, undefined)).toBe(ds);
        expect(visibleContext(ds, key)).toEqual({ page: 'datasets' });
        // renamed: still the same object
        expect(visibleContext({ ...ds, object: { ...ds.object, name: 'new' } }, key)).toEqual({ page: 'datasets' });
        // another object or page brings the chip back
        expect(visibleContext({ ...ds, object: { ...ds.object, id: '43' } }, key)).toEqual({
            ...ds,
            object: { ...ds.object, id: '43' },
        });
        expect(visibleContext({ page: 'datasets' }, key)).toEqual({ page: 'datasets' });
        expect(visibleContext(undefined, key)).toBeUndefined();
        expect(contextKey(undefined)).toBe('');
        // several: the same ids in another order are the same selection; one more is a new one
        const twoKey = contextKey(two);
        expect(contextKey({ ...two, objects: [...two.objects].reverse() })).toBe(twoKey);
        expect(visibleContext(two, twoKey)).toEqual({ page: 'datasets' });
        const three = { ...two, objects: [...two.objects, { kind: 'dataset' as const, id: '9' }] };
        expect(visibleContext(three, twoKey)).toBe(three);
        // a single object and the same object in the list form are the same selection
        expect(contextKey({ page: 'datasets', objects: [ds.object] })).toBe(contextKey(ds));
    });

    it('sends one object in the old form, several as a list, none without either', () => {
        expect(wireContext({ page: 'datasets' })).toEqual({ page: 'datasets' });
        expect(wireContext({ page: 'datasets', objects: [] })).toEqual({ page: 'datasets' });
        expect(wireContext({ page: 'datasets', objects: [ds.object] })).toEqual(ds);
        expect(wireContext(ds)).toEqual(ds);
        expect(wireContext(two)).toEqual(two);
        expect(contextObjects({ page: 'datasets', object: ds.object, objects: two.objects })).toBe(two.objects);
    });

    it('falls back to the page alone only when an old gateway refuses the list', () => {
        const old = new AgentApiError(400, 'invalid input: context: json: unknown field "objects"');
        expect(isOldGatewayRefusal(old, two)).toBe(true);
        expect(isOldGatewayRefusal(old, ds)).toBe(false);
        expect(isOldGatewayRefusal(new AgentApiError(400, 'context: at most 50 objects'), two)).toBe(false);
        expect(isOldGatewayRefusal(new AgentApiError(500, 'unknown field "objects"'), two)).toBe(false);
        expect(isOldGatewayRefusal(new Error('unknown field "objects"'), two)).toBe(false);
    });

    it('accepts only structured contexts from the gateway', () => {
        expect(isPageContext(ds)).toBe(true);
        expect(isPageContext(two)).toBe(true);
        expect(isPageContext({ page: 'datasets', object: null })).toBe(true);
        expect(isPageContext({ page: '' })).toBe(false);
        expect(isPageContext({ page: 'datasets', object: { kind: 'dataset', id: 42 } })).toBe(false);
        expect(isPageContext({ page: 'datasets', objects: [{ kind: 'dataset', id: 42 }] })).toBe(false);
        expect(isPageContext({ page: 'datasets', objects: 'x' })).toBe(false);
        expect(isPageContext('datasets')).toBe(false);
        expect(isPageContext(undefined)).toBe(false);
    });
});
