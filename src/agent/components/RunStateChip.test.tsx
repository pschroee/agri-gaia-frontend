// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The state chip: in a crowded panel header it shows only the dot and the timer (issue #261).

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import RunStateChip from './RunStateChip';

const NOW = Date.parse('2026-10-27T10:00:00.000Z');

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
});
afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

describe('RunStateChip', () => {
    it('shows word and timer by default', () => {
        const { container } = render(<RunStateChip state="working" since={NOW - 353_000} framed />);
        expect(container.textContent).toContain('working');
        expect(container.textContent).toContain('5:53');
        expect(container.querySelector('[data-run-state]')?.getAttribute('aria-label')).toBeNull();
    });

    it('dense shows the timer but not the word, and the aria-label names both', () => {
        const { container } = render(<RunStateChip state="working" since={NOW - 353_000} framed dense />);
        expect(container.textContent).toContain('5:53');
        expect(container.textContent).not.toContain('working');
        expect(screen.getByLabelText('working · 5:53')).toBeTruthy();
    });

    it('dense without a start time keeps the word in the aria-label', () => {
        const { container } = render(<RunStateChip state="waiting" framed dense />);
        expect(container.textContent).toBe('');
        expect(screen.getByLabelText('needs approval')).toBeTruthy();
    });

    it('renders nothing for a ready chat, dense or not', () => {
        const { container } = render(<RunStateChip state="idle" framed dense />);
        expect(container.textContent).toBe('');
        expect(container.querySelector('[data-run-state]')).toBeNull();
    });
});
