// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import type { InternetBlocked, InternetGrant, PackageEntry } from './internet';
import {
    blockedActivityLink,
    blockedDetail,
    blockedTarget,
    grantProgress,
    packageNote,
    popoverGrantTitle,
    shownBlocked,
    shownRoots,
    showInActivityText,
} from './internetIndicator';

const MB = 1 << 20;
const at = '2026-10-21T12:10:00Z';
const entry = (host: string, extra: object = {}) => ({ host, origin: 'exec' as const, denied: '', at, ...extra });
const grant = (over: Partial<InternetGrant>): InternetGrant => ({
    id: 1,
    chat_id: 'c1',
    kind: 'domains',
    origin: 'agent',
    domains: [],
    packages: [],
    state: 'active',
    max_minutes: 30,
    max_bytes: 500 * MB,
    bytes: 0,
    blocked: 0,
    created_at: at,
    ...over,
});
const pkg = (name: string, over: Partial<PackageEntry> = {}): PackageEntry => ({
    ecosystem: 'pip',
    name,
    state: 'waiting',
    ...over,
});

describe('blocked block', () => {
    it('lists the latest three and links to the blocked connections of the chat', () => {
        const b: InternetBlocked = { count: 7, since: at, last: [1, 2, 3, 4].map((i) => entry(`h${i}.org`)) };
        expect(shownBlocked(b).map((e) => e.host)).toEqual(['h1.org', 'h2.org', 'h3.org']);
        expect(showInActivityText(b)).toBe('Show all 7 in Activity');
        expect(showInActivityText({ count: 3, since: at, last: b.last.slice(0, 3) })).toBe('Show in Activity');
        expect(showInActivityText(undefined)).toBe('Show in Activity');
        expect(blockedActivityLink('c 1')).toBe('/ai-agent?tab=activity&kind=connections&result=blocked&chat=c+1');
    });
    it('names a refused package with its ecosystem and a reason in words', () => {
        expect(blockedTarget(entry('github.com'))).toBe('github.com');
        expect(blockedTarget(entry('pypi.org', { package: 'opencv-python' }))).toBe('pip:opencv-python');
        expect(blockedDetail({ reason: 'https_only', at })).toMatch(/^only https · \d\d:\d\d$/);
        expect(blockedDetail({ reason: undefined, at: '' })).toBe('refused');
    });
});

describe('grant block', () => {
    it('titles', () => {
        expect(popoverGrantTitle({ kind: 'search', domains: [], packages: [] })).toBe('Web search');
        expect(popoverGrantTitle({ kind: 'domains', domains: ['a.org'], packages: [] })).toBe('1 site');
        expect(popoverGrantTitle({ kind: 'full', domains: [], packages: [] })).toBe('Full access');
    });
    it('package lines show the pin or "any version" and the state', () => {
        expect(packageNote(pkg('torch', { state: 'installed', installed_version: '2.5.1' }))).toBe('2.5.1 · installed');
        expect(packageNote(pkg('timm'))).toBe('any version · waiting');
        expect(packageNote(pkg('x', { version: '1.0', state: 'downloaded' }))).toBe('1.0 · downloaded');
    });
    it('folds the roots after five', () => {
        const list = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((n) => pkg(n)).concat(pkg('dep', { parent: 'a' }));
        expect(shownRoots(list, false)).toHaveLength(5);
        expect(shownRoots(list, true)).toHaveLength(7);
    });
    it('progress of a timed grant is the data used and the time left', () => {
        const now = Date.parse(at);
        const p = grantProgress(grant({ bytes: 100 * MB, expires_at: new Date(now + 27 * 60000).toISOString() }), now);
        expect(p.value).toBeCloseTo(20);
        expect(p.valueText).toBe('100 MB of 500 MB');
        expect(p.time).toMatch(/^27 min left · until \d\d:\d\d$/);
        expect(p.extra).toBe('');
    });
    it('progress of a packages grant counts the roots, the dependencies and the safety net', () => {
        const now = Date.parse(at);
        const g = grant({
            kind: 'packages',
            bytes: 1900 * MB,
            max_bytes: 4000 * MB,
            expires_at: new Date(now + 60 * 60000).toISOString(),
            packages: [
                pkg('torch', { state: 'installed' }),
                pkg('torchvision'),
                pkg('numpy', { parent: 'torch', state: 'downloaded' }),
            ],
        });
        const p = grantProgress(g, now);
        expect(p.value).toBe(50);
        expect(p.valueText).toBe('1 of 2 installed');
        expect(p.time).toMatch(/^Ends when installed · at the latest until \d\d:\d\d$/);
        expect(p.extra).toMatch(/^\+ 1 dependency so far · .* of /);
    });
});
