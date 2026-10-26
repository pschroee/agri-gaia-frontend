// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The indicator is quiet (#228): refused connections are a grey count, never a red chip or badge.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { InternetBlocked, InternetGrant } from '../../internet';
import type { Chat } from '../../types';

let handle: { loaded: boolean; active: InternetGrant[]; blocked?: InternetBlocked; endGrant: () => Promise<void>; endAll: () => Promise<void> };
vi.mock('../../InternetContext', () => ({ useInternetContext: () => handle }));
vi.mock('../../useChatSettings', () => ({
    useChatSettings: () => ({ busy: undefined, error: undefined, clearError: vi.fn(), setInternet: vi.fn() }),
}));

import InternetIndicator from './InternetIndicator';

afterEach(cleanup);

const MB = 1 << 20;
const grant = (over: Partial<InternetGrant>): InternetGrant => ({
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
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 24 * 60000).toISOString(),
    ...over,
});
const blocked = (count: number): InternetBlocked => ({ count, since: '2026-10-21T12:05:00Z', last: [] });
const chat = { id: 'c1' } as Chat;
const show = (active: InternetGrant[], count: number, compact = false) => {
    handle = {
        loaded: true,
        active,
        blocked: count ? blocked(count) : undefined,
        endGrant: async () => undefined,
        endAll: async () => undefined,
    };
    return render(
        <MemoryRouter>
            <InternetIndicator chat={chat} compact={compact} />
        </MemoryRouter>,
    );
};

describe('InternetIndicator', () => {
    it('shows the blocked count as grey text without a red chip', () => {
        const { container } = show([], 8);
        const button = screen.getByTestId('agent-internet-indicator');
        expect(button.textContent).toContain('Internet off');
        expect(button.textContent).toContain('· 8 blocked');
        expect(button.getAttribute('data-tone')).toBe('default');
        expect(button.getAttribute('data-blocked')).toBe('8');
        expect(container.querySelector('.MuiChip-colorError')).toBeNull();
        expect(container.querySelector('.MuiBadge-colorError')).toBeNull();
    });
    it('uses the attention tone for full access and the running tone for a search grant', () => {
        show([grant({ kind: 'full' })], 0);
        expect(screen.getByTestId('agent-internet-indicator').getAttribute('data-tone')).toBe('attention');
        cleanup();
        show([grant({})], 3);
        expect(screen.getByTestId('agent-internet-indicator').getAttribute('data-tone')).toBe('running');
    });
    it('names further grants as +1 instead of a badge', () => {
        const { container } = show([grant({}), grant({ id: 2, kind: 'full' })], 0);
        expect(screen.getByTestId('agent-internet-indicator').textContent).toContain('+1');
        expect(container.querySelector('.MuiBadge-badge')).toBeNull();
    });
    it('has no red badge in the panel', () => {
        const { container } = show([], 8, true);
        expect(container.querySelector('.MuiBadge-colorError')).toBeNull();
        expect(screen.getByTestId('agent-internet-indicator')).toBeTruthy();
    });
    it('opens the popover on a click', () => {
        show([], 2);
        fireEvent.click(screen.getByTestId('agent-internet-indicator'));
        expect(screen.getByTestId('agent-internet-blocked')).toBeTruthy();
        expect(screen.queryByTestId('agent-internet-confirm')).toBeNull();
    });
    it('asks to switch on when nothing was blocked', () => {
        show([], 0);
        fireEvent.click(screen.getByTestId('agent-internet-indicator'));
        expect(screen.getByTestId('agent-internet-confirm')).toBeTruthy();
    });
});
