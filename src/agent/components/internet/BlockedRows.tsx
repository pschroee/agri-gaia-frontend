// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Refusals of the internet gate in the chat (design `internet-access`, c1-c3, A8/A9): under the `bash` call whose
// command was refused, one line "Blocked: github.com is not in the allowed sites", or, for several, a line
// "3 blocked · github.com and 2 more" that opens a list. Information only, no button. Web tools (`web_search`,
// `web_extract`) get no line: their refusal is in their result. The rows come from the chat's web requests
// (`origin: exec` with a `tool_call_id`), read again whenever the chat's refusal counter changes.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import ListItemButton from '@mui/material/ListItemButton';
import Typography from '@mui/material/Typography';
import BlockIcon from '@mui/icons-material/Block';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

import { agentApi } from '../../api';
import { useInternetContext } from '../../InternetContext';
import type { Connection } from '../../internet';
import { blockedGroupText, blockedLine, clock, reasonText, showsUnderCall } from '../../internetView';
import { agentColors, MONO } from '../tokens';

/** Refused command connections by the tool call that caused them. */
export function groupByCall(list: Connection[]): Map<string, Connection[]> {
    const out = new Map<string, Connection[]>();
    for (const c of list) {
        if (!showsUnderCall(c) || !c.tool_call_id) continue;
        const l = out.get(c.tool_call_id);
        if (l) l.push(c);
        else out.set(c.tool_call_id, [c]);
    }
    return out;
}

/** The reason as the list under "N blocked" words it. */
export function listReason(c: Pick<Connection, 'reason'>): string {
    switch (c.reason) {
        case 'not_listed':
            return 'not in the allowed sites';
        case 'package_not_listed':
            return 'not in the allowed packages';
        default:
            return reasonText(c.reason);
    }
}

const Ctx = createContext<Map<string, Connection[]> | undefined>(undefined);

/** Reads the chat's refused command connections once and again when its refusal counter changes. */
export function BlockedRowsProvider({ chatId, children }: { chatId: string | undefined; children: ReactNode }) {
    const net = useInternetContext();
    const count = net?.blocked?.count ?? 0;
    const [rows, setRows] = useState<Map<string, Connection[]>>(new Map());
    const enabled = !!net && !!chatId;
    useEffect(() => {
        if (!enabled || !chatId) return;
        let dead = false;
        agentApi.webRequests(chatId).then(
            (list) => {
                if (!dead && Array.isArray(list)) setRows(groupByCall(list));
            },
            () => undefined, // a gateway without the route: no rows
        );
        return () => {
            dead = true;
        };
    }, [enabled, chatId, count]);
    return <Ctx.Provider value={enabled ? rows : undefined}>{children}</Ctx.Provider>;
}

/** The refusal lines of one tool call; nothing for a call without refusals or outside the provider. */
export default function BlockedRows({ toolCallId, tool }: { toolCallId: string; tool: string }) {
    const rows = useContext(Ctx)?.get(toolCallId);
    const net = useInternetContext();
    const [open, setOpen] = useState(false);
    const grants = net?.grants;
    const lines = useMemo(
        () =>
            (rows ?? []).map((c) => {
                const g = c.grant_id ? grants?.find((x) => x.id === c.grant_id) : undefined;
                return { c, text: blockedLine(c, g?.ended_at, g?.ended_reason) };
            }),
        [rows, grants],
    );
    if (tool !== 'bash' || lines.length === 0) return null;
    const indent = { pl: 4.5, pr: 0.5, minWidth: 0 } as const;
    const total = lines.reduce((n, l) => n + Math.max(1, l.c.count || 1), 0);
    if (total === 1) {
        return (
            <Box data-testid="agent-blocked-row" sx={{ ...indent, display: 'flex', alignItems: 'flex-start', gap: 0.75, py: 0.25 }}>
                <BlockIcon sx={{ fontSize: 15, color: agentColors.red, mt: '2px', flex: 'none' }} aria-hidden />
                <Typography sx={{ fontSize: 12, color: agentColors.red, overflowWrap: 'anywhere' }}>{lines[0].text}</Typography>
            </Box>
        );
    }
    const hosts = lines.flatMap((l) => Array<string>(Math.min(1000, Math.max(1, l.c.count || 1))).fill(l.c.host));
    const listId = `agent-blocked-list-${toolCallId}`;
    return (
        <Box data-testid="agent-blocked-group" sx={{ minWidth: 0 }}>
            <ListItemButton
                dense
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                aria-controls={listId}
                sx={{ ...indent, gap: 0.75, py: 0.25, alignItems: 'center' }}
            >
                <BlockIcon sx={{ fontSize: 15, color: agentColors.red, flex: 'none' }} aria-hidden />
                <Typography sx={{ fontSize: 12, color: agentColors.red, minWidth: 0, overflowWrap: 'anywhere' }}>
                    {blockedGroupText(hosts)}
                </Typography>
                {open ? <ExpandLessIcon sx={{ fontSize: 16, flex: 'none' }} /> : <ExpandMoreIcon sx={{ fontSize: 16, flex: 'none' }} />}
            </ListItemButton>
            <Collapse in={open} unmountOnExit>
                <Box id={listId} component="ul" sx={{ ...indent, pl: 8, m: 0, listStyle: 'none' }}>
                    {lines.map(({ c }) => (
                        <Box component="li" key={c.id} sx={{ fontSize: 12, py: 0.125, overflowWrap: 'anywhere' }}>
                            <Box component="span" sx={{ fontFamily: MONO }}>
                                {c.host}
                            </Box>
                            <Box component="span" sx={{ color: agentColors.red }}>{` · ${listReason(c)}`}</Box>
                            <Box component="span" sx={{ color: 'text.secondary' }}>{` · ${clock(c.started_at)}`}</Box>
                        </Box>
                    ))}
                </Box>
            </Collapse>
        </Box>
    );
}
