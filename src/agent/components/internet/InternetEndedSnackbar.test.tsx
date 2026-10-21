// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The snackbar at the end of a grant (gateway issue #175, A11): the text, closing, and nothing outside a provider.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const clearEnded = vi.fn();
let handle: unknown;
vi.mock('../../InternetContext', () => ({ useInternetContext: () => handle }));

import InternetEndedSnackbar from './InternetEndedSnackbar';

afterEach(() => {
    cleanup();
    clearEnded.mockReset();
});

describe('InternetEndedSnackbar', () => {
    it('tells that packages were installed and closes', () => {
        handle = {
            clearEnded,
            lastEnded: {
                others: 0,
                grant: { kind: 'packages', domains: [], packages: [], max_bytes: 4 << 30, ended_reason: 'installed' },
            },
        };
        render(<InternetEndedSnackbar />);
        expect(screen.getByRole('status').textContent).toMatch(/Internet access ended: packages installed/);
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(clearEnded).toHaveBeenCalled();
    });

    it('renders nothing outside a provider', () => {
        handle = undefined;
        const { container } = render(<InternetEndedSnackbar />);
        expect(container.textContent).toBe('');
    });
});
