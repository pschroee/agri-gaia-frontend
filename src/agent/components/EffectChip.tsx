// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import Box from '@mui/material/Box';

import { Effect, EFFECT_LABEL } from '../format';
import { agentColors } from './tokens';

const STYLE: Record<Effect, { color: string; bg: string; border: string }> = {
    read: { color: 'rgba(0,0,0,0.6)', bg: '#f5f5f5', border: '#e0e0e0' },
    write: { color: agentColors.green, bg: agentColors.greenTint, border: agentColors.greenLine },
    compute: { color: agentColors.amberText, bg: agentColors.amberTint, border: agentColors.amberLine },
    irreversible: { color: agentColors.red, bg: agentColors.redTint, border: agentColors.redLine },
};

/** Effect class as a small uppercase label (READ, WRITE, COMPUTE, IRREVERSIBLE). */
export default function EffectChip({ effect }: { effect: Effect }) {
    const s = STYLE[effect];
    return (
        <Box
            component="span"
            sx={{
                display: 'inline-block',
                fontSize: 11,
                lineHeight: '16px',
                letterSpacing: '0.6px',
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
                borderRadius: '3px',
                px: 0.75,
                py: '1px',
                color: s.color,
                bgcolor: s.bg,
                border: `1px solid ${s.border}`,
            }}
        >
            {EFFECT_LABEL[effect]}
        </Box>
    );
}
