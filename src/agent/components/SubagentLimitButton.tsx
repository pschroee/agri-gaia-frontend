// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { useState } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Popover from '@mui/material/Popover';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import RemoveIcon from '@mui/icons-material/Remove';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';

import { clampSubagents, subagentLimit } from '../settings';
import type { Chat, Config } from '../types';
import { useChatSettings } from '../useChatSettings';
import { agentColors } from './tokens';

/**
 * Subagent limit of the chat in the row below the input: "Subagents 1 / 3" (in the panel "1/3"), a click opens a
 * stepper. The gateway enforces the limit at its model proxy and by stopping the turn; it takes effect at once.
 */
export default function SubagentLimitButton({
    chat,
    config,
    dense = false,
    onChat,
}: {
    chat: Chat;
    config?: Config;
    dense?: boolean;
    /** Hands the gateway's answer to the open chat view. */
    onChat?: (c: Chat) => void;
}) {
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const settings = useChatSettings(chat, onChat);
    const v = subagentLimit(chat, config);
    const busy = settings.busy === 'subagents';
    const change = (n: number) => {
        const next = clampSubagents(n, v.limit);
        if (next !== v.max) void settings.setMaxSubagents(next);
    };

    return (
        <>
            <Tooltip title={anchor ? '' : `${v.label} allowed. Click to change the limit.`}>
                <Button
                    size="small"
                    variant="text"
                    color="inherit"
                    startIcon={<SmartToyOutlinedIcon />}
                    endIcon={<ExpandMoreIcon />}
                    onClick={(e) => setAnchor(e.currentTarget)}
                    aria-label={`${v.label}, change limit`}
                    aria-haspopup="dialog"
                    data-testid="agent-subagent-limit"
                    sx={{
                        textTransform: 'none',
                        fontSize: 12,
                        fontWeight: v.over ? 500 : 400,
                        color: v.over ? agentColors.red : 'text.secondary',
                        minWidth: 0,
                        px: 0.75,
                        py: 0.25,
                        borderRadius: 999,
                        whiteSpace: 'nowrap',
                        flex: 'none',
                        '& .MuiButton-startIcon': { mr: 0.5, ml: 0 },
                        '& .MuiButton-endIcon': { ml: 0.25, mr: 0 },
                        '& .MuiButton-startIcon > *:nth-of-type(1), & .MuiButton-endIcon > *:nth-of-type(1)': {
                            fontSize: 15,
                        },
                    }}
                >
                    {dense ? v.short : v.label}
                </Button>
            </Tooltip>
            <Popover
                open={!!anchor}
                anchorEl={anchor}
                onClose={() => {
                    setAnchor(null);
                    settings.clearError();
                }}
                anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
                transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                slotProps={{ paper: { sx: { width: 280, maxWidth: 'calc(100vw - 24px)', mb: 0.5 } } }}
            >
                <Box
                    role="dialog"
                    aria-label="Subagent limit"
                    data-testid="agent-subagent-popover"
                    sx={{ p: 1.5, fontSize: 12.5, lineHeight: 1.45 }}
                >
                    <Typography sx={{ fontSize: 13.5, fontWeight: 500 }}>Subagent limit</Typography>
                    <Box sx={{ color: 'text.secondary', mt: 0.5 }}>
                        {`${v.used} started so far, ${v.max} allowed. The gateway enforces it at its model proxy (at most ${
                            v.max + 1
                        } model calls at once) and stops the turn when more subagents start.`}
                    </Box>
                    {v.over && (
                        <Box sx={{ color: agentColors.red, mt: 0.5 }}>
                            More subagents were started than allowed; the turn was stopped.
                        </Box>
                    )}
                    <Box
                        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mt: 1.25 }}
                    >
                        <Box component="span" id={`agent-maxsub-${chat.id}`} sx={{ fontWeight: 500 }}>
                            Max. subagents
                        </Box>
                        <Box
                            role="group"
                            aria-labelledby={`agent-maxsub-${chat.id}`}
                            sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
                        >
                            <IconButton
                                size="small"
                                aria-label="Fewer subagents"
                                disabled={busy || !v.canDecrease}
                                onClick={() => change(v.max - 1)}
                                sx={{ border: 1, borderColor: 'divider', p: '3px' }}
                            >
                                <RemoveIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                            <Box
                                component="output"
                                data-testid="agent-subagent-max"
                                aria-live="polite"
                                sx={{
                                    minWidth: 28,
                                    textAlign: 'center',
                                    fontSize: 14,
                                    fontVariantNumeric: 'tabular-nums',
                                    display: 'inline-flex',
                                    justifyContent: 'center',
                                }}
                            >
                                {busy ? <CircularProgress size={14} /> : v.max}
                            </Box>
                            <IconButton
                                size="small"
                                aria-label="More subagents"
                                disabled={busy || !v.canIncrease}
                                onClick={() => change(v.max + 1)}
                                sx={{ border: 1, borderColor: 'divider', p: '3px' }}
                            >
                                <AddIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                        </Box>
                    </Box>
                    <Box sx={{ color: 'text.secondary', fontSize: 11.5, mt: 1 }}>
                        {v.limit !== undefined
                            ? `0 to ${v.limit}. Takes effect immediately.`
                            : 'Takes effect immediately.'}
                    </Box>
                    {settings.error && (
                        <Box role="alert" sx={{ mt: 0.75, color: 'error.main', fontSize: 11.5 }}>
                            {settings.error}
                        </Box>
                    )}
                </Box>
            </Popover>
        </>
    );
}
