// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import type { Connection, InternetGrant, PackageEntry } from './internet';
import {
    FULL_WARNING,
    accessList,
    accessSummaryText,
    allowAria,
    allowLabel,
    approvalTitle,
    blockedGroupText,
    blockedHeading,
    blockedLine,
    cardTexts,
    connectionData,
    connectionResult,
    connectionTarget,
    connectionsSummaryText,
    decidedStateText,
    decidedTitle,
    dependenciesText,
    ecosystemOfHost,
    endInfo,
    endedNotice,
    expiresText,
    firstEnding,
    formatData,
    grantChip,
    grantLabel,
    indicatorState,
    limitText,
    limitsLine,
    megabytesText,
    minutesLeft,
    packageLabel,
    packageProgress,
    packageProgressText,
    packageStateText,
    parsePackage,
    reasonText,
    remaining,
    remainingText,
    showMoreText,
    showsUnderCall,
    switchOnText,
    unlistedText,
    versionText,
    viaText,
} from './internetView';

const MB = 1048576;
const NOW = Date.parse('2026-10-21T14:00:00Z');
const inMin = (m: number) => new Date(NOW + m * 60000).toISOString();

const grant = (over: Partial<InternetGrant> = {}): InternetGrant => ({
    id: 1,
    chat_id: 'c1',
    kind: 'search',
    origin: 'agent',
    domains: [],
    packages: [],
    state: 'active',
    max_minutes: 30,
    max_bytes: 500 * MB,
    bytes: 0,
    blocked: 0,
    created_at: inMin(-6),
    started_at: inMin(-6),
    expires_at: inMin(24),
    ...over,
});

const conn = (over: Partial<Connection> = {}): Connection => ({
    id: 1,
    chat_id: 'c1',
    method: 'CONNECT',
    host: 'arxiv.org',
    port: 443,
    status: 200,
    bytes_up: 0,
    bytes_down: 0,
    started_at: inMin(0),
    duration_ms: 1,
    origin: 'pi',
    count: 1,
    ...over,
});

const pkg = (over: Partial<PackageEntry> = {}): PackageEntry => ({ ecosystem: 'pip', name: 'torch', state: 'waiting', ...over });

describe('packages', () => {
    it('parses the canonical pip string with extras and a pin', () => {
        expect(parsePackage('pip:torch[a,b]==2.5.1')).toEqual({ ecosystem: 'pip', name: 'torch', extras: ['a', 'b'], version: '2.5.1' });
        expect(parsePackage('pip:timm')).toEqual({ ecosystem: 'pip', name: 'timm', extras: [], version: undefined });
    });

    it('parses npm names with a scope and a version', () => {
        expect(parsePackage('npm:@scope/name@1.2.3')).toEqual({ ecosystem: 'npm', name: '@scope/name', extras: [], version: '1.2.3' });
        expect(parsePackage('npm:@scope/name')?.version).toBeUndefined();
        expect(parsePackage('npm:vite@5.4.10')?.name).toBe('vite');
    });

    it('rejects strings without a known ecosystem', () => {
        expect(parsePackage('torch')).toBeUndefined();
        expect(parsePackage('cargo:serde')).toBeUndefined();
    });

    it('shows extras next to the name and "any version" instead of latest', () => {
        expect(packageLabel({ name: 'torch', extras: ['opt'] })).toBe('torch[opt]');
        expect(packageLabel({ name: 'torch', extras: [] })).toBe('torch');
        expect(versionText(undefined)).toBe('any version');
        expect(versionText('1.0.11')).toBe('1.0.11');
    });

    it('names the states without an installing state', () => {
        expect(packageStateText(pkg())).toBe('waiting');
        expect(packageStateText(pkg({ state: 'downloaded' }))).toBe('downloaded');
        expect(packageStateText(pkg({ state: 'installed', installed_version: '2.5.1' }))).toBe('installed 2.5.1');
        expect(packageStateText(pkg({ state: 'installed' }))).toBe('installed');
    });

    it('counts roots and dependencies', () => {
        const list = [
            pkg({ name: 'torch', state: 'installed' }),
            pkg({ name: 'torchvision' }),
            pkg({ name: 'numpy', parent: 'torch', state: 'installed' }),
            pkg({ name: 'pillow', parent: 'torchvision' }),
            pkg({ name: 'sympy', parent: 'torch' }),
        ];
        expect(packageProgress(list)).toEqual({ roots: 2, rootsInstalled: 1, dependencies: 3, dependenciesInstalled: 1 });
        expect(packageProgressText(list)).toBe('1 of 2 installed');
        expect(dependenciesText(list)).toBe('+ 3 dependencies so far');
        expect(dependenciesText([pkg(), pkg({ parent: 'torch' })])).toBe('+ 1 dependency so far');
        expect(dependenciesText([pkg()])).toBe('');
    });

    it('maps hosts to ecosystems', () => {
        expect(ecosystemOfHost('pypi.org')).toBe('pip');
        expect(ecosystemOfHost('files.pythonhosted.org')).toBe('pip');
        expect(ecosystemOfHost('registry.npmjs.org')).toBe('npm');
        expect(ecosystemOfHost('arxiv.org')).toBeUndefined();
    });
});

describe('sizes and times', () => {
    it('formats data', () => {
        expect(formatData(0)).toBe('0 B');
        expect(formatData(1023)).toBe('1023 B');
        expect(formatData(133 * 1024)).toBe('133 kB');
        expect(formatData(7 * MB)).toBe('7 MB');
        expect(formatData(272 * MB)).toBe('272 MB');
        expect(formatData(2 * 1024 * MB)).toBe('2 GB');
        expect(formatData(undefined)).toBe('–');
    });

    it('names limits in MB, and multiples of 1000 in GB', () => {
        expect(megabytesText(500)).toBe('500 MB');
        expect(megabytesText(4000)).toBe('4 GB');
        expect(megabytesText(1500)).toBe('1500 MB');
        expect(limitText(500 * MB)).toBe('500 MB');
        expect(limitText(4000 * MB)).toBe('4 GB');
    });

    it('rounds minutes up and never shows 0 while time remains', () => {
        expect(minutesLeft(inMin(24), NOW)).toBe(24);
        expect(minutesLeft(new Date(NOW + 90000).toISOString(), NOW)).toBe(2);
        expect(minutesLeft(new Date(NOW + 1000).toISOString(), NOW)).toBe(1);
        expect(minutesLeft(inMin(-1), NOW)).toBe(0);
        expect(minutesLeft(undefined, NOW)).toBeUndefined();
    });
});

describe('approval card', () => {
    it('titles each kind and names a helper', () => {
        expect(approvalTitle({ kind: 'search', by: 'agent' })).toBe('The agent asks to search the web');
        expect(approvalTitle({ kind: 'domains', by: 'agent', domains: ['a.org'] })).toBe('The agent asks to download from 1 site');
        expect(approvalTitle({ kind: 'domains', by: 'helper', domains: ['a.org', 'b.org'] })).toBe(
            'A helper of the agent asks to download from 2 sites',
        );
        expect(approvalTitle({ kind: 'packages', by: 'agent', packages: ['pip:torch', 'pip:torchvision'] })).toBe(
            'The agent asks to install 2 packages',
        );
        expect(approvalTitle({ kind: 'full', by: 'agent' })).toBe('The agent asks for full internet access');
    });

    it('labels the buttons with what is allowed', () => {
        expect(allowLabel({ kind: 'search', by: 'agent' })).toBe('ALLOW SEARCH');
        expect(allowLabel({ kind: 'domains', by: 'agent', domains: ['a'] })).toBe('ALLOW 1 SITE');
        expect(allowLabel({ kind: 'domains', by: 'agent', domains: new Array(10).fill('x') })).toBe('ALLOW 10 SITES');
        expect(allowLabel({ kind: 'packages', by: 'agent', packages: ['pip:a', 'pip:b'] })).toBe('ALLOW 2 PACKAGES');
        expect(allowLabel({ kind: 'full', by: 'agent' })).toBe('ALLOW FULL ACCESS');
        expect(allowAria({ kind: 'packages', by: 'agent', packages: ['pip:torch', 'pip:torchvision'] })).toBe(
            'Allow 2 packages: torch, torchvision',
        );
        expect(allowAria({ kind: 'domains', by: 'agent', domains: ['download.tensorflow.org'] })).toBe(
            'Allow 1 site: download.tensorflow.org',
        );
    });

    it('carries the hints of the decisions G5 and G6 and the warning for full', () => {
        expect(cardTexts('search').hints).toContain("The agent's web tools read any public page; the page address leaves the platform.");
        expect(cardTexts('domains').hints).toContain('The web tools can use these sites too.');
        expect(cardTexts('packages', ['pip']).hints.join(' ')).toContain('build tools (pip, setuptools, wheel) and install scripts run too.');
        expect(cardTexts('packages', ['npm']).hints.join(' ')).toContain('any version of them');
        expect(cardTexts('full').warning).toBe(FULL_WARNING);
        expect(cardTexts('search').warning).toBeUndefined();
    });

    it('writes the limit line from the clamped values', () => {
        expect(limitsLine({ kind: 'domains', minutes: 30, megabytes: 500 })).toBe(
            'Ends after 30 min or 500 MB, whichever comes first. You can switch it off any time.',
        );
        expect(limitsLine({ kind: 'packages', minutes: 60, megabytes: 4000 })).toBe(
            'Ends when these packages are installed (at the latest after 60 min or 4 GB).',
        );
        expect(switchOnText()).toBe(
            'The agent can reach any address the server can reach, with any program. Ends after 30 min or 500 MB, whichever comes first.',
        );
    });

    it('shows when the request lapses only if the gateway says so', () => {
        expect(expiresText({})).toBe('');
        expect(expiresText({ expires_at: '2026-10-21T14:20:00Z' })).toMatch(/^Request lapses at \d{2}:\d{2}$/);
    });

    it('titles a decided line for every kind', () => {
        expect(decidedTitle({ kind: 'search', by: 'agent' })).toEqual({ title: 'Search the web', summary: 'web tools' });
        expect(decidedTitle({ kind: 'domains', by: 'agent', domains: ['a.org'] })).toEqual({ title: 'Download from 1 site', summary: 'a.org' });
        expect(decidedTitle({ kind: 'packages', by: 'agent', packages: ['pip:torch', 'pip:torchvision'] })).toEqual({
            title: 'Install 2 packages',
            summary: 'torch, torchvision',
        });
        expect(decidedTitle({ kind: 'full', by: 'agent' })).toEqual({ title: 'Full internet access', summary: 'any address' });
    });
});

describe('decided state and ends', () => {
    const decided = '2026-10-21T14:08:00Z';

    it('words approved, rejected and unanswered requests', () => {
        expect(decidedStateText({ state: 'approved', decided_at: decided }, grant())).toMatch(/^approved \d{2}:\d{2} · active until \d{2}:\d{2}$/);
        expect(decidedStateText({ state: 'approved', decided_at: decided }, grant({ kind: 'packages' }))).toMatch(/^approved \d{2}:\d{2} · installing$/);
        expect(decidedStateText({ state: 'rejected', decided_at: decided })).toMatch(/^rejected \d{2}:\d{2}$/);
        expect(decidedStateText({ state: 'expired' })).toBe('no decision in time');
    });

    it('words an ended grant by its reason', () => {
        const ended = (r: InternetGrant['ended_reason']) =>
            decidedStateText({ state: 'approved', decided_at: decided }, grant({ state: 'ended', ended_reason: r, ended_at: '2026-10-21T14:38:00Z' }));
        expect(ended('time')).toMatch(/^ended: time is up \d{2}:\d{2}$/);
        expect(ended('bytes')).toMatch(/^ended: data limit reached \d{2}:\d{2}$/);
        expect(ended('installed')).toMatch(/^ended: packages installed \d{2}:\d{2}$/);
        expect(ended('agent')).toMatch(/^ended by the agent \d{2}:\d{2}$/);
        expect(ended('user')).toMatch(/^switched off \d{2}:\d{2}$/);
    });

    it('gives each end its own icon (A3, A10) and falls back to error', () => {
        expect(endInfo('installed').icon).toBe('TaskAlt');
        expect(endInfo('time').icon).toBe('TimerOff');
        expect(endInfo('bytes').icon).toBe('DataUsage');
        expect(endInfo('user').icon).toBe('PublicOff');
        expect(endInfo('agent').icon).toBe('PublicOff');
        expect(endInfo('error').icon).toBe('ErrorOutline');
        expect(endInfo('something new').icon).toBe('ErrorOutline');
        expect(endInfo(undefined).short).toBe('ended: error');
        expect(endInfo('time').short).toBe('ended: time');
    });

    it('writes the snackbar, with the kind first when other grants were active (A11)', () => {
        const base = { kind: 'search' as const, domains: [], packages: [], max_bytes: 500 * MB };
        expect(endedNotice({ ...base, ended_reason: 'bytes' }, 0)).toBe('Internet access ended: data limit reached (500 MB)');
        expect(endedNotice({ ...base, ended_reason: 'installed' }, 0)).toBe('Internet access ended: packages installed');
        expect(endedNotice({ ...base, ended_reason: 'time' }, 0)).toBe('Internet access ended: time is up');
        expect(endedNotice({ ...base, kind: 'domains', domains: ['a.org'], ended_reason: 'time' }, 1)).toBe(
            'Internet access ended (1 site): time is up',
        );
        expect(endedNotice({ ...base, ended_reason: 'agent' }, 0)).toBe('Internet access ended by the agent');
        expect(endedNotice({ ...base, ended_reason: 'error' }, 0)).toBe('Internet access ended: error');
        expect(endedNotice({ ...base, ended_reason: 'user' }, 0)).toBeUndefined();
    });
});

describe('remaining (G12)', () => {
    it('shows the time left while enough data is left', () => {
        expect(remaining(grant({ kind: 'domains' }), NOW)).toEqual({ kind: 'minutes', minutes: 24 });
        expect(remaining(grant({ bytes: 400 * MB }), NOW)).toEqual({ kind: 'minutes', minutes: 24 });
    });

    it('shows the data left once less than 20 % is left', () => {
        expect(remaining(grant({ bytes: 450 * MB }), NOW)).toEqual({ kind: 'bytes', bytes: 50 * MB });
        expect(remainingText({ kind: 'bytes', bytes: 272 * MB })).toBe('272 MB left');
    });

    it('shows installing for a packages grant and nothing without an end', () => {
        expect(remaining(grant({ kind: 'packages' }), NOW)).toEqual({ kind: 'installing' });
        expect(remaining(grant({ expires_at: undefined }), NOW)).toEqual({ kind: 'none' });
        expect(remainingText({ kind: 'none' })).toBe('');
        expect(remainingText({ kind: 'minutes', minutes: 24 })).toBe('24 min');
    });

    it('picks the grant that ends first', () => {
        const a = grant({ id: 1, expires_at: inMin(24) });
        const b = grant({ id: 2, expires_at: inMin(10) });
        const c = grant({ id: 3, expires_at: inMin(40) });
        expect(firstEnding([a, b, c], NOW)?.id).toBe(2);
        expect(firstEnding([], NOW)).toBeUndefined();
        // a grant about to run out of data ends first
        const low = grant({ id: 4, expires_at: inMin(60), bytes: 480 * MB });
        expect(firstEnding([a, b, low], NOW)?.id).toBe(4);
    });
});

describe('indicator', () => {
    it('is off without an active grant and says how many were blocked', () => {
        const s = indicatorState([], undefined, NOW);
        expect(s).toMatchObject({ mode: 'off', text: 'Internet off', aria: 'Internet access: off', count: 0, blockedText: '' });
        expect(indicatorState([], { count: 4, since: '', last: [] }, NOW).aria).toBe('Internet access: off, 4 blocked');
    });

    it('labels one grant like the design', () => {
        expect(grantLabel(grant(), NOW)).toBe('Search · 24 min');
        expect(grantLabel(grant({ kind: 'domains', domains: ['a.org'], bytes: 228 * MB }), NOW)).toBe('1 site · 24 min');
        expect(grantLabel(grant({ kind: 'domains', domains: ['a.org'], bytes: 450 * MB }), NOW)).toBe('1 site · 50 MB left');
        expect(grantLabel(grant({ kind: 'packages', packages: [pkg(), pkg({ name: 'torchvision' })] }), NOW)).toBe('Packages · installing');
        expect(grantLabel(grant({ kind: 'full', expires_at: inMin(18) }), NOW)).toBe('Full access · 18 min');
    });

    it('describes a single grant in the aria label', () => {
        const s = indicatorState([grant()], undefined, NOW);
        expect(s.aria).toBe('Internet access: search only, 24 minutes left');
        expect(s.mode).toBe('limited');
        expect(s.text).toBe('Search · 24 min');
    });

    it('counts several grants, goes to full mode with a full grant and carries the blocked text', () => {
        const s = indicatorState([grant({ id: 1 }), grant({ id: 2, kind: 'full', expires_at: inMin(10) })], { count: 3, since: '', last: [] }, NOW);
        expect(s.count).toBe(2);
        expect(s.mode).toBe('full');
        expect(s.text).toBe('Full access · 10 min');
        expect(s.blockedText).toBe('3 blocked');
        expect(s.aria).toContain('3 blocked');
    });

    it('ignores grants that are not active', () => {
        expect(indicatorState([grant({ state: 'ended' })], undefined, NOW).mode).toBe('off');
    });

    it('writes the blocked heading', () => {
        expect(blockedHeading({ count: 4, since: '2026-10-21T14:05:00Z' })).toMatch(/^Blocked since \d{2}:\d{2} · 4$/);
        expect(blockedHeading(undefined)).toBe('Blocked');
    });
});

describe('refusals', () => {
    it('words known codes and falls back for unknown ones', () => {
        expect(reasonText('not_listed')).toBe('not in the list');
        expect(reasonText('https_only')).toBe('only https');
        expect(reasonText('sni_mismatch')).toBe('name mismatch');
        expect(reasonText('search_only')).toBe('search only');
        expect(reasonText('access_ended')).toBe('access ended');
        expect(reasonText('internet_off')).toBe('internet off');
        expect(reasonText('package_not_listed')).toBe('not in the list');
        expect(reasonText('version_mismatch')).toBe('other version');
        expect(reasonText('some_new_code')).toBe('some new code');
        expect(reasonText('')).toBe('refused');
        expect(reasonText(undefined)).toBe('refused');
    });

    it('words the too_large refusal', () => {
        expect(reasonText('too_large')).toBe('too large for the sandbox');
        expect(blockedLine({ host: 'pypi.org', reason: 'too_large', package: 'torch' })).toBe(
            'Blocked: pip:torch is too large for the sandbox – use a notebook run',
        );
    });

    it('writes the blocked line under a call', () => {
        expect(blockedLine({ host: 'github.com', reason: 'not_listed' })).toBe('Blocked: github.com is not in the allowed sites');
        expect(blockedLine({ host: 'pypi.org', reason: 'package_not_listed', package: 'opencv-python' })).toBe(
            'Blocked: pip:opencv-python is not in the allowed packages',
        );
        expect(blockedLine({ host: 'arxiv.org', reason: 'search_only' })).toBe('Blocked: arxiv.org – commands stay offline with search only');
        expect(blockedLine({ host: 'x.org', reason: 'internet_off' })).toBe('Blocked: internet access is off for this chat');
        expect(blockedLine({ host: 'x.org', reason: 'access_ended' }, '2026-10-21T14:35:00Z', 'time')).toMatch(
            /^Blocked: internet access ended at \d{2}:\d{2} \(time is up\)$/,
        );
        expect(blockedLine({ host: 'x.org', reason: 'weird_code' })).toBe('Blocked: x.org – weird code');
    });

    it('sums up several refusals under one call', () => {
        expect(blockedGroupText(['github.com', 'raw.githubusercontent.com', 'objects.githubusercontent.com'])).toBe('3 blocked · github.com and 2 more');
        expect(blockedGroupText(['github.com'])).toBe('1 blocked · github.com');
    });

    it('shows a refusal under a call only for commands with a tool call', () => {
        expect(showsUnderCall(conn({ origin: 'exec', tool_call_id: 't1', reason: 'not_listed' }))).toBe(true);
        expect(showsUnderCall(conn({ origin: 'exec', reason: 'not_listed' }))).toBe(false);
        expect(showsUnderCall(conn({ origin: 'pi', tool_call_id: 't1', reason: 'not_listed' }))).toBe(false);
        expect(showsUnderCall(conn({ origin: 'exec', tool_call_id: 't1' }))).toBe(false);
    });
});

describe('activity', () => {
    it('shows the way of the request, UI only for the user', () => {
        expect(viaText('cli')).toBe('CLI');
        expect(viaText('mcp')).toBe('MCP');
        expect(viaText('api')).toBe('API');
        expect(viaText('user')).toBe('UI');
        expect(viaText('gateway')).toBe('–');
        expect(viaText(undefined)).toBe('–');
    });

    it('lists what an access row allows', () => {
        expect(accessList({ kind: 'search', domains: [], packages: [] })).toBe('web tools');
        expect(accessList({ kind: 'domains', domains: ['a.org', 'b.org'], packages: [] })).toBe('a.org, b.org');
        expect(accessList({ kind: 'packages', domains: [], packages: ['pip:torch[x]==2.5.1', 'npm:vite'] })).toBe('torch, vite');
        expect(accessList({ kind: 'full', domains: [], packages: [] })).toBe('any address');
    });

    it('writes the summary lines', () => {
        expect(accessSummaryText(11, 5 * MB, 0)).toBe('11 approvals · 5 MB · 0 blocked');
        expect(accessSummaryText(1, 0, 2)).toBe('1 approval · 0 B · 2 blocked');
        expect(connectionsSummaryText({ count: 31, bytes_down: 2 * 1024 * MB, bytes_up: 0, blocked: 4 })).toBe('31 connections · 2 GB · 4 blocked');
        expect(connectionsSummaryText({ count: 1, bytes_down: 0, bytes_up: 0, blocked: 0 })).toBe('1 connection · 0 B · 0 blocked');
        expect(unlistedText({ bytes: 46 * MB })).toBe('Full access · 46 MB · not listed');
        expect(showMoreText(31, 15)).toBe('Show 16 more');
        expect(showMoreText(10, 10)).toBe('');
    });

    it('names targets without internal host names', () => {
        expect(connectionTarget(conn({ service: 'search', host: 'searxng', count: 6 }))).toEqual({ name: 'web search', detail: '6 requests' });
        expect(connectionTarget(conn({ service: 'index', host: 'pypi.org', method: '*', count: 214 }))).toEqual({
            name: 'pypi index',
            detail: '214 requests',
        });
        expect(connectionTarget(conn({ service: 'index', host: 'registry.npmjs.org', count: 3 })).name).toBe('npm registry');
        expect(connectionTarget(conn({ host: 'arxiv.org' }))).toEqual({ name: 'arxiv.org' });
        expect(connectionTarget(conn({ host: 'example.org', port: 80, path: '/a/b' })).detail).toBe('http://example.org/a/b');
    });

    it('shows a package with chip, version and its parent', () => {
        const row = conn({
            host: 'files.pythonhosted.org',
            origin: 'pkg',
            package: 'torch',
            version: '2.5.1',
            path: '/packages/ab/torch-2.5.1-cp311.whl',
        });
        expect(connectionTarget(row)).toEqual({ name: 'torch 2.5.1', chip: 'pip', detail: 'torch-2.5.1-cp311.whl' });
        expect(connectionTarget({ ...row, parent: 'torchvision', package: 'pillow', version: '11.0.0' })).toEqual({
            name: 'pillow 11.0.0',
            chip: 'pip',
            detail: 'dependency of torchvision',
        });
    });

    it('writes data and result columns', () => {
        expect(connectionData(conn({ bytes_down: MB, bytes_up: 6 * 1024 }))).toBe('↓ 1 MB · ↑ 6 kB');
        expect(connectionData(conn({ bytes_down: MB }))).toBe('↓ 1 MB');
        expect(connectionData(conn())).toBe('–');
        expect(connectionResult(conn())).toEqual({ blocked: false, word: 'allowed', reason: '' });
        expect(connectionResult(conn({ denied: 'blocked: x', reason: 'https_only' }))).toEqual({ blocked: true, word: 'blocked', reason: 'only https' });
        expect(connectionResult(conn({ denied: 'blocked: x' })).reason).toBe('refused');
    });

    it('names the chip of a connection from the page grants map', () => {
        expect(grantChip(undefined)).toBe('');
        expect(grantChip({ kind: 'search', domains: [], packages: [] })).toBe('Search');
        expect(grantChip({ kind: 'domains', domains: ['a.org'], packages: [] })).toBe('1 site');
        expect(grantChip({ kind: 'packages', domains: [], packages: ['pip:torch', 'pip:torchvision'] })).toBe('2 packages');
        expect(grantChip({ kind: 'full', domains: [], packages: [] })).toBe('Full access');
    });
});
