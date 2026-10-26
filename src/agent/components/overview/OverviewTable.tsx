// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';
import TableSortLabel from '@mui/material/TableSortLabel';
import type { KeyboardEvent, ReactNode } from 'react';

import { agentColors } from '../tokens';

/** undefined = the default order of the list. */
export type OverviewSort = { by: string; order: 'asc' | 'desc' } | undefined;

export type OverviewColumn<R> = {
    id: string;
    /** A text, or a text with a hint (the column "Plan" of the plans tab). */
    label: ReactNode;
    width?: number | string;
    minWidth?: number;
    align?: 'left' | 'right';
    /** Hidden below this width (MUI breakpoint); always shown when not given. */
    hideBelow?: 'md' | 'lg' | 'xl';
    sortable?: boolean;
    /** Order of the first click on the header; `asc` if not given. */
    defaultOrder?: 'asc' | 'desc';
    render: (row: R, now: number) => ReactNode;
};

export type OverviewTableProps<R> = {
    columns: OverviewColumn<R>[];
    rows: R[];
    rowKey: (r: R) => string;
    rowLabel: (r: R) => string;
    rowTone?: (r: R) => 'active' | 'attention' | undefined;
    /** Becomes `data-<key>` on the row. */
    rowData?: (r: R) => Record<string, string>;
    onOpen: (r: R) => void;
    sort: OverviewSort;
    onSort: (s: OverviewSort) => void;
    /** From 0. */
    page: number;
    pageSize: number;
    total: number;
    onPage: (page: number, pageSize: number) => void;
    loading: boolean;
    error?: string;
    onRetry?: () => void;
    empty: ReactNode;
    now: number;
    ariaLabel: string;
    testId?: string;
};

export const PAGE_SIZES = [25, 50, 100];

/** The sort a click on a header gives: a new column starts with its default order, the same column turns around. */
export function nextSort<R>(current: OverviewSort, col: OverviewColumn<R>): OverviewSort {
    if (current?.by === col.id) return { by: col.id, order: current.order === 'asc' ? 'desc' : 'asc' };
    return { by: col.id, order: col.defaultOrder ?? 'asc' };
}

/** The style that hides a column below its breakpoint. */
const hideSx = (c: { hideBelow?: 'md' | 'lg' | 'xl' }) =>
    c.hideBelow ? { display: { xs: 'none', [c.hideBelow]: 'table-cell' } } : {};

const TONE_STYLE = {
    active: { borderLeft: `3px solid ${agentColors.green}` },
    attention: { borderLeft: `3px solid ${agentColors.amber}` },
} as const;

/** The table of an overview: sortable header, clickable rows, pages, loading, error and empty state. */
export default function OverviewTable<R>(p: OverviewTableProps<R>) {
    const testId = p.testId ?? 'overview-table';
    const key = (e: KeyboardEvent, r: R) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            p.onOpen(r);
        }
    };
    if (p.loading && p.rows.length === 0) {
        return (
            <Box data-testid="overview-loading" sx={{ display: 'grid', gap: 1 }}>
                {[0, 1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} variant="rectangular" height={56} sx={{ borderRadius: 1 }} />
                ))}
            </Box>
        );
    }
    if (p.error && p.rows.length === 0) {
        return (
            <Alert
                severity="error"
                data-testid="overview-error"
                action={
                    p.onRetry && (
                        <Button color="inherit" size="small" onClick={p.onRetry}>
                            Retry
                        </Button>
                    )
                }
            >
                {p.error}
            </Alert>
        );
    }
    if (p.rows.length === 0 && p.total === 0) return <>{p.empty}</>;
    return (
        <Paper variant="outlined" data-testid={testId}>
            <TableContainer sx={{ overflowX: 'auto' }}>
                <Table size="medium" aria-label={p.ariaLabel} sx={{ tableLayout: 'fixed', minWidth: 1100 }}>
                    <TableHead>
                        <TableRow>
                            {p.columns.map((c) => (
                                <TableCell
                                    key={c.id}
                                    align={c.align ?? 'left'}
                                    sortDirection={p.sort?.by === c.id ? p.sort.order : false}
                                    sx={{
                                        width: c.width,
                                        minWidth: c.minWidth,
                                        fontWeight: 500,
                                        whiteSpace: 'nowrap',
                                        ...hideSx(c),
                                    }}
                                >
                                    {c.sortable ? (
                                        <TableSortLabel
                                            active={p.sort?.by === c.id}
                                            direction={p.sort?.by === c.id ? p.sort.order : c.defaultOrder ?? 'asc'}
                                            onClick={() => p.onSort(nextSort(p.sort, c))}
                                        >
                                            {c.label}
                                        </TableSortLabel>
                                    ) : (
                                        c.label
                                    )}
                                </TableCell>
                            ))}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {p.rows.map((r) => {
                            const tone = p.rowTone?.(r);
                            const data = Object.fromEntries(
                                Object.entries(p.rowData?.(r) ?? {}).map(([k, v]) => [`data-${k}`, v]),
                            );
                            return (
                                <TableRow
                                    key={p.rowKey(r)}
                                    hover
                                    tabIndex={0}
                                    role="row"
                                    aria-label={`Open ${p.rowLabel(r)}`}
                                    data-testid="overview-row"
                                    data-tone={tone ?? ''}
                                    {...data}
                                    onClick={() => p.onOpen(r)}
                                    onKeyDown={(e) => key(e, r)}
                                    sx={{
                                        cursor: 'pointer',
                                        height: 56,
                                        bgcolor: tone === 'active' ? 'rgba(15,84,50,0.04)' : undefined,
                                        '&:focus-visible': {
                                            outline: `2px solid ${agentColors.green}`,
                                            outlineOffset: -2,
                                        },
                                    }}
                                >
                                    {p.columns.map((c, i) => (
                                        <TableCell
                                            key={c.id}
                                            align={c.align ?? 'left'}
                                            sx={{
                                                py: 0.75,
                                                overflow: 'hidden',
                                                ...hideSx(c),
                                                ...(i === 0 && tone ? TONE_STYLE[tone] : {}),
                                            }}
                                        >
                                            {c.render(r, p.now)}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </TableContainer>
            <TablePagination
                component="div"
                data-testid="overview-pagination"
                count={p.total}
                page={p.page}
                rowsPerPage={p.pageSize}
                rowsPerPageOptions={
                    PAGE_SIZES.includes(p.pageSize) ? PAGE_SIZES : [...PAGE_SIZES, p.pageSize].sort((a, b) => a - b)
                }
                labelRowsPerPage="Rows per page"
                onPageChange={(_, page) => p.onPage(page, p.pageSize)}
                onRowsPerPageChange={(e) => p.onPage(0, Number(e.target.value))}
            />
        </Paper>
    );
}
