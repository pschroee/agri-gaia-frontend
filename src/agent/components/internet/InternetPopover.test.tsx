// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { InternetGrant } from '../../internet';
import InternetPopover, { type InternetPopoverProps } from './InternetPopover';

const MB = 1 << 20;
const now = Date.parse('2026-10-21T12:10:00Z');
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
    bytes: 18 * MB,
    blocked: 0,
    created_at: '2026-10-21T12:00:00Z',
    expires_at: new Date(now + 24 * 60000).toISOString(),
    ...over,
});

function show(over: Partial<InternetPopoverProps> = {}) {
    const props: InternetPopoverProps = {
        anchorEl: document.body,
        open: true,
        onClose: vi.fn(),
        chatId: 'c1',
        active: [grant({}), grant({ id: 2, kind: 'domains', domains: ['download.tensorflow.org'] })],
        blocked: {
            count: 4,
            since: '2026-10-21T12:05:00Z',
            last: [
                { host: 'github.com', origin: 'exec', reason: 'not_listed', denied: '', at: '2026-10-21T12:10:00Z' },
            ],
        },
        now,
        onEndGrant: vi.fn().mockResolvedValue(undefined),
        onEndAll: vi.fn().mockResolvedValue(undefined),
        ...over,
    };
    render(
        <MemoryRouter>
            <InternetPopover {...props} />
        </MemoryRouter>,
    );
    return props;
}

describe('InternetPopover', () => {
    it('lists the grants, ends one and all of them', () => {
        const p = show();
        expect(screen.getByText('2 active')).toBeTruthy();
        expect(screen.getByText('download.tensorflow.org')).toBeTruthy();
        expect(screen.getByText('Show all 4 in Activity')).toBeTruthy();
        fireEvent.click(screen.getByLabelText('Switch off web search'));
        expect(p.onEndGrant).toHaveBeenCalledWith(1);
        fireEvent.click(screen.getByText('Switch all off'));
        expect(p.onEndAll).toHaveBeenCalled();
    });
    it('shows the empty state without a demo reset and without a switch-all button', () => {
        show({ active: [], blocked: undefined });
        expect(screen.getByText(/No internet access in this chat/)).toBeTruthy();
        expect(screen.getByText('Nothing blocked.')).toBeTruthy();
        expect(screen.queryByText(/reset demo/i)).toBeNull();
        expect(screen.queryByText('Switch all off')).toBeNull();
    });
    it('asks before switching full access on', () => {
        const onSwitchOn = vi.fn();
        const p = show({ active: [], confirmSwitchOn: true, onSwitchOn });
        expect(screen.getByText('Switch on full access?')).toBeTruthy();
        fireEvent.click(screen.getByText('Cancel'));
        expect(p.onClose).toHaveBeenCalled();
        fireEvent.click(screen.getByText('Switch on'));
        expect(onSwitchOn).toHaveBeenCalled();
    });
});
