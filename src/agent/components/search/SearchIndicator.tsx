// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The chip "Search" in the header of the chat (gateway issue #168, design d): "Search · 3/6 · best 0.86", beside the
// plan chip. A click opens a popover with the searches of the chat; a row jumps to the card in the chat, the footer
// opens the tab Experiments. Shown only while the chat has a search.

import { useRef, useState } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import Popover from '@mui/material/Popover';
import Typography from '@mui/material/Typography';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import HourglassEmptyOutlinedIcon from '@mui/icons-material/HourglassEmptyOutlined';

import { chipOf } from '../../searchChip';
import type { SearchBook } from '../../searchChip';
import type { ChipKind } from '../../searchView';
import { OpenInExperiments, searchCardId } from './SearchCard';

function Mark({ kind, size = 16 }: { kind: ChipKind; size?: number }) {
    if (kind === 'live') return <CircularProgress size={size - 4} thickness={6} aria-hidden />;
    if (kind === 'wait') return <HourglassEmptyOutlinedIcon color="warning" sx={{ fontSize: size }} aria-hidden />;
    if (kind === 'error') return <ErrorOutlineIcon color="error" sx={{ fontSize: size }} aria-hidden />;
    return <CheckCircleOutlineIcon color="success" sx={{ fontSize: size }} aria-hidden />;
}

/** Scrolls to the card of a search in the chat and puts the focus on it; false when the view shows none. */
export function scrollToSearchCard(searchId: string, root: Document = document): boolean {
    const el = root.getElementById(searchCardId(searchId));
    if (!el) return false;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.focus({ preventScroll: true });
    return true;
}

export default function SearchIndicator({ book, variant, chatId }: { book: SearchBook | undefined; variant: 'page' | 'panel'; chatId?: string }) {
    const chip = chipOf(book);
    const anchor = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(false);
    if (!chip) return null;
    const panel = variant === 'panel';
    return (
        <>
            <Button
                ref={anchor}
                size="small"
                variant="text"
                color="inherit"
                data-testid="agent-search-indicator"
                data-chip-kind={chip.kind}
                aria-haspopup="true"
                aria-expanded={open}
                aria-label={chip.aria}
                onClick={() => setOpen(true)}
                startIcon={<Mark kind={chip.kind} />}
                sx={{ flex: 'none', textTransform: 'none', whiteSpace: 'nowrap', bgcolor: open ? 'action.selected' : undefined, minWidth: 0, px: 1 }}
            >
                {panel ? chip.short : chip.label}
            </Button>
            <Popover
                open={open}
                anchorEl={anchor.current}
                onClose={() => setOpen(false)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                PaperProps={{ role: 'dialog', 'aria-label': 'Searches', sx: panel ? { left: '12px !important', right: 12, maxWidth: 'none', width: 'auto' } : { width: 360, maxWidth: 'calc(100vw - 24px)' } }}
            >
                <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', px: 2, pt: 1.5 }}>
                    <Typography sx={{ fontSize: 14, fontWeight: 500 }}>Searches</Typography>
                    <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{`${chip.rows.length} search${chip.rows.length === 1 ? '' : 'es'}`}</Typography>
                </Box>
                <List dense>
                    {chip.rows.map((r) => (
                        <ListItemButton
                            key={r.id}
                            onClick={() => {
                                setOpen(false);
                                scrollToSearchCard(r.id);
                            }}
                            sx={{ alignItems: 'flex-start', gap: 1.25 }}
                        >
                            <Box sx={{ pt: '3px', display: 'flex' }}>
                                <Mark kind={r.kind} />
                            </Box>
                            <Box sx={{ minWidth: 0 }}>
                                <Typography sx={{ fontSize: 13.5, overflowWrap: 'anywhere' }}>{r.title}</Typography>
                                <Typography sx={{ fontSize: 12, color: 'text.secondary', overflowWrap: 'anywhere' }}>{r.sub}</Typography>
                            </Box>
                        </ListItemButton>
                    ))}
                </List>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 1, pb: 1 }}>
                    <OpenInExperiments chatId={chatId} searchId={chip.mainId} />
                </Box>
            </Popover>
        </>
    );
}
