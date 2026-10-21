// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The one-line row of a decided platform call (issue #192): word and colour per state, the summary before the name,
// the time, the link to the activity, and no way to open it.

import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import type { Approval } from '../types';
import PlatformDecidedRow, { platformDecidedOf, platformRowText } from './PlatformDecidedRow';

afterEach(cleanup);

const approval = (over: Partial<Approval> = {}): Approval =>
    ({
        id: 'a1',
        chat_id: 'c1',
        kind: 'platform_write',
        via: 'cli',
        name: 'PATCH /datasets/3',
        size: 0,
        sha256: '',
        content_type: 'application/json',
        state: 'approved',
        created_at: '2026-10-21T10:00:00.000Z',
        decided_at: '2026-10-21T10:01:00.000Z',
        tool_call_id: 't1',
        summary: 'Rename dataset 3 to "b"\nname: a -> b',
        ...over,
    } as Approval);

const show = (a: Approval) =>
    render(
        <MemoryRouter>
            <PlatformDecidedRow approval={a} />
        </MemoryRouter>,
    );

describe('PlatformDecidedRow', () => {
    it('says the state in a word, per state', () => {
        for (const [state, word] of [['approved', 'Approved'], ['rejected', 'Rejected'], ['expired', 'Expired']] as const) {
            show(approval({ state }));
            expect(screen.getByTestId('agent-platform-decided').getAttribute('data-state')).toBe(state);
            expect(screen.getByText(word)).toBeTruthy();
            cleanup();
        }
    });
    it('shows the first line of the summary, else the name', () => {
        expect(platformRowText({ summary: 'Rename dataset 3\nmore', name: 'n' })).toBe('Rename dataset 3');
        expect(platformRowText({ summary: undefined, name: 'PATCH /x' })).toBe('PATCH /x');
        show(approval());
        expect(screen.getByText('Rename dataset 3 to "b"')).toBeTruthy();
    });
    it('links to the activity of the call and does not open', () => {
        show(approval());
        expect(screen.getByRole('link', { name: 'Activity' })).toBeTruthy();
        expect(screen.queryByRole('button')).toBeNull();
    });
    it('takes only decided calls without a row of their own', () => {
        const steps = [{ id: 't1' }];
        expect(platformDecidedOf(steps, [approval()])).toHaveLength(1);
        expect(platformDecidedOf(steps, [approval({ state: 'pending' })])).toHaveLength(0);
        expect(platformDecidedOf(steps, [approval({ notebook: {} as never })])).toHaveLength(0);
        expect(platformDecidedOf(steps, [approval({ tool_call_id: 'zz' })])).toHaveLength(0);
    });
});
