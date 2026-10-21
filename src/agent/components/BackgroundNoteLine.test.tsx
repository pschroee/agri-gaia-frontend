// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The one-line note stands flush with the thinking block (issue #197): no indent, details like the thinking text.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { parseBackgroundNote } from '../background';
import BackgroundNoteLine from './BackgroundNoteLine';

afterEach(cleanup);

const TEXT =
    'Background task bg-3 finished: exit 0, runtime 0:08\n<<<agw-5f0c\nCommand: sleep 8\nLast lines (of 1):\ndone\nagw-5f0c>>>';

describe('BackgroundNoteLine', () => {
    it('has no indent of its own', () => {
        render(<BackgroundNoteLine note={parseBackgroundNote(TEXT)} text={TEXT} />);
        const style = getComputedStyle(screen.getByTestId('agent-background-note'));
        expect(style.paddingLeft).toMatch(/^(0|0px)?$/);
        expect(style.paddingRight).toMatch(/^(0|0px)?$/);
    });

    it('shows its details with the margin and rule of the thinking text', () => {
        render(<BackgroundNoteLine note={parseBackgroundNote(TEXT)} text={TEXT} />);
        fireEvent.click(screen.getByRole('button'));
        const details = screen.getByTitle('Command').parentElement as HTMLElement;
        const style = getComputedStyle(details);
        expect(style.marginLeft).toBe('7px');
        expect(style.paddingLeft).toBe('12px');
        expect(style.borderLeftWidth).toBe('2px');
    });
});
