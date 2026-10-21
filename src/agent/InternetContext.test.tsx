// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useInternetContext } from './InternetContext';

describe('useInternetContext', () => {
    it('is undefined outside an InternetProvider', () => {
        const { result } = renderHook(() => useInternetContext());
        expect(result.current).toBeUndefined();
    });
});
