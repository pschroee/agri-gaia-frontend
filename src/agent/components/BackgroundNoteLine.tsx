// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { useState } from 'react';

import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Collapse from '@mui/material/Collapse';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import NotificationsNoneOutlinedIcon from '@mui/icons-material/NotificationsNoneOutlined';

import type { BackgroundNote } from '../background';
import { agentColors, MONO } from './tokens';

const TONE = { ok: agentColors.ok, error: agentColors.red, muted: 'text.secondary' } as const;

/**
 * The gateway's note to the agent that a background task ended, as one muted line ("bg-3 finished · exit 0 · 0:08")
 * instead of a user bubble; a click shows the command and the last lines (data from the sandbox, display only).
 */
export default function BackgroundNoteLine({ note, text }: { note: BackgroundNote; text: string }) {
    const [open, setOpen] = useState(false);
    const hasDetails = note.command !== undefined || note.lines.length > 0 || !!note.error || note.noOutput;
    return (
        <Box data-testid="agent-background-note" role="note" sx={{ fontSize: 12, color: 'text.secondary', px: 0.5 }}>
            <ButtonBase
                onClick={() => setOpen(!open)}
                disabled={!hasDetails}
                aria-expanded={open}
                title={`Note from the gateway to the agent, not from you.\n\n${text}`}
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.75,
                    width: '100%',
                    justifyContent: 'flex-start',
                    textAlign: 'left',
                    fontSize: 12,
                    color: 'inherit',
                    borderRadius: 0.5,
                    '&:hover': { color: 'text.primary' },
                }}
            >
                <ChevronRightIcon
                    sx={{
                        fontSize: 14,
                        flex: 'none',
                        visibility: hasDetails ? 'visible' : 'hidden',
                        transform: open ? 'rotate(90deg)' : 'none',
                        transition: 'transform 150ms',
                    }}
                />
                <NotificationsNoneOutlinedIcon sx={{ fontSize: 14, flex: 'none', color: TONE[note.tone] }} />
                <Box
                    component="span"
                    sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                    Background task {note.label}
                </Box>
            </ButtonBase>
            <Collapse in={open} unmountOnExit>
                <Box sx={{ ml: 2.75, mt: 0.5, pl: 1.25, borderLeft: 2, borderColor: 'divider', minWidth: 0 }}>
                    {note.command !== undefined && (
                        <Box sx={{ fontFamily: MONO, fontSize: 11.5, overflowWrap: 'anywhere' }} title="Command">
                            {note.command}
                        </Box>
                    )}
                    {note.error && <Box sx={{ mt: 0.5, overflowWrap: 'anywhere' }}>Error: {note.error}</Box>}
                    {note.lines.length > 0 ? (
                        <>
                            <Box sx={{ mt: 0.5 }}>
                                Last lines{note.totalLines !== undefined ? ` (of ${note.totalLines})` : ''}
                            </Box>
                            <Box
                                component="pre"
                                sx={{
                                    m: 0,
                                    mt: 0.25,
                                    p: 0.75,
                                    maxHeight: 160,
                                    overflow: 'auto',
                                    bgcolor: agentColors.panelBg,
                                    border: 1,
                                    borderColor: 'divider',
                                    borderRadius: 0.5,
                                    fontFamily: MONO,
                                    fontSize: 11,
                                    lineHeight: 1.45,
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-all',
                                    color: 'text.primary',
                                }}
                            >
                                {note.lines.join('\n')}
                            </Box>
                        </>
                    ) : (
                        note.noOutput && <Box sx={{ mt: 0.5 }}>No output.</Box>
                    )}
                    {note.logPath && (
                        <Box sx={{ mt: 0.25, fontFamily: MONO, fontSize: 11, overflowWrap: 'anywhere' }}>
                            {note.logPath}
                        </Box>
                    )}
                </Box>
            </Collapse>
        </Box>
    );
}
