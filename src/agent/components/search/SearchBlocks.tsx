// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// What a training search puts into the history of the chat, at the tool call it belongs to (gateway issue #168): the
// decided approval of a proposal as one line, the card of the search, and one red line for a refused call — a proposal
// the gateway turned down (A10) or a trial outside the search space (G2, G14). The refusal text is the gateway's, taken
// from the result of the call.

import { useState } from 'react';

import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

import { boundTo } from '../../callCards';
import { isProposal } from '../../searchApproval';
import { refusalText, searchToolOf } from '../../searchView';
import type { Step } from '../../transcript';
import type { Approval } from '../../types';
import { MONO } from '../tokens';
import SearchApproval from './SearchApproval';
import SearchCard from './SearchCard';
import type { SearchEnv } from './SearchCard';

/** One red line for a refused call; the whole text of the result opens below. */
export function SearchRefusedLine({ label, text, full }: { label: string; text: string; full?: string }) {
    const [open, setOpen] = useState(false);
    return (
        <Box
            role="status"
            data-testid="agent-search-refused"
            sx={{ border: 1, borderColor: 'divider', borderLeft: 3, borderLeftColor: 'error.main', borderRadius: 1, px: 1.5, py: 0.5, minWidth: 0 }}
        >
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, minWidth: 0 }}>
                <BlockOutlinedIcon sx={{ fontSize: 16, color: 'error.main', alignSelf: 'center', flex: 'none' }} aria-hidden />
                <Typography sx={{ fontSize: 12.5, color: 'error.dark', minWidth: 0, overflowWrap: 'anywhere' }}>
                    <b style={{ fontWeight: 500 }}>{label}</b>
                    {` ${text}`}
                </Typography>
                {full && full !== text && (
                    <IconButton size="small" aria-label="Show details" aria-expanded={open} onClick={() => setOpen((o) => !o)} sx={{ ml: 'auto', flex: 'none' }}>
                        {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                    </IconButton>
                )}
            </Box>
            {open && full && (
                <Box component="pre" sx={{ m: 0, mt: 0.5, fontFamily: MONO, fontSize: 11.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: 'text.secondary' }}>
                    {full}
                </Box>
            )}
        </Box>
    );
}

/** The blocks of a run of tool calls; nothing when none of them concerns a search. */
export default function SearchBlocks({ steps, approvals, env }: { steps: Step[]; approvals: Approval[] | undefined; env: SearchEnv }) {
    const blocks: React.ReactNode[] = [];
    for (const step of steps) {
        const tool = searchToolOf(step);
        const failed = !!step.result?.isError;
        if (tool === 'propose_search' && failed)
            blocks.push(<SearchRefusedLine key={`${step.id}-refused`} label="Refused ·" text={`Start a training search · ${refusalText(step.result?.text)}`} full={step.result?.text} />);
        if (tool === 'search_next' && failed)
            blocks.push(<SearchRefusedLine key={`${step.id}-refused`} label="Trial refused:" text={refusalText(step.result?.text)} full={step.result?.text} />);
        const approval = approvals?.find((a) => a.kind === 'search' && boundTo(a, step) && isProposal(a.search) && a.state !== 'pending');
        if (approval && isProposal(approval.search))
            blocks.push(<SearchApproval key={`${approval.id}-decided`} approval={approval} data={approval.search} layout={env.layout} />);
        for (const s of env.experiments.searches.filter((x) => boundTo(x, step)))
            blocks.push(<SearchCard key={s.id} search={s} env={env} />);
    }
    return blocks.length ? <>{blocks}</> : null;
}
