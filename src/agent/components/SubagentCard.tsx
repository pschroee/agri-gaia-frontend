// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

import type { SubagentNavItem } from '../subagents';
import EllipsisText from './EllipsisText';
import { SubagentIcon, SubagentState } from './SubagentState';

/**
 * The subagents an answer started (issue #54): one card with a row per run, robot, title, state and a chevron; a click
 * opens the subagent read-only. Takes the place of the links under the `subagent` call.
 */
export default function SubagentCard({ items, onOpen }: { items: SubagentNavItem[]; onOpen: (runId: string) => void }) {
    if (items.length === 0) return null;
    return (
        <Box
            data-testid="agent-subagent-card"
            sx={{
                display: 'flex',
                flexDirection: 'column',
                border: '1px solid rgba(0, 0, 0, 0.12)',
                borderRadius: '4px',
                overflow: 'hidden',
                minWidth: 0,
            }}
        >
            {items.map((it, i) => (
                <ButtonBase
                    key={it.runId}
                    data-testid="agent-step-subagent"
                    data-run-id={it.runId}
                    onClick={() => onOpen(it.runId)}
                    aria-label={`Open subagent ${it.title}`}
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.5,
                        minHeight: 48,
                        pl: 1.5,
                        pr: 1,
                        minWidth: 0,
                        justifyContent: 'flex-start',
                        textAlign: 'left',
                        borderTop: i ? '1px solid rgba(0, 0, 0, 0.12)' : 'none',
                        '&:hover': { bgcolor: 'rgba(94, 53, 177, 0.04)' },
                    }}
                >
                    <SubagentIcon size={20} />
                    <EllipsisText text={it.title} sx={{ flex: 1, fontSize: 14 }} />
                    <SubagentState status={it.status} />
                    <ChevronRightIcon sx={{ fontSize: 20, color: 'rgba(0, 0, 0, 0.38)', flex: 'none' }} />
                </ButtonBase>
            ))}
        </Box>
    );
}
