// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import { alpha } from '@mui/material/styles';
import DatasetOutlinedIcon from '@mui/icons-material/DatasetOutlined';
import DeveloperBoardOutlinedIcon from '@mui/icons-material/DeveloperBoardOutlined';
import ModelTrainingOutlinedIcon from '@mui/icons-material/ModelTrainingOutlined';
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
    const objects = contextObjects(context);
    const single = objects.length === 1;
    // the kind's symbol (design: "dataset"); a page without a known kind keeps the pin
    const Icon =
        objects[0]?.kind === 'dataset'
            ? DatasetOutlinedIcon
            : objects[0]?.kind === 'model'
            ? ModelTrainingOutlinedIcon
            : objects[0]?.kind === 'edge_device'
            ? DeveloperBoardOutlinedIcon
            : PlaceOutlinedIcon;
    return (
        <Tooltip title={<ChipTip context={context} />}>
            <Chip
                data-testid="agent-context-chip"
                size="small"
                icon={<Icon sx={{ fontSize: 16 }} />}
                label={
                    <Box
                        component="span"
                        sx={{ fontFamily: single ? MONO : undefined, fontSize: single ? 12.5 : 13 }}
                    >
                        {contextLabel(context)}
                    </Box>
                }
                onDelete={onRemove}
                aria-label={`Sent with your message: ${contextLabel(context)}`}
                // design: 28 px pill tinted in the primary colour, name in mono, filled cross
                sx={{
                    justifySelf: 'start',
                    maxWidth: '100%',
                    height: 28,
                    borderRadius: '14px',
                    fontSize: 13,
                    color: agentColors.green,
                    bgcolor: alpha(agentColors.green, 0.08),
                    '& .MuiChip-icon': { color: agentColors.green, ml: 1, mr: -0.25 },
                    '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis', px: 0.75 },
                    '& .MuiChip-deleteIcon': {
                        fontSize: 18,
                        color: alpha(agentColors.green, 0.5),
                        mr: 0.5,
                        '&:hover': { color: agentColors.green },
                    },
                }}
            />
        </Tooltip>
    );
}
