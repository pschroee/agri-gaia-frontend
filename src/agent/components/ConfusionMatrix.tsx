// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The confusion matrix of a check card (#249): rows are the true classes, columns the predicted ones. Each cell shows
// the count and, small beneath it, the share of its row; the background is the primary colour with an opacity that
// follows the share, the diagonal is bold. From 11 classes on the matrix starts folded. It is a plain table: no image,
// so the text can be selected, searched and printed.

import { useId, useState } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Collapse from '@mui/material/Collapse';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';

import type { ConfusionView } from '../assess';
import { MONO } from './tokens';

/** The share of a row in percent, without decimals ("0 %" is left out by the caller). */
export function sharePercent(share: number): string {
    return `${Math.round(share * 100)}%`;
}

/** The background of a cell: the platform's green, the more opaque the larger the row's share. */
export function cellBackground(share: number): string | undefined {
    return share > 0 ? `rgba(15, 84, 50, ${(0.08 + share * 0.82).toFixed(2)})` : undefined;
}

const NAME_COL = 72;

function Matrix({ view }: { view: ConfusionView }) {
    return (
        <Table size="small" aria-label="Confusion matrix" data-testid="agent-confusion-matrix" sx={{ tableLayout: 'fixed', width: '100%' }}>
            <TableHead>
                <TableRow>
                    <TableCell sx={{ width: NAME_COL, px: 0.5, py: 0.5, fontSize: 10.5, color: 'text.secondary', lineHeight: '14px' }}>
                        true \ predicted
                    </TableCell>
                    {view.classes.map((c) => (
                        <TableCell
                            key={c}
                            component="th"
                            scope="col"
                            align="center"
                            title={c}
                            sx={{ px: 0.25, py: 0.5, fontSize: 11, fontFamily: MONO, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                            {c}
                        </TableCell>
                    ))}
                </TableRow>
            </TableHead>
            <TableBody>
                {view.rows.map((row) => (
                    <TableRow key={row.name}>
                        <TableCell
                            component="th"
                            scope="row"
                            title={row.name}
                            sx={{ width: NAME_COL, px: 0.5, py: 0.25, fontSize: 11, fontFamily: MONO, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                            {row.name}
                        </TableCell>
                        {row.cells.map((cell, i) => {
                            const col = view.classes[i];
                            const dark = cell.share >= 0.5;
                            return (
                                <TableCell
                                    key={col}
                                    align="center"
                                    data-testid="agent-confusion-cell"
                                    aria-label={`true ${row.name}, predicted ${col}: ${cell.count} of ${row.total}`}
                                    sx={{
                                        px: 0.25,
                                        py: 0.25,
                                        bgcolor: cellBackground(cell.share),
                                        color: dark ? '#fff' : cell.count === 0 ? 'text.disabled' : 'text.primary',
                                        fontVariantNumeric: 'tabular-nums',
                                        lineHeight: 1.15,
                                    }}
                                >
                                    <Box component="span" sx={{ display: 'block', fontSize: 12, fontWeight: cell.diagonal ? 700 : 400 }}>
                                        {cell.count}
                                    </Box>
                                    {cell.count > 0 && (
                                        <Box component="span" sx={{ display: 'block', fontSize: 9.5, opacity: 0.85 }}>
                                            {sharePercent(cell.share)}
                                        </Box>
                                    )}
                                </TableCell>
                            );
                        })}
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}

/** The matrix under the per-class table; folded behind a button from 11 classes on. */
export default function ConfusionMatrix({ view }: { view: ConfusionView }) {
    const [open, setOpen] = useState(!view.folded);
    const id = useId();
    return (
        <Box data-testid="agent-confusion">
            <Typography variant="caption" sx={{ display: 'block', fontWeight: 500, color: 'text.secondary' }}>
                Confusion matrix
            </Typography>
            {view.folded && (
                <Button
                    size="small"
                    onClick={() => setOpen((o) => !o)}
                    aria-expanded={open}
                    aria-controls={id}
                    sx={{ textTransform: 'none', px: 0, justifyContent: 'flex-start' }}
                >
                    {open ? 'Hide confusion matrix' : 'Show confusion matrix'}
                </Button>
            )}
            <Collapse in={open} unmountOnExit id={id}>
                <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mb: 0.5 }}>
                    Rows: true class · columns: predicted class · count, share of the row beneath
                </Typography>
                <Matrix view={view} />
            </Collapse>
        </Box>
    );
}
