// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

afterEach(cleanup);

import { LogBox } from './SearchParts';

describe('LogBox', () => {
    it('tints the lines from the first error on', () => {
        render(<LogBox label="Log" lines={['epoch 1/20 loss 1.12', 'RuntimeError: CUDA out of memory.', 'exit code 1']} />);
        const rows = Array.from(screen.getByRole('log').children) as HTMLElement[];
        const bg = (e: HTMLElement) => getComputedStyle(e).backgroundColor;
        expect(bg(rows[0])).not.toBe(bg(rows[1]));
        expect(bg(rows[1])).toBe(bg(rows[2]));
    });
});
