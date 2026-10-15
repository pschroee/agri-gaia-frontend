// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import { datasetFromQuery, platformPath } from './platformLinks';

const ORIGIN = 'https://app.example.org';

describe('platformPath', () => {
    it('keeps the paths of platform pages, including the detail pages', () => {
        expect(platformPath('/models/12', ORIGIN)).toBe('/models/12');
        expect(platformPath('/data', ORIGIN)).toBe('/data');
        expect(platformPath('/edge/3', ORIGIN)).toBe('/edge/3');
        expect(platformPath('/train', ORIGIN)).toBe('/train');
        expect(platformPath('/container-images', ORIGIN)).toBe('/container-images');
        expect(platformPath('/inference-container-templates', ORIGIN)).toBe('/inference-container-templates');
        expect(platformPath('/edge-groups', ORIGIN)).toBe('/edge-groups');
        expect(platformPath('/applications', ORIGIN)).toBe('/applications');
    });

    it('keeps a dataset selection with digits and drops every other parameter and the fragment', () => {
        expect(platformPath('/data?dataset=5', ORIGIN)).toBe('/data?dataset=5');
        expect(platformPath('/data?dataset=5&x=1#a', ORIGIN)).toBe('/data?dataset=5');
        expect(platformPath('/data?dataset=abc', ORIGIN)).toBe('/data');
        expect(platformPath('/data?dataset=', ORIGIN)).toBe('/data');
        expect(platformPath('/data#top', ORIGIN)).toBe('/data');
    });

    it('cuts the origin off an absolute address of the same origin and checks it the same way', () => {
        expect(platformPath(`${ORIGIN}/edge/3`, ORIGIN)).toBe('/edge/3');
        expect(platformPath(`${ORIGIN}/data?dataset=7`, ORIGIN)).toBe('/data?dataset=7');
    });

    it('refuses other origins, other schemes and the agent’s own pages', () => {
        for (const href of [
            '//evil.org/x',
            'https://evil.org/models/1',
            'http://app.example.org/models/1',
            'javascript:alert(1)',
            'mailto:a@b.org',
            'data:text/html,x',
            '/agent',
            '/agent/api/chats',
            '/ai-agent',
            '/ai-agent?tab=activity',
            '/unknown',
            '/models/../agent/api',
            'models/1',
            'data?dataset=5',
        ]) {
            expect(platformPath(href, ORIGIN), href).toBeUndefined();
        }
    });

    it('refuses a path that is not on a known page after a dot segment', () => {
        expect(platformPath('/models/1/../../agent/api', ORIGIN)).toBeUndefined();
    });
});

describe('datasetFromQuery', () => {
    const ids = [7, 8, 12];

    it('reads a known id from the query string', () => {
        expect(datasetFromQuery('?dataset=7', ids)).toBe(7);
        expect(datasetFromQuery('dataset=12&x=1', ids)).toBe(12);
    });

    it('answers undefined for a missing, odd or unknown id', () => {
        expect(datasetFromQuery('', ids)).toBeUndefined();
        expect(datasetFromQuery('?other=7', ids)).toBeUndefined();
        expect(datasetFromQuery('?dataset=abc', ids)).toBeUndefined();
        expect(datasetFromQuery('?dataset=-1', ids)).toBeUndefined();
        expect(datasetFromQuery('?dataset=99', ids)).toBeUndefined();
    });
});
