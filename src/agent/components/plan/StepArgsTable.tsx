// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The arguments of a plan step as a table (issue #221): name and value, a placeholder with the object it stands for.

import Link from '@mui/material/Link';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';

import type { ArgRow } from '../../planDetail';
import { MONO } from '../tokens';

const cellSx = { py: 0.5, px: 1, fontSize: 12, verticalAlign: 'top' } as const;

export default function StepArgsTable({ rows }: { rows: ArgRow[] }) {
    if (rows.length === 0) return null;
    return (
        <Table size="small" data-testid="agent-plan-step-args" sx={{ tableLayout: 'fixed' }}>
            <TableHead>
                <TableRow>
                    <TableCell sx={{ ...cellSx, width: '34%', color: 'text.secondary', fontWeight: 500 }}>Name</TableCell>
                    <TableCell sx={{ ...cellSx, color: 'text.secondary', fontWeight: 500 }}>Value</TableCell>
                </TableRow>
            </TableHead>
            <TableBody>
                {rows.map((r, i) => (
                    <TableRow key={`${r.name}:${i}`}>
                        <TableCell sx={{ ...cellSx, overflowWrap: 'anywhere' }}>{r.name}</TableCell>
                        <TableCell sx={{ ...cellSx, fontFamily: MONO, overflowWrap: 'anywhere' }}>
                            {r.value}
                            {r.ref && (
                                <Typography
                                    component="div"
                                    data-testid="agent-plan-step-arg-ref"
                                    data-known={r.ref.known ? 'true' : 'false'}
                                    sx={{ fontSize: 12, fontFamily: 'inherit', color: r.ref.known ? 'text.primary' : 'text.secondary' }}
                                >
                                    {r.ref.href ? (
                                        <Link href={r.ref.href} underline="always" sx={{ fontSize: 12 }}>
                                            {r.ref.text}
                                        </Link>
                                    ) : (
                                        r.ref.text
                                    )}
                                </Typography>
                            )}
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}
