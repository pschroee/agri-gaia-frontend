// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The shared button of the header's status row (issue #221): the tone shows in the colour, never as a dot.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import HeaderStatusButton, { TONE_COLOR } from './HeaderStatusButton';
import type { StatusTone } from './HeaderStatusButton';

afterEach(cleanup);

const draw = (tone: StatusTone, over: Record<string, unknown> = {}) =>
    render(
        <HeaderStatusButton
            icon={<svg data-testid="icon" />}
            label="Plan 3/10"
            tone={tone}
            onClick={vi.fn()}
            ariaLabel="Plan with 10 steps"
            testId="btn"
            {...over}
        />,
    );

describe('HeaderStatusButton', () => {
    it('colours the button by its tone', () => {
        for (const tone of ['default', 'running', 'attention', 'failed'] as const) {
            const { unmount } = draw(tone);
            const el = screen.getByTestId('btn');
            expect(el.getAttribute('data-tone')).toBe(tone);
            expect(getComputedStyle(el).color).not.toBe('');
            expect(TONE_COLOR[tone]).toBeTruthy();
            unmount();
        }
        expect(new Set(Object.values(TONE_COLOR)).size).toBe(4);
    });

    it('draws no dot, no badge and no pulse', () => {
        const { container } = draw('running');
        expect(container.querySelector('.MuiBadge-dot')).toBeNull();
        expect(container.querySelector('.MuiBadge-root')).toBeNull();
    });

    it('is a button with a name, a popup and an expanded state, and reports the click', () => {
        const onClick = vi.fn();
        draw('default', { onClick, open: true });
        const el = screen.getByRole('button', { name: 'Plan with 10 steps' });
        expect(el.getAttribute('aria-haspopup')).toBe('dialog');
        expect(el.getAttribute('aria-expanded')).toBe('true');
        expect(el.textContent).toBe('Plan 3/10');
        fireEvent.click(el);
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('passes data attributes on', () => {
        draw('default', { dataAttrs: { 'data-plan-id': 'p1' } });
        expect(screen.getByTestId('btn').getAttribute('data-plan-id')).toBe('p1');
    });
});
