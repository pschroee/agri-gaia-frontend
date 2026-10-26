// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import OverviewTable, { nextSort } from './OverviewTable';
import type { OverviewColumn, OverviewTableProps } from './OverviewTable';

afterEach(cleanup);

type Row = { id: string; name: string; chat: string; tone?: 'active' | 'attention' };

const rows: Row[] = [
    { id: 'r1', name: 'First', chat: 'Chat A', tone: 'active' },
    { id: 'r2', name: 'Second', chat: 'Chat B' },
];

function setup(over: Partial<OverviewTableProps<Row>> = {}, onChat = vi.fn()) {
    const columns: OverviewColumn<Row>[] = [
        { id: 'name', label: 'Name', sortable: true, render: (r) => r.name },
        {
            id: 'chat',
            label: 'Chat',
            sortable: true,
            defaultOrder: 'desc',
            render: (r) => (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        onChat(r.id);
                    }}
                >
                    {r.chat}
                </button>
            ),
        },
        { id: 'plain', label: 'Plain', render: () => 'x' },
    ];
    const props: OverviewTableProps<Row> = {
        columns,
        rows,
        rowKey: (r) => r.id,
        rowLabel: (r) => r.name,
        rowTone: (r) => r.tone,
        rowData: (r) => ({ id: r.id }),
        onOpen: vi.fn(),
        sort: undefined,
        onSort: vi.fn(),
        page: 0,
        pageSize: 25,
        total: 2,
        onPage: vi.fn(),
        loading: false,
        empty: <div data-testid="overview-empty">Nothing</div>,
        now: 0,
        ariaLabel: 'Runs',
        ...over,
    };
    render(<OverviewTable {...props} />);
    return props;
}

describe('OverviewTable', () => {
    it('turns a sorted header around and starts a new column with its default order', () => {
        expect(nextSort(undefined, { id: 'name', label: '', render: () => null })).toEqual({ by: 'name', order: 'asc' });
        expect(nextSort({ by: 'name', order: 'asc' }, { id: 'name', label: '', render: () => null })).toEqual({ by: 'name', order: 'desc' });
        expect(nextSort({ by: 'name', order: 'desc' }, { id: 'chat', label: '', defaultOrder: 'desc', render: () => null })).toEqual({ by: 'chat', order: 'desc' });
        const p = setup({ sort: { by: 'name', order: 'asc' } });
        fireEvent.click(screen.getByText('Name'));
        expect(p.onSort).toHaveBeenCalledWith({ by: 'name', order: 'desc' });
        fireEvent.click(screen.getByText('Chat'));
        expect(p.onSort).toHaveBeenLastCalledWith({ by: 'chat', order: 'desc' });
    });

    it('has no sort control on a column that is not sortable', () => {
        setup();
        expect(within(screen.getByText('Plain').closest('th') as HTMLElement).queryByRole('button')).toBeNull();
    });

    it('opens a row by click and by Enter', () => {
        const p = setup();
        const row = screen.getAllByTestId('overview-row')[0];
        expect(row.getAttribute('data-id')).toBe('r1');
        expect(row.getAttribute('aria-label')).toBe('Open First');
        fireEvent.click(row);
        expect(p.onOpen).toHaveBeenCalledWith(rows[0]);
        fireEvent.keyDown(screen.getAllByTestId('overview-row')[1], { key: 'Enter' });
        expect(p.onOpen).toHaveBeenLastCalledWith(rows[1]);
    });

    it('does not open the row when an inner control stops the click', () => {
        const onChat = vi.fn();
        const p = setup({}, onChat);
        fireEvent.click(screen.getByText('Chat A'));
        expect(onChat).toHaveBeenCalledWith('r1');
        expect(p.onOpen).not.toHaveBeenCalled();
    });

    it('marks an active row with a border', () => {
        setup();
        const [a, b] = screen.getAllByTestId('overview-row');
        expect(a.getAttribute('data-tone')).toBe('active');
        expect(b.getAttribute('data-tone')).toBe('');
        expect(getComputedStyle(a.querySelector('td') as HTMLElement).borderLeftWidth).toBe('3px');
    });

    it('shows loading, error with retry, and the empty state', () => {
        setup({ rows: [], total: 0, loading: true });
        expect(screen.getAllByTestId('overview-loading').length).toBe(1);
        cleanup();
        const p = setup({ rows: [], total: 0, error: 'Could not load', onRetry: vi.fn() });
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(p.onRetry).toHaveBeenCalled();
        cleanup();
        setup({ rows: [], total: 0 });
        expect(screen.getByTestId('overview-empty')).toBeTruthy();
    });

    it('keeps the rows on screen when a later load fails', () => {
        setup({ error: 'Could not load' });
        expect(screen.getAllByTestId('overview-row').length).toBe(2);
        expect(screen.queryByTestId('overview-error')).toBeNull();
    });

    it('goes to the next page and back to page 0 with a new page size', () => {
        const p = setup({ total: 80 });
        expect(screen.getByTestId('overview-pagination').textContent).toContain('Rows per page');
        fireEvent.click(screen.getByRole('button', { name: /next page/i }));
        expect(p.onPage).toHaveBeenCalledWith(1, 25);
    });
});
