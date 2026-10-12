// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { approvalEffect, callEffect } from './effect';
import type { Approval } from './types';

describe('callEffect', () => {
    it('takes the gateway class over the method', () => {
        expect(callEffect({ detail: 'GET /train/containers/3/model', effect: 'write' })).toBe('write');
        expect(callEffect({ detail: 'PATCH /datasets/5/toggle-public', effect: 'irreversible' })).toBe('irreversible');
        expect(callEffect({ detail: 'POST /train/config', effect: 'compute' })).toBe('compute');
    });

    it('falls back to the method for older entries', () => {
        expect(callEffect({ detail: 'DELETE /datasets/5' })).toBe('irreversible');
        expect(callEffect({ detail: 'POST /train/containers/3/run' })).toBe('compute');
        expect(callEffect({ detail: 'GET /datasets?limit=2' })).toBe('read');
    });

    it('falls back when the gateway sends an unknown class', () => {
        expect(callEffect({ detail: 'DELETE /datasets/5', effect: 'delete' as 'read' })).toBe('irreversible');
    });

    it('has no class without a method', () => {
        expect(callEffect({ detail: '' })).toBeUndefined();
    });
});

describe('approvalEffect', () => {
    const base: Pick<Approval, 'kind' | 'name' | 'effect'> = { kind: 'platform_write', name: 'DELETE /datasets/9' };

    it('reads the class of platform approvals', () => {
        expect(approvalEffect({ ...base, effect: 'irreversible' })).toBe('irreversible');
        expect(approvalEffect(base)).toBe('irreversible');
    });

    it('has no class for internet access', () => {
        expect(approvalEffect({ kind: 'internet_access', name: 'DELETE /datasets/9', effect: 'write' })).toBeUndefined();
    });
});
