// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import type { SxProps, Theme } from '@mui/material/styles';
import AddIcon from '@mui/icons-material/Add';

import { useAgent } from '../AgentContext';
import { canStartNewChat } from '../newChat';

/**
 * "New chat": creates the chat right away with the gateway's defaults and opens it with the focus in the input
 * (no dialog, issue #30). While the request is on its way the button shows a spinner and takes no second click.
 */
export default function NewChatButton({ fullWidth, sx }: { fullWidth?: boolean; sx?: SxProps<Theme> }) {
    const { status, creatingChat, startNewChat } = useAgent();
    return (
        <Button
            size={fullWidth ? 'medium' : 'small'}
            variant="outlined"
            fullWidth={fullWidth}
            startIcon={creatingChat ? <CircularProgress size={14} aria-label="Creating the chat" /> : <AddIcon />}
            disabled={!canStartNewChat(status, creatingChat)}
            onClick={() => void startNewChat()}
            sx={sx}
        >
            New chat
        </Button>
    );
}

/** Why the last "New chat" failed, closable; nothing otherwise. */
export function NewChatError({ sx }: { sx?: SxProps<Theme> }) {
    const { newChatError, dismissNewChatError } = useAgent();
    if (!newChatError) return null;
    return (
        <Alert severity="error" onClose={dismissNewChatError} sx={[{ fontSize: 12.5 }, ...(Array.isArray(sx) ? sx : [sx])]}>
            {newChatError}
        </Alert>
    );
}
