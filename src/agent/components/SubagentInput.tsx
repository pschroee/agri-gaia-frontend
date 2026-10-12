// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The field under a subagent's log (issue #81): a message to the subagent instead of "Subagents can't receive messages".
// Reduced on purpose: no attachments, no slash commands, no model choice; a running subagent reads a hint after its
// current step, a finished one takes a follow-up with its history. The state comes from subagentInputState.
import { KeyboardEvent, useEffect, useState } from 'react';

import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import Typography from '@mui/material/Typography';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';

import { subagentSendErrorText } from '../subagents';
import type { SubagentInputState } from '../subagents';
import { agentColors } from './tokens';

type Props = {
    state: SubagentInputState;
    /** Subagents at the same time (gateway config), for the limit message. */
    limit?: number;
    /** Sends the text to the subagent; throws with the gateway's error (shown above the field, text kept). */
    onSend: (text: string) => Promise<void>;
    /** Puts text into the field ("Send again" of a failed message); a new nonce each time. */
    prefill?: { text: string; nonce: number };
};

export default function SubagentInput({ state, limit, onSend, prefill }: Props) {
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>();
    // the parent replaces the prefill object only when the user asks again ("Send again")
    useEffect(() => {
        if (!prefill) return;
        setText(prefill.text);
        setError(undefined);
    }, [prefill]);
    const locked = state.mode === 'locked';
    const canSend = !locked && !state.blocked && !busy && text.trim().length > 0;
    const submit = async () => {
        const t = text.trim();
        if (!canSend || !t) return;
        setBusy(true);
        setError(undefined);
        try {
            await onSend(t);
            setText('');
        } catch (e) {
            setError(subagentSendErrorText(e, limit));
        } finally {
            setBusy(false);
        }
    };
    const onKeyDown = (e: KeyboardEvent) => {
        // Enter sends, Shift+Enter starts a new line (as in the chat field)
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void submit();
        }
    };
    // a trashed subagent has no field (its way back is the top-left arrow)
    if (state.mode === 'hidden') return null;
    return (
        <Box data-testid="agent-subagent-input" sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, minWidth: 0 }}>
            {state.note && !locked && (
                <Typography role="status" sx={{ fontSize: 12.5, color: 'text.secondary' }}>
                    {state.note}
                </Typography>
            )}
            {error && (
                <Typography role="alert" sx={{ fontSize: 12.5, color: 'error.main' }}>
                    {error}
                </Typography>
            )}
            <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1.25, minWidth: 0 }}>
                <Box
                    sx={{
                        flex: 1,
                        minWidth: 0,
                        display: 'flex',
                        alignItems: 'flex-end',
                        gap: 1,
                        px: 1.5,
                        py: 0.75,
                        border: 1,
                        borderColor: 'divider',
                        borderRadius: '8px',
                        bgcolor: locked ? 'action.disabledBackground' : '#fff',
                        '&:focus-within': { borderColor: 'primary.main', borderWidth: 2, px: '11px', py: '5px' },
                    }}
                >
                    <InputBase
                        multiline
                        maxRows={6}
                        fullWidth
                        value={text}
                        disabled={locked}
                        onChange={(e) => setText(e.target.value)}
                        onKeyDown={onKeyDown}
                        placeholder={locked ? state.note : state.placeholder}
                        inputProps={{ 'aria-label': 'Message to the subagent' }}
                        data-testid="agent-subagent-input-field"
                        sx={{ fontSize: 14, lineHeight: 1.5, alignItems: 'flex-end' }}
                    />
                    <IconButton
                        onClick={() => void submit()}
                        disabled={!canSend}
                        aria-label="Send to subagent"
                        data-testid="agent-subagent-send"
                        sx={{
                            flex: 'none',
                            width: 36,
                            height: 36,
                            bgcolor: canSend ? 'primary.main' : 'action.disabledBackground',
                            color: '#fff',
                            '&:hover': { bgcolor: canSend ? 'primary.dark' : 'action.disabledBackground' },
                            '&.Mui-disabled': { color: '#fff', bgcolor: 'action.disabledBackground' },
                        }}
                    >
                        <ArrowUpwardIcon sx={{ fontSize: 20 }} />
                    </IconButton>
                </Box>
            </Box>
        </Box>
    );
}
