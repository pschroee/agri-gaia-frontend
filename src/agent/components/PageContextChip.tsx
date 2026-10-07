// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';

import { PageContext, contextLabel, contextObjects, contextTitle } from '../pageContext';
import { MONO, agentColors } from './tokens';

const TIP = 'Sent with your message so the agent knows what you refer to. It grants the agent no rights.';

/** Tooltip of the chip: the object, or the selected objects one per line, and what the chip means. */
function ChipTip({ context }: { context: PageContext }) {
    const [head, ...lines] = contextTitle(context).split('\n');
    return (
        <Box sx={{ display: 'grid', gap: 0.5 }}>
            <Box component="span">{head}</Box>
            {lines.length > 0 && (
                <Box component="ul" data-testid="agent-context-chip-names" sx={{ m: 0, pl: 2, maxHeight: 240, overflow: 'auto' }}>
                    {lines.map((l, i) => (
                        <li key={i}>{l}</li>
                    ))}
                </Box>
            )}
            <Box component="span">{TIP} The cross leaves the selection out of this message.</Box>
        </Box>
    );
}

/**
 * Chip above the input, only for a selection (issue #45): the open or selected object by name, several as one chip
 * with their count ("2 datasets"). The page itself goes with every message without a chip. The cross leaves the
 * selection out of the next message.
 */
export function PageContextChip({ context, onRemove }: { context: PageContext; onRemove: () => void }) {
    const single = contextObjects(context).length === 1;
    return (
        <Tooltip title={<ChipTip context={context} />}>
            <Chip
                data-testid="agent-context-chip"
                size="small"
                variant="outlined"
                icon={<PlaceOutlinedIcon sx={{ fontSize: 15 }} />}
                label={
                    <Box component="b" sx={{ fontFamily: single ? MONO : undefined, fontWeight: 500 }}>
                        {contextLabel(context)}
                    </Box>
                }
                onDelete={onRemove}
                aria-label={`Sent with your message: ${contextLabel(context)}`}
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

/** Compact marker on a sent or queued message: "Refers to smarttail-bucht-3-kw31", "Refers to 2 datasets". */
export function RefersTo({ context, align = 'end' }: { context: PageContext; align?: 'start' | 'end' }) {
    const single = contextObjects(context).length === 1;
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
                    sx={{ color: 'text.primary', fontWeight: 500, fontFamily: single ? MONO : undefined }}
                >
                    {contextLabel(context)}
                </Box>
            </Box>
        </Box>
    );
}
