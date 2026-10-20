// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The small parts the cards, the tab and the chip of a training search share (gateway issue #168): the state chip, the
// budget meters, the agent's note, the way tag, the state of a trial and the end of a log. States are never told by
// the colour alone — an icon and a word stand next to it.

import { useState } from 'react';

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorIcon from '@mui/icons-material/Error';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import HourglassEmptyOutlinedIcon from '@mui/icons-material/HourglassEmptyOutlined';
import StopCircleOutlinedIcon from '@mui/icons-material/StopCircleOutlined';

import type { SearchPath } from '../../experiments';
import { AGENT_NOTE_LABEL } from '../../notebook';
import { firstErrorLine, type ChipKind, type Meter, type StateView } from '../../searchView';
import { MONO } from '../tokens';

/** The colour of the note label: dark enough on white (4.9:1, design). */
const NOTE_LABEL = '#a15c00';

/** A small ring in the colour of the primary: the sign of something that moves. */
export function Spinner({ size = 12 }: { size?: number }) {
    return <CircularProgress size={size} thickness={5} aria-hidden />;
}

/** The chip of a search state: a dot or an icon and the word. */
export function SearchStateChip({ kind, label }: { kind: ChipKind; label: string }) {
    const icon =
        kind === 'live' ? (
            <Box component="span" sx={{ ml: '8px !important', width: 10, height: 10, borderRadius: '50%', bgcolor: 'primary.main', flex: 'none' }} aria-hidden />
        ) : kind === 'wait' ? (
            <HourglassEmptyOutlinedIcon color="warning" />
        ) : kind === 'ok' ? (
            <CheckCircleIcon color="success" />
        ) : kind === 'error' ? (
            <ErrorOutlineIcon color="error" />
        ) : (
            <StopCircleOutlinedIcon />
        );
    return (
        <Chip
            size="small"
            variant="outlined"
            icon={icon}
            label={label}
            color={kind === 'live' ? 'primary' : kind === 'ok' ? 'success' : kind === 'error' ? 'error' : kind === 'wait' ? 'warning' : 'default'}
            data-testid="agent-search-state"
            sx={{ flex: 'none' }}
        />
    );
}

/** The four meters of a budget as a grid; two by two in the panel, four in a row on the page. */
export function Meters({ meters }: { meters: Meter[] }) {
    return (
        <Box
            data-testid="agent-search-meters"
            sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(148px, 1fr))', gap: '10px 16px', minWidth: 0 }}
        >
            {meters.map((m) => (
                <Box key={m.key} sx={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, fontSize: 12, color: 'text.secondary' }}>
                        <span>{m.label}</span>
                        {m.reached && <Box component="span" sx={{ color: 'warning.dark', fontWeight: 500 }}>reached</Box>}
                    </Box>
                    <Typography sx={{ fontSize: 13, color: m.set ? 'text.primary' : 'text.disabled', overflowWrap: 'anywhere' }}>{m.value}</Typography>
                    <LinearProgress
                        variant="determinate"
                        value={m.pct ?? 0}
                        color={m.reached ? 'warning' : 'primary'}
                        aria-label={m.label}
                        aria-valuetext={m.valueText}
                        sx={{ height: 4, borderRadius: 2, bgcolor: m.pct === null ? 'action.hover' : undefined }}
                    />
                </Box>
            ))}
        </Box>
    );
}

/** The note of the agent: one line with MORE / LESS, marked as not verified. */
export function AgentNote({ text, collapsible = true, testId }: { text: string | undefined; collapsible?: boolean; testId?: string }) {
    const [open, setOpen] = useState(!collapsible);
    if (!text) return null;
    return (
        <Box data-testid={testId ?? 'agent-search-note'} sx={{ borderLeft: '1px dashed', borderColor: 'text.disabled', pl: 1.25, display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
            <Typography sx={{ fontSize: 11.5, fontWeight: 500, color: NOTE_LABEL }}>{AGENT_NOTE_LABEL}</Typography>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, minWidth: 0 }}>
                <Typography
                    sx={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 13,
                        fontStyle: 'italic',
                        color: 'text.secondary',
                        whiteSpace: open ? 'pre-wrap' : 'nowrap',
                        overflow: open ? 'visible' : 'hidden',
                        textOverflow: 'ellipsis',
                        overflowWrap: 'anywhere',
                    }}
                >
                    {text}
                </Typography>
                {collapsible && (
                    <Box
                        component="button"
                        type="button"
                        onClick={() => setOpen((o) => !o)}
                        aria-expanded={open}
                        sx={{ border: 0, background: 'none', p: '0 2px', font: 'inherit', fontSize: 12, fontWeight: 500, letterSpacing: '.4px', textTransform: 'uppercase', color: 'primary.main', cursor: 'pointer', flex: 'none' }}
                    >
                        {open ? 'Less' : 'More'}
                    </Box>
                )}
            </Box>
        </Box>
    );
}

/** TEMPLATE or NOTEBOOK; a run without a search is "single run". */
export function WayTag({ path, single }: { path: SearchPath; single?: boolean }) {
    return (
        <Box
            component="span"
            sx={{ fontFamily: MONO, fontSize: 11, letterSpacing: '.5px', px: 0.75, py: '1px', border: 1, borderColor: 'divider', borderRadius: 0.5, color: 'text.secondary', flex: 'none' }}
        >
            {single ? 'SINGLE RUN' : path === 'notebook' ? 'NOTEBOOK' : 'TEMPLATE'}
        </Box>
    );
}

/** The state of a trial: a spinner or an icon and the word. */
export function TrialStateMark({ view, size = 18 }: { view: StateView; size?: number }) {
    const color = view.tone === 'ok' ? 'success.main' : view.tone === 'error' ? 'error.main' : view.tone === 'primary' ? 'primary.main' : 'text.disabled';
    const icon =
        view.icon === 'spinner' ? (
            <Spinner size={size - 6} />
        ) : view.icon === 'done' ? (
            <CheckCircleOutlineIcon sx={{ fontSize: size, color }} aria-hidden />
        ) : view.icon === 'failed' ? (
            <ErrorIcon sx={{ fontSize: size, color }} aria-hidden />
        ) : view.icon === 'stopped' ? (
            <StopCircleOutlinedIcon sx={{ fontSize: size, color }} aria-hidden />
        ) : (
            <BlockOutlinedIcon sx={{ fontSize: size, color }} aria-hidden />
        );
    return (
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: view.tone === 'error' ? 'error.dark' : 'text.primary', fontSize: 13, whiteSpace: 'nowrap' }}>
            {icon}
            {view.label}
        </Box>
    );
}

/** The end of a log: monospace lines, from the first error on marked (icon-free, tinted and bold). */
export function LogBox({
    lines,
    label,
    wrap,
    maxHeight,
    live,
}: {
    lines: string[];
    label: string;
    /** Lines wrap (the panel); otherwise they scroll sideways. */
    wrap?: boolean;
    maxHeight?: number;
    live?: boolean;
}) {
    const err = firstErrorLine(lines);
    return (
        <Box
            role="log"
            tabIndex={0}
            aria-label={label}
            aria-live={live ? 'off' : undefined}
            data-testid="agent-search-log"
            sx={{ bgcolor: 'grey.100', borderRadius: 1, py: 1, fontFamily: MONO, fontSize: 11.5, lineHeight: '18px', color: 'text.secondary', overflow: 'auto', maxHeight }}
        >
            {lines.length === 0 ? (
                <Box sx={{ px: 1.25, color: 'text.disabled' }}>No log yet.</Box>
            ) : (
                lines.map((l, i) => (
                    <Box
                        key={i}
                        sx={{
                            px: 1.25,
                            whiteSpace: wrap ? 'pre-wrap' : 'pre',
                            overflowWrap: wrap ? 'anywhere' : undefined,
                            ...(err >= 0 && i >= err ? (theme) => ({ bgcolor: alpha(theme.palette.error.main, 0.08), color: theme.palette.error.dark }) : {}),
                        }}
                    >
                        {l === '' ? ' ' : l}
                    </Box>
                ))
            )}
        </Box>
    );
}

/** The sign "reconnecting" over the values that stay as they were. */
export function ReconnectingLine({ time }: { time?: string }) {
    return (
        <Box role="status" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 12, color: 'text.secondary' }}>
            <CircularProgress size={10} thickness={6} color="inherit" aria-hidden />
            <span>{`Reconnecting…${time ? ` · showing the last values from ${time}` : ''}`}</span>
        </Box>
    );
}
