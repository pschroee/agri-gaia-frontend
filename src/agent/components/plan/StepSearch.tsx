// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The search step of a plan (issue #245): before the start the table of what the approval covers (parameters with
// their ranges, budget, goal); after the start the progress line of the search and a link to its card. No card of its
// own: the search card in the chat stays the one place for the search.

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { Link as RouterLink, useInRouterContext } from 'react-router-dom';

import { useAgentOptional } from '../../AgentContext';
import type { PlanStep } from '../../plan';
import { searchProgressLine, searchSummaryRows } from '../../stepSearch';
import { scrollToSearchCard } from '../search/SearchIndicator';

/**
 * `labelWidth`: the width of the label column in px, the facts grid of the step's label column plus its gap, so that
 * the values of both stand in one line.
 */
export default function StepSearch({ step, chatId, labelWidth = 108 }: { step: PlanStep; chatId: string; labelWidth?: number }) {
    const inRouter = useInRouterContext();
    const agent = useAgentOptional();
    const searchId = step.search_id;
    if (!searchId) {
        const rows = searchSummaryRows(step);
        if (rows.length === 0) return null;
        return (
            <Box data-testid="agent-plan-search-table" sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: 11.5, fontWeight: 500, color: 'text.secondary' }}>Search</Typography>
                <Table size="small" sx={{ '& td': { fontSize: 12, py: 0.25, px: 0, borderBottom: 0, verticalAlign: 'top' } }}>
                    <TableBody>
                        {rows.map((r, i) => (
                            <TableRow key={`${i}:${r.label}`}>
                                <TableCell sx={{ width: labelWidth, color: 'text.secondary' }}>{r.label}</TableCell>
                                <TableCell sx={{ overflowWrap: 'anywhere' }}>{r.value}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </Box>
        );
    }
    const line = searchProgressLine(step, agent?.searchLists[chatId]);
    const to = `/ai-agent?tab=experiments&chat=${encodeURIComponent(chatId)}&run=${encodeURIComponent(searchId)}`;
    const showProps = inRouter
        ? {
              component: RouterLink,
              to,
              onClick: (e: { preventDefault: () => void }) => {
                  // the card in the chat is the closer place; the tab is the way when the view shows no card
                  if (scrollToSearchCard(searchId)) {
                      e.preventDefault();
                      return;
                  }
                  agent?.selectChat(chatId);
                  agent?.setPanelOpen(false);
              },
          }
        : {};
    return (
        <Box data-testid="agent-plan-search-progress" sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', minWidth: 0 }}>
            {line && <Typography sx={{ fontSize: 12, overflowWrap: 'anywhere' }}>{line}</Typography>}
            <Button size="small" {...showProps} data-testid="agent-plan-search-show" sx={{ minWidth: 0, py: 0, textTransform: 'none' }}>
                Show search
            </Button>
        </Box>
    );
}
