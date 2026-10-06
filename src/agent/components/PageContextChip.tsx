// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';

import { PageContext, contextLabel, contextTitle } from '../pageContext';
import { MONO, agentColors } from './tokens';

const TIP = 'Sent with your message so the agent knows what you refer to. It grants the agent no rights.';

/** Chip above the input: the page context that goes with the next message; the cross leaves it out. */
export function PageContextChip({ context, onRemove }: { context: PageContext; onRemove: () => void }) {
    return (
        <Tooltip title={`${contextTitle(context)}. ${TIP}`}>
            <Chip
                data-testid="agent-context-chip"
                size="small"
                variant="outlined"
                icon={<PlaceOutlinedIcon sx={{ fontSize: 15 }} />}
                label={
                    <>
                        Refers to{' '}
                        <Box component="b" sx={{ fontFamily: context.object ? MONO : undefined, fontWeight: 500 }}>
                            {contextLabel(context)}
                        </Box>
                    </>
                }
                onDelete={onRemove}
                aria-label={`Context: ${contextLabel(context)}`}
                sx={{
                    justifySelf: 'start',
                    maxWidth: '100%',
                    height: 24,
                    fontSize: 12,
                    color: 'text.secondary',
                    bgcolor: agentColors.greenTint,
                    borderColor: agentColors.greenLine,
                    '& .MuiChip-icon': { color: agentColors.green },
                    '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' },
                }}
            />
        </Tooltip>
    );
}

/** Compact marker on a sent or queued message: "Refers to smarttail-bucht-3-kw31". */
export function RefersTo({ context, align = 'end' }: { context: PageContext; align?: 'start' | 'end' }) {
    return (
        <Box
            data-testid="agent-refers-to"
            title={contextTitle(context)}
            sx={{
                alignSelf: align === 'end' ? 'flex-end' : 'flex-start',
                maxWidth: '100%',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.5,
                fontSize: 11.5,
                color: 'text.secondary',
                minWidth: 0,
            }}
        >
            <PlaceOutlinedIcon sx={{ fontSize: 13, flex: 'none' }} />
            <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                Refers to{' '}
                <Box
                    component="b"
                    sx={{ color: 'text.primary', fontWeight: 500, fontFamily: context.object ? MONO : undefined }}
                >
                    {contextLabel(context)}
                </Box>
            </Box>
        </Box>
    );
}
