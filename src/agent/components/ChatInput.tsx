// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { KeyboardEvent, useState } from 'react';

import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import SendIcon from '@mui/icons-material/Send';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';

type Props = {
    onSend: (text: string) => Promise<void>;
    /** The agent works: the input stays usable, sending queues the message. */
    running?: boolean;
    disabled?: boolean;
    placeholder?: string;
    hint?: string;
};

/**
 * Message field with send (Enter) and a hint line below. While the agent works, sending is not blocked: the
 * gateway queues the message and the queue above the field shows it. Stopping lives in the run status above.
 */
export default function ChatInput({ onSend, running, disabled, placeholder, hint }: Props) {
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>();

    const send = async () => {
        const t = text.trim();
        if (!t || busy) return;
        setBusy(true);
        setError(undefined);
        // cleared right away (the message shows in the history or the queue); restored when sending fails
        setText('');
        try {
            await onSend(t);
        } catch (e) {
            setText((cur) => (cur.trim() ? `${t}\n\n${cur}` : t));
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void send();
        }
    };

    return (
        <Box sx={{ display: 'grid', gap: 0.75 }}>
            <TextField
                size="small"
                fullWidth
                multiline
                maxRows={6}
                value={text}
                disabled={disabled}
                placeholder={running ? 'Queue another message …' : placeholder ?? 'Ask the agent …'}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={onKeyDown}
                sx={{ bgcolor: '#fff', '& .MuiInputBase-input': { fontSize: 14 } }}
                InputProps={{
                    endAdornment: (
                        <InputAdornment position="end" sx={{ alignSelf: 'flex-end', mb: 1.5 }}>
                            <Tooltip
                                title={
                                    running
                                        ? 'Queue message (goes to the agent when the current run ends)'
                                        : 'Send (Enter)'
                                }
                            >
                                <span>
                                    <IconButton
                                        size="small"
                                        color="primary"
                                        disabled={disabled || busy || !text.trim()}
                                        onClick={() => void send()}
                                        aria-label={running ? 'Queue message' : 'Send'}
                                    >
                                        <SendIcon fontSize="small" />
                                    </IconButton>
                                </span>
                            </Tooltip>
                        </InputAdornment>
                    ),
                }}
            />
            {error ? (
                <Typography sx={{ fontSize: 11.5, color: 'error.main' }}>{error}</Typography>
            ) : (
                <Typography
                    sx={{ fontSize: 11, color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5 }}
                >
                    <LockOutlinedIcon sx={{ fontSize: 12 }} />
                    {hint ?? 'Write actions need your approval.'}
                </Typography>
            )}
        </Box>
    );
}
