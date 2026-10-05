// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { useState } from 'react';

import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Collapse from '@mui/material/Collapse';
import Typography from '@mui/material/Typography';
import KeyOutlinedIcon from '@mui/icons-material/KeyOutlined';
import BlockIcon from '@mui/icons-material/Block';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

import { templateLabelOf } from '../delegationTemplates';
import { formatClock, formatExpiry, isBlocked, outcomeReason, summarizeRules } from '../format';
import type { Chat, SocketCall } from '../types';
import { agentColors, blockSx, MONO } from './tokens';

/**
 * Strip with the rights the user handed to the agent for this chat (template, expiry, rules) and, in a
 * red-tinted block, the calls the gateway blocked because they went beyond them. Collapsed it shows one
 * line each; a click opens the rules and the list of blocked calls.
 */
export default function DelegationStrip({ chat, socketCalls }: { chat: Chat; socketCalls: SocketCall[] }) {
    const [open, setOpen] = useState(false);
    const d = chat.delegation;
    const blocked = socketCalls.filter(isBlocked);
    const expiry = d ? formatExpiry(d.expires_at) : undefined;
    const label = templateLabelOf(d) ?? 'Custom rules';
    const rules = d ? summarizeRules(d.rules) : [];
    const last = blocked[blocked.length - 1];

    return (
        <Box sx={{ ...blockSx, overflow: 'hidden' }}>
            <ButtonBase
                onClick={() => setOpen(!open)}
                aria-expanded={open}
                sx={{
                    display: 'flex',
                    width: '100%',
                    justifyContent: 'flex-start',
                    alignItems: 'center',
                    gap: 1,
                    px: 1.5,
                    py: 0.9,
                    textAlign: 'left',
                }}
            >
                <KeyOutlinedIcon sx={{ fontSize: 16, color: agentColors.green }} />
                <Typography sx={{ fontSize: 13, fontWeight: 500, flex: 'none' }}>Delegation</Typography>
                <Typography noWrap sx={{ fontSize: 12.5, color: 'text.secondary', minWidth: 0 }}>
                    {label}
                </Typography>
                {expiry && (
                    <Typography
                        sx={{
                            ml: 'auto',
                            flex: 'none',
                            fontSize: 11.5,
                            color: expiry === 'expired' ? agentColors.red : 'text.secondary',
                        }}
                    >
                        {expiry}
                    </Typography>
                )}
                <ExpandMoreIcon
                    sx={{
                        ml: expiry ? 0 : 'auto',
                        fontSize: 18,
                        color: 'text.secondary',
                        transform: open ? 'rotate(180deg)' : 'none',
                        transition: 'transform 150ms',
                    }}
                />
            </ButtonBase>
            <Collapse in={open} unmountOnExit>
                <Box sx={{ px: 1.5, pb: 1, pl: 4.5 }}>
                    {d ? (
                        <>
                            {rules.map((line) => (
                                <Typography key={line} sx={{ fontSize: 12, lineHeight: 1.55 }}>
                                    {line}
                                </Typography>
                            ))}
                            <Typography sx={{ fontSize: 11, color: 'text.secondary', mt: 0.5 }}>
                                {d.enforce === false
                                    ? 'Violations are only logged, not blocked.'
                                    : 'Calls outside these rules are blocked.'}
                            </Typography>
                        </>
                    ) : (
                        <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                            Reading works without asking, every write needs your approval.
                        </Typography>
                    )}
                </Box>
            </Collapse>
            {last && (
                <Box
                    sx={{
                        bgcolor: agentColors.redTint,
                        borderTop: `1px solid ${agentColors.redLine}`,
                        boxShadow: `inset 3px 0 0 ${agentColors.red}`,
                        px: 1.5,
                        py: 0.9,
                    }}
                >
                    <ButtonBase
                        onClick={() => setOpen(!open)}
                        sx={{
                            display: 'flex',
                            width: '100%',
                            justifyContent: 'flex-start',
                            alignItems: 'center',
                            gap: 1,
                            textAlign: 'left',
                        }}
                    >
                        <BlockIcon sx={{ fontSize: 16, color: agentColors.red }} />
                        <Typography sx={{ fontSize: 13, fontWeight: 500, flex: 'none' }}>
                            {blocked.length === 1 ? '1 blocked call' : `${blocked.length} blocked calls`}
                        </Typography>
                        {!open && (
                            <Typography noWrap sx={{ fontFamily: MONO, fontSize: 11.5, color: '#7a1a14', minWidth: 0 }}>
                                {last.detail}
                            </Typography>
                        )}
                    </ButtonBase>
                    <Collapse in={open} unmountOnExit>
                        <Box
                            component="ul"
                            sx={{ listStyle: 'none', m: 0, mt: 0.75, pl: 3, display: 'grid', rowGap: 0.75 }}
                        >
                            {blocked
                                .slice(-5)
                                .reverse()
                                .map((c) => (
                                    <Box component="li" key={c.id} sx={{ fontSize: 12, lineHeight: 1.45 }}>
                                        <Box sx={{ display: 'flex', gap: 1 }}>
                                            <Box component="span" sx={{ fontFamily: MONO, overflowWrap: 'anywhere' }}>
                                                {c.detail}
                                            </Box>
                                            <Box
                                                component="span"
                                                sx={{ ml: 'auto', color: 'text.secondary', flex: 'none', fontSize: 11 }}
                                            >
                                                {formatClock(c.created_at)}
                                            </Box>
                                        </Box>
                                        {outcomeReason(c.result) && (
                                            <Box component="span" sx={{ color: '#7a1a14' }}>
                                                {outcomeReason(c.result)}
                                            </Box>
                                        )}
                                    </Box>
                                ))}
                        </Box>
                    </Collapse>
                </Box>
            )}
        </Box>
    );
}
