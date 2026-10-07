// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The subtle hint that the agent works while nothing of its answer shows yet (issue #57; the bar is the design's of
// issue #54). Never in place of thinking blocks and steps: those show themselves, one by one, as they happen.

import Box from '@mui/material/Box';

import { agentColors } from './tokens';

/** The design's indeterminate bar: 4 px high, at most 240 px wide. */
export function WorkingBar() {
    return (
        <Box
            aria-hidden
            sx={{
                position: 'relative',
                height: 4,
                borderRadius: 2,
                overflow: 'hidden',
                bgcolor: '#c5dccf',
                maxWidth: 240,
                '@keyframes agentWorkingBar': {
                    '0%': { left: '-35%', right: '100%' },
                    '60%': { left: '100%', right: '-90%' },
                    '100%': { left: '100%', right: '-90%' },
                },
                '& > span': {
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    bgcolor: agentColors.green,
                    animation: 'agentWorkingBar 1.8s cubic-bezier(0.65, 0.815, 0.735, 0.395) infinite',
                },
                '@media (prefers-reduced-motion: reduce)': { '& > span': { animation: 'none', left: 0, right: '60%' } },
            }}
        >
            <span />
        </Box>
    );
}

/** "Working …" (or another label) with the bar below it. */
export default function WorkingIndicator({ label = 'The agent is working …' }: { label?: string }) {
    return (
        <Box
            data-testid="agent-working"
            role="status"
            sx={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}
        >
            <Box component="span" sx={{ fontSize: 13, color: 'text.secondary' }}>
                {label}
            </Box>
            <WorkingBar />
        </Box>
    );
}
