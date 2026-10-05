// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import CircularProgress from '@mui/material/CircularProgress';
import Collapse from '@mui/material/Collapse';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';

import { thinkingLabel } from '../format';
import type { ThinkingPart } from '../transcript';
import { useAlwaysShowThinking } from '../thinkingPref';
import { useNow } from '../useNow';

type Props = {
    part: ThinkingPart;
    /** Open state chosen by the user for this block, kept by the caller across live and stored message. */
    open?: boolean;
    onOpenChange: (id: string, open: boolean) => void;
};

/**
 * The model's thinking, collapsed to one muted line with chevron, label and duration; a click shows the text.
 * With "Always show thinking" (per user) blocks start expanded.
 */
export default function ThinkingBlock({ part, open: chosen, onOpenChange }: Props) {
    const [alwaysShow, setAlwaysShow] = useAlwaysShowThinking();
    const live = part.liveSince !== undefined;
    const now = useNow(live);
    const open = chosen ?? alwaysShow;
    const hasText = part.text.trim() !== '';

    return (
        <Box data-testid="agent-thinking" data-open={open} sx={{ my: 0.5, color: 'text.secondary' }}>
            <ButtonBase
                onClick={() => onOpenChange(part.id, !open)}
                aria-expanded={open}
                sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.5,
                    py: 0.25,
                    pr: 0.75,
                    borderRadius: 0.5,
                    fontSize: 12,
                    lineHeight: 1.4,
                    fontVariantNumeric: 'tabular-nums',
                    color: 'inherit',
                    '&:hover': { color: 'text.primary' },
                }}
            >
                <ChevronRightIcon
                    sx={{ fontSize: 16, transition: 'transform 150ms', transform: open ? 'rotate(90deg)' : 'none' }}
                />
                {live ? (
                    <CircularProgress size={11} thickness={5} color="inherit" sx={{ mx: '2px' }} />
                ) : (
                    <PsychologyOutlinedIcon sx={{ fontSize: 15 }} />
                )}
                <span>{thinkingLabel(part, now)}</span>
            </ButtonBase>
            <Collapse in={open} unmountOnExit>
                <Box
                    sx={{
                        mt: 0.25,
                        ml: '7px',
                        pl: 1.5,
                        borderLeft: 2,
                        borderColor: 'divider',
                        fontSize: 12.5,
                        lineHeight: 1.55,
                        whiteSpace: 'pre-wrap',
                        overflowWrap: 'anywhere',
                    }}
                >
                    {hasText ? part.text : '…'}
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.25 }}>
                        <FormControlLabel
                            control={
                                <Switch
                                    size="small"
                                    checked={alwaysShow}
                                    onChange={(e) => setAlwaysShow(e.target.checked)}
                                />
                            }
                            label="Always show thinking"
                            sx={{ mr: 0, '& .MuiFormControlLabel-label': { fontSize: 11.5, color: 'text.secondary' } }}
                        />
                    </Box>
                </Box>
            </Collapse>
        </Box>
    );
}
