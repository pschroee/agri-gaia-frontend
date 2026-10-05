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
import StopCircleOutlinedIcon from '@mui/icons-material/StopCircleOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';

type Props = {
    onSend: (text: string) => Promise<void>;
    onAbort?: () => Promise<void>;
    running?: boolean;
    disabled?: boolean;
    placeholder?: string;
    hint?: string;
};

/** Message field with send (Enter) and stop button, and a hint line below. */
export default function ChatInput({ onSend, onAbort, running, disabled, placeholder, hint }: Props) {
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>();

    const send = async () => {
        const t = text.trim();
        if (!t || busy) return;
        setBusy(true);
        setError(undefined);
        try {
            await onSend(t);
            setText('');
        } catch (e) {
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
                placeholder={placeholder ?? 'Ask the agent …'}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={onKeyDown}
                sx={{ bgcolor: '#fff', '& .MuiInputBase-input': { fontSize: 14 } }}
                InputProps={{
                    endAdornment: (
                        <InputAdornment position="end" sx={{ alignSelf: 'flex-end', mb: 1.5 }}>
                            {running && onAbort && (
                                <Tooltip title="Stop the agent">
                                    <IconButton size="small" onClick={() => void onAbort()} aria-label="Stop">
                                        <StopCircleOutlinedIcon fontSize="small" />
                                    </IconButton>
                                </Tooltip>
                            )}
                            <Tooltip title="Send (Enter)">
                                <span>
                                    <IconButton
                                        size="small"
                                        color="primary"
                                        disabled={disabled || busy || !text.trim()}
                                        onClick={() => void send()}
                                        aria-label="Send"
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
