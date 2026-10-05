// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { useState } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
import NotificationsNoneOutlinedIcon from '@mui/icons-material/NotificationsNoneOutlined';
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline';
import ScheduleIcon from '@mui/icons-material/Schedule';
import SendIcon from '@mui/icons-material/Send';

import { isHeld, queuePreview, queueStatusText } from '../queue';
import type { QueueRow } from '../queue';
import type { Chat } from '../types';
import { agentColors, blockSx } from './tokens';

type Props = {
    chat?: Chat;
    rows: QueueRow[];
    error?: string;
    onRemove: (id: string) => Promise<void>;
    onSendNow: () => Promise<void>;
};

const stateLabel: Record<QueueRow['state'], string> = {
    sending: 'queueing',
    removing: 'removing',
    held: 'held',
    waiting: 'queued',
};

/**
 * Queued messages above the input field: one line each, removable as long as the gateway has not delivered
 * them. After an abort (queue_held) they wait for the next message or for "Send now".
 */
export default function QueueList({ chat, rows, error, onRemove, onSendNow }: Props) {
    const [flushing, setFlushing] = useState(false);
    if (rows.length === 0 && !error) return null;
    const held = isHeld(chat);

    const flush = async () => {
        setFlushing(true);
        try {
            await onSendNow();
        } finally {
            setFlushing(false);
        }
    };

    return (
        <Box
            component="section"
            aria-label="Queued messages"
            sx={{ ...blockSx, borderLeft: `3px solid ${held ? agentColors.amber : agentColors.green}`, mb: 1 }}
        >
            {rows.length > 0 && (
                <Box
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: 'auto minmax(0, 1fr) auto',
                        alignItems: 'center',
                        columnGap: 1,
                        px: 1.25,
                        py: 0.75,
                    }}
                >
                    {held ? (
                        <PauseCircleOutlineIcon sx={{ fontSize: 16, color: agentColors.amber }} />
                    ) : (
                        <ScheduleIcon sx={{ fontSize: 16, color: agentColors.green }} />
                    )}
                    <Typography sx={{ fontSize: 12.5, fontWeight: 500, gridColumn: held ? 'auto' : '2 / 4' }}>
                        Queued ({rows.length})
                    </Typography>
                    {held && (
                        <Button
                            size="small"
                            variant="outlined"
                            disabled={flushing}
                            onClick={() => void flush()}
                            startIcon={
                                flushing ? (
                                    <CircularProgress size={12} />
                                ) : (
                                    <SendIcon sx={{ fontSize: '14px !important' }} />
                                )
                            }
                            sx={{ py: 0, fontSize: 12 }}
                        >
                            Send now
                        </Button>
                    )}
                    <Typography sx={{ gridColumn: '2 / 4', fontSize: 11.5, color: 'text.secondary' }}>
                        {queueStatusText(chat)}
                    </Typography>
                </Box>
            )}
            <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, maxHeight: 168, overflowY: 'auto' }}>
                {rows.map((r) => (
                    <Box
                        component="li"
                        key={r.key}
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            px: 1.25,
                            py: 0.5,
                            borderTop: 1,
                            borderColor: 'divider',
                            minWidth: 0,
                            color: r.system ? 'text.secondary' : 'text.primary',
                            opacity: r.state === 'removing' ? 0.5 : 1,
                        }}
                    >
                        {r.system && (
                            <Tooltip title="Note from the gateway to the agent, not from you">
                                <NotificationsNoneOutlinedIcon sx={{ fontSize: 15 }} />
                            </Tooltip>
                        )}
                        <Typography
                            title={r.text}
                            sx={{
                                fontSize: 12.5,
                                flex: 1,
                                minWidth: 0,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                fontStyle: r.system ? 'italic' : 'normal',
                            }}
                        >
                            {r.label ?? (queuePreview(r.text) || 'attachments only')}
                            {r.attachments.length > 0 &&
                                ` · ${r.attachments.length === 1 ? r.attachments[0] : `${r.attachments.length} files`}`}
                        </Typography>
                        <Typography
                            sx={{
                                fontSize: 10.5,
                                textTransform: 'uppercase',
                                letterSpacing: 0.4,
                                color: r.state === 'held' ? agentColors.amberText : 'text.secondary',
                                flex: 'none',
                            }}
                        >
                            {stateLabel[r.state]}
                        </Typography>
                        {r.id ? (
                            <Tooltip title="Remove (not handed to the agent yet)">
                                <span>
                                    <IconButton
                                        size="small"
                                        disabled={r.state === 'removing'}
                                        aria-label={r.system ? 'Remove gateway note' : 'Remove queued message'}
                                        onClick={() => void onRemove(r.id as string)}
                                        sx={{ p: 0.25 }}
                                    >
                                        <CloseIcon sx={{ fontSize: 15 }} />
                                    </IconButton>
                                </span>
                            </Tooltip>
                        ) : (
                            <CircularProgress size={13} aria-label="queueing" sx={{ mx: 0.25 }} />
                        )}
                    </Box>
                ))}
            </Box>
            {error && (
                <Typography
                    role="alert"
                    sx={{
                        fontSize: 11.5,
                        color: 'error.main',
                        px: 1.25,
                        py: 0.5,
                        borderTop: rows.length ? 1 : 0,
                        borderColor: 'divider',
                    }}
                >
                    {error}
                </Typography>
            )}
        </Box>
    );
}
