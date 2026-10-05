// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { KeyboardEvent, ReactNode, useEffect, useId, useState } from 'react';

import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import SendIcon from '@mui/icons-material/Send';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';

import { isSlashCommand } from '../commands';
import type { Command } from '../types';
import { useSlashCommands } from '../useSlashCommands';
import SlashCommandMenu, { optionId } from './SlashCommandMenu';

type Props = {
    onSend: (text: string) => Promise<void>;
    /** The agent works: the input stays usable, sending queues the message. */
    running?: boolean;
    disabled?: boolean;
    placeholder?: string;
    hint?: string;
    /** Controls in the row below the field (model and thinking level); the hint then moves to the right. */
    toolbar?: ReactNode;
    /** Narrow layout: with a toolbar, the hint shrinks to its icon with a tooltip. */
    dense?: boolean;
    /** Slash commands offered while the input starts with "/"; without onCommand, "/…" is sent as a message. */
    commands?: Command[];
    /** Runs "/…"; false: it failed and the transcript explains, the text goes back into the field. */
    onCommand?: (text: string) => Promise<boolean>;
    /** The command list just opened (to load it again). */
    onCommandsOpen?: () => void;
};

const NO_COMMANDS: Command[] = [];

/**
 * Message field with send (Enter) and a hint line below. While the agent works, sending is not blocked: the
 * gateway queues the message and the queue above the field shows it. Stopping lives in the run status above.
 */
export default function ChatInput({
    onSend,
    running,
    disabled,
    placeholder,
    hint,
    toolbar,
    dense,
    commands,
    onCommand,
    onCommandsOpen,
}: Props) {
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>();
    const [anchor, setAnchor] = useState<HTMLDivElement | null>(null);
    const listId = `agent-slash-${useId().replace(/:/g, '')}`;
    const slash = useSlashCommands(onCommand ? commands ?? NO_COMMANDS : NO_COMMANDS, text, setText);
    const justSlash = text === '/';
    useEffect(() => {
        if (justSlash && onCommand) onCommandsOpen?.();
    }, [justSlash, onCommand, onCommandsOpen]);

    const send = async () => {
        const t = text.trim();
        if (!t || busy) return;
        setBusy(true);
        setError(undefined);
        // cleared right away (the message shows in the history or the queue); restored when sending fails
        setText('');
        try {
            if (onCommand && isSlashCommand(t)) {
                if (!(await onCommand(t))) setText((cur) => (cur.trim() ? `${t}\n\n${cur}` : t));
            } else await onSend(t);
        } catch (e) {
            setText((cur) => (cur.trim() ? `${t}\n\n${cur}` : t));
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    const onKeyDown = (e: KeyboardEvent) => {
        if (slash.onKeyDown(e)) return;
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
                placeholder={
                    running
                        ? 'Queue another message …'
                        : `${placeholder ?? 'Ask the agent …'}${onCommand ? ' (/ for commands)' : ''}`
                }
                ref={setAnchor}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={onKeyDown}
                sx={{ bgcolor: '#fff', '& .MuiInputBase-input': { fontSize: 14 } }}
                inputProps={{
                    role: onCommand ? 'combobox' : undefined,
                    'aria-autocomplete': onCommand ? 'list' : undefined,
                    'aria-expanded': onCommand ? slash.open : undefined,
                    'aria-controls': slash.open ? listId : undefined,
                    'aria-activedescendant': slash.open ? optionId(listId, slash.active) : undefined,
                }}
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
            {onCommand && <SlashCommandMenu menu={slash} anchor={anchor} id={listId} />}
            {error && <Typography sx={{ fontSize: 11.5, color: 'error.main' }}>{error}</Typography>}
            {(toolbar || !error) && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, mt: toolbar ? -0.5 : 0 }}>
                    {toolbar && <Box sx={{ flex: '1 1 auto', minWidth: 0, ml: -0.75 }}>{toolbar}</Box>}
                    {toolbar && dense ? (
                        <Tooltip title={hint ?? 'Write actions need your approval.'}>
                            <LockOutlinedIcon
                                aria-label={hint ?? 'Write actions need your approval.'}
                                sx={{ fontSize: 14, color: 'text.secondary', flex: 'none' }}
                            />
                        </Tooltip>
                    ) : (
                        <Typography
                            sx={{
                                fontSize: 11,
                                color: 'text.secondary',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 0.5,
                                flex: toolbar ? 'none' : undefined,
                                whiteSpace: 'nowrap',
                            }}
                        >
                            <LockOutlinedIcon sx={{ fontSize: 12 }} />
                            {hint ?? 'Write actions need your approval.'}
                        </Typography>
                    )}
                </Box>
            )}
        </Box>
    );
}
