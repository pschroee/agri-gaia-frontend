// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ChatOutlinedIcon from '@mui/icons-material/ChatOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

import { agentColors } from '../tokens';

export type DetailHeaderProps = {
    onBack: () => void;
    title: string;
    /** Kind of the run, as a chip ("Training run"). */
    kind?: string;
    /** State of the run, with its duration. */
    state?: ReactNode;
    chatTitle?: string;
    onOpenChat?: () => void;
    /** Second line: a link with `onClick`, or with `href` (opens in a new window). */
    links?: { label: string; onClick?: () => void; href?: string }[];
};

const linkSx = { fontSize: 12.5, color: agentColors.green } as const;

/** Head of a detail view: back to the overview, title, kind, state, and the chat as a link. */
export default function DetailHeader({ onBack, title, kind, state, chatTitle, onOpenChat, links }: DetailHeaderProps) {
    return (
        <Box sx={{ mb: 2 }} data-testid="detail-header">
            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
                <Button variant="text" startIcon={<ArrowBackIcon />} onClick={onBack} data-testid="detail-back">
                    Back to overview
                </Button>
                <Typography variant="h6" noWrap sx={{ maxWidth: '60%' }} title={title}>
                    {title}
                </Typography>
                {kind && <Chip size="small" variant="outlined" label={kind} />}
                {state && <Box sx={{ fontSize: 14, display: 'inline-flex', alignItems: 'center' }}>{state}</Box>}
                <Box sx={{ flexGrow: 1 }} />
                {chatTitle && (
                    <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
                        in{' '}
                        {onOpenChat ? (
                            <Link component="button" type="button" underline="hover" onClick={onOpenChat} sx={{ fontSize: 13, color: agentColors.green, verticalAlign: 'baseline' }}>
                                {chatTitle}
                            </Link>
                        ) : (
                            chatTitle
                        )}
                    </Typography>
                )}
                {onOpenChat && (
                    <Button size="small" variant="outlined" startIcon={<ChatOutlinedIcon />} onClick={onOpenChat} data-testid="detail-open-chat">
                        Open chat
                    </Button>
                )}
            </Box>
            {links && links.length > 0 && (
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mt: 0.75, color: 'text.secondary', fontSize: 12.5 }}>
                    {links.map((l) =>
                        l.href ? (
                            <Link key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" underline="hover" sx={linkSx}>
                                {l.label}
                            </Link>
                        ) : (
                            <Link key={l.label} component="button" type="button" underline="hover" onClick={l.onClick} sx={linkSx}>
                                {l.label}
                            </Link>
                        ),
                    )}
                </Box>
            )}
        </Box>
    );
}
