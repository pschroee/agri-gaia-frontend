// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import { interactiveLoginUrl, loginReturnTarget } from './login';

describe('loginReturnTarget', () => {
    it('returns to the platform page with query and fragment', () => {
        expect(loginReturnTarget({ pathname: '/ai-agent', search: '?tab=status', hash: '' })).toBe('/ai-agent?tab=status');
        expect(loginReturnTarget({ pathname: '/datasets/12', search: '', hash: '#files' })).toBe('/datasets/12#files');
        expect(loginReturnTarget({ pathname: '/' })).toBe('/');
    });

    it('falls back to /agent/ for paths the gateway would refuse or that belong to it', () => {
        for (const pathname of [
            '',
            'ai-agent',
            '//evil.com',
            '/\\evil.com',
            '/%2F%2Fevil.com',
            '/%5cevil.com',
            '/a/%2e%2e/b',
            '/a/../b',
            '/a b',
            '/agent',
            '/agent/oidc/login',
            `/${'a'.repeat(600)}`,
        ]) {
            expect(loginReturnTarget({ pathname }), pathname).toBe('/agent/');
        }
        expect(loginReturnTarget({ pathname: '/x', search: '?a=\\b' })).toBe('/agent/');
    });

    it('keeps other /agent… pages of the platform', () => {
        expect(loginReturnTarget({ pathname: '/agentx' })).toBe('/agentx');
    });
});

describe('interactiveLoginUrl', () => {
    it('encodes the return target', () => {
        expect(interactiveLoginUrl('/ai-agent?tab=status')).toBe('/agent/oidc/login?return=%2Fai-agent%3Ftab%3Dstatus');
        expect(interactiveLoginUrl()).toBe('/agent/oidc/login?return=%2Fagent%2F');
    });
});
