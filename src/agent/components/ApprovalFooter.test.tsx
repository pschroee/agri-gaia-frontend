// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The shared footer of the pending approval cards (issue #190): order, wrapping rule and locking. Run in phase B.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ApprovalFooter from './ApprovalFooter';

afterEach(cleanup);

const names = () => screen.getAllByRole('button').map((b) => b.textContent);

describe('ApprovalFooter', () => {
    it('puts Technical details first, then Reject, then Approve last', () => {
        render(
            <ApprovalFooter technical={{ text: 'POST /x', testId: 't' }} busy={false} onApprove={vi.fn()} onReject={vi.fn()} />,
        );
        const footer = screen.getByTestId('agent-approval-footer');
        const technical = screen.getByTestId('t');
        const buttons = screen.getByTestId('agent-approval-buttons');
        expect(footer.contains(technical) && footer.contains(buttons)).toBe(true);
        expect(technical.compareDocumentPosition(buttons) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(names()).toEqual(['Reject', 'Approve']);
    });

    it('shows only the button group without technical details', () => {
        render(<ApprovalFooter busy={false} onApprove={vi.fn()} onReject={vi.fn()} />);
        expect(screen.queryByText('Technical details')).toBeNull();
        expect(names()).toEqual(['Reject', 'Approve']);
    });

    it('wraps the row and pushes the button group to the right', () => {
        render(<ApprovalFooter busy={false} onApprove={vi.fn()} onReject={vi.fn()} />);
        expect(getComputedStyle(screen.getByTestId('agent-approval-footer')).flexWrap).toBe('wrap');
        expect(getComputedStyle(screen.getByTestId('agent-approval-buttons')).marginLeft).toBe('auto');
    });

    it('locks both buttons while busy', () => {
        render(<ApprovalFooter busy onApprove={vi.fn()} onReject={vi.fn()} />);
        expect((screen.getByRole('button', { name: 'Approve' }) as HTMLButtonElement).disabled).toBe(true);
        expect((screen.getByRole('button', { name: 'Reject' }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('calls the handlers and puts the extra action before the button group', () => {
        const onApprove = vi.fn();
        const onReject = vi.fn();
        render(
            <ApprovalFooter
                start={<button type="button">Extra</button>}
                approveLabel="Allow"
                busy={false}
                onApprove={onApprove}
                onReject={onReject}
            />,
        );
        expect(names()).toEqual(['Extra', 'Reject', 'Allow']);
        fireEvent.click(screen.getByRole('button', { name: 'Allow' }));
        fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
        expect(onApprove).toHaveBeenCalledTimes(1);
        expect(onReject).toHaveBeenCalledTimes(1);
    });
});
