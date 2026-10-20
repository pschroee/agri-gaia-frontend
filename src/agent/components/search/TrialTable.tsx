// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The table of the trials (gateway issue #168, design c1/c2/c3): one column per parameter of the search space (the
// real names, G9), the score of the saved model with its epoch as a tooltip (A1), the best trial tinted with a star,
// the winner as a chip, the selected row with a bar on the left. The table scrolls sideways and keeps ★ and # in
// place (A11, G18); the settings every trial shares stand in a line above it (G19); rows are reachable by keyboard.

import { KeyboardEvent, useState } from 'react';

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import StarIcon from '@mui/icons-material/Star';
import StopCircleOutlinedIcon from '@mui/icons-material/StopCircleOutlined';
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined';

import type { Search, Trial } from '../../experiments';
import { pathWord, rowMenu, scoreTitle, spaceColumns } from '../../experimentsTab';
import type { RowGroup, TrialRow } from '../../experimentsTab';
import { durationText, epochCell, metricWords, paramValue, scoreText, trialStateView } from '../../searchView';
import type { StateView } from '../../searchView';
import { agentColors, MONO } from '../tokens';

/** Symbol and word of a state; never the colour alone. */
export function StateCell({ view }: { view: StateView }) {
    const color = view.tone === 'error' ? 'error' : view.tone === 'ok' ? 'success' : view.tone === 'primary' ? 'primary' : 'disabled';
    const icon =
        view.icon === 'spinner' ? (
            <CircularProgress size={14} thickness={5} aria-hidden />
        ) : view.icon === 'done' ? (
            <CheckCircleIcon fontSize="small" color={color} />
        ) : view.icon === 'failed' ? (
            <ErrorIcon fontSize="small" color={color} />
        ) : view.icon === 'stopped' ? (
            <StopCircleOutlinedIcon fontSize="small" color={color} />
        ) : (
            <BlockOutlinedIcon fontSize="small" color={color} />
        );
    return (
        <Box sx={{ display: 'inline-flex', alignItems: 'center', columnGap: 0.75 }}>
            {icon}
            <span>{view.label}</span>
        </Box>
    );
}

const stickyStar = { position: 'sticky', left: 0, zIndex: 2, bgcolor: 'background.paper', width: 28, minWidth: 28, px: 0.5 } as const;
const stickyIdx = { position: 'sticky', left: 28, zIndex: 2, bgcolor: 'background.paper', width: 40, minWidth: 40, px: 0.5 } as const;

type Props = {
    /** The search whose space gives the columns; undefined for the group of single runs. */
    search?: Search;
    group: RowGroup;
    selectedId?: string;
    stopping: Record<string, true>;
    showWay: boolean;
    onSelect: (t: Trial) => void;
    onStop: (search: Search, t: Trial) => void;
};

/** The table of one group of rows. */
export default function TrialTable({ search, group, selectedId, stopping, showWay, onSelect, onStop }: Props) {
    const cols = spaceColumns(search);
    const ended = search?.state === 'ended';
    const words = metricWords(search?.objective);
    const [menu, setMenu] = useState<{ el: HTMLElement; row: TrialRow }>();
    const key = (e: KeyboardEvent, t: Trial) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(t);
        }
    };
    const m = menu ? rowMenu(menu.row, search) : undefined;
    return (
        <TableContainer sx={{ overflowX: 'auto' }} data-testid="trial-table">
            <Table size="small" stickyHeader aria-label={group.title}>
                <TableHead>
                    <TableRow>
                        <TableCell sx={stickyStar} aria-label="Best" />
                        <TableCell sx={stickyIdx}>#</TableCell>
                        {showWay && <TableCell>Way</TableCell>}
                        {cols.map((c) => (
                            <TableCell key={c} sx={{ fontFamily: MONO, fontSize: 12 }}>
                                {c}
                            </TableCell>
                        ))}
                        <TableCell align="right">{search ? words.abbr : 'Val.'}</TableCell>
                        {!ended && <TableCell>Epoch</TableCell>}
                        <TableCell>Duration</TableCell>
                        <TableCell>State</TableCell>
                        <TableCell sx={{ maxWidth: 140 }}>Agent&apos;s note</TableCell>
                        <TableCell padding="checkbox" aria-label="Actions" />
                    </TableRow>
                </TableHead>
                <TableBody>
                    {group.rows.map((r) => {
                        const t = r.trial;
                        const selected = t.id === selectedId;
                        const failed = t.state === 'failed';
                        const view = trialStateView(t, !!stopping[t.id]);
                        const bg = r.best ? 'rgba(15, 84, 50, 0.05)' : failed ? agentColors.redTint : undefined;
                        return (
                            <TableRow
                                key={t.id}
                                hover
                                selected={selected}
                                tabIndex={0}
                                aria-selected={selected}
                                data-testid={`trial-row-${t.id}`}
                                onClick={() => onSelect(t)}
                                onKeyDown={(e) => key(e, t)}
                                sx={{
                                    cursor: 'pointer',
                                    bgcolor: bg,
                                    '& td': { borderBottom: 1, borderColor: 'divider' },
                                    '& > td:first-of-type': { boxShadow: selected ? `inset 3px 0 0 ${agentColors.green}` : undefined },
                                    '& > td.sticky': { bgcolor: bg ?? 'background.paper' },
                                }}
                            >
                                <TableCell className="sticky" sx={stickyStar}>
                                    {r.best && <StarIcon fontSize="small" color="primary" titleAccess="Best so far" />}
                                </TableCell>
                                <TableCell className="sticky" sx={stickyIdx}>
                                    {r.label}
                                </TableCell>
                                {showWay && <TableCell>{pathWord(t.path)}</TableCell>}
                                {cols.map((c) => (
                                    <TableCell key={c} sx={{ fontFamily: MONO, fontSize: 12, whiteSpace: 'nowrap' }}>
                                        {c in (t.params ?? {}) ? paramValue(t.params[c]) : '–'}
                                    </TableCell>
                                ))}
                                <TableCell align="right" sx={{ fontWeight: r.best ? 600 : 400 }} title={scoreTitle(t)}>
                                    {scoreText(t.score, search?.objective)}
                                </TableCell>
                                {!ended && <TableCell sx={{ whiteSpace: 'nowrap' }}>{epochCell(t)}</TableCell>}
                                <TableCell sx={{ whiteSpace: 'nowrap' }}>{durationText(t.duration_s)}</TableCell>
                                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                                    <StateCell view={view} />
                                    {r.winner && <Chip size="small" color="primary" label="Winner" sx={{ ml: 1, height: 20 }} />}
                                </TableCell>
                                <TableCell sx={{ maxWidth: 140 }}>
                                    <Typography noWrap sx={{ fontSize: 12, fontStyle: 'italic', color: 'text.secondary' }} title={t.note}>
                                        {t.note ?? ''}
                                    </Typography>
                                </TableCell>
                                <TableCell padding="checkbox">
                                    <IconButton
                                        size="small"
                                        aria-label={`Actions for ${t.idx > 0 ? `trial ${t.idx}` : `run ${t.seq}`}`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setMenu({ el: e.currentTarget, row: r });
                                        }}
                                    >
                                        <MoreVertIcon fontSize="small" />
                                    </IconButton>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
            <Menu anchorEl={menu?.el} open={!!menu} onClose={() => setMenu(undefined)}>
                {m?.adopt && menu && (
                    <MenuItem
                        onClick={() => {
                            // the confirmation lives in the controls of the head, which offer the selected trial
                            onSelect(menu.row.trial);
                            setMenu(undefined);
                        }}
                    >
                        Adopt as result…
                    </MenuItem>
                )}
                {menu && (
                    <MenuItem
                        onClick={() => {
                            onSelect(menu.row.trial);
                            setMenu(undefined);
                        }}
                    >
                        Show details
                    </MenuItem>
                )}
                {m?.stop && menu && search && (
                    <MenuItem
                        onClick={() => {
                            onStop(search, menu.row.trial);
                            setMenu(undefined);
                        }}
                    >
                        Stop trial
                    </MenuItem>
                )}
            </Menu>
        </TableContainer>
    );
}
