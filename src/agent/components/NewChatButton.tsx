// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { alpha } from '@mui/material/styles';
import type { SxProps, Theme } from '@mui/material/styles';
import AddIcon from '@mui/icons-material/Add';

import { useAgent } from '../AgentContext';
import { canStartNewChat } from '../newChat';
import { agentColors, rowIconButtonSx } from './tokens';

/**
 * "New chat": creates the chat right away with the gateway's defaults and opens it with the focus in the input
 * (no dialog, issue #30). While the request is on its way the button shows a spinner and takes no second click.
 * `compact` is the plus icon of the panel's chat row (issue #38), the same size and look as the internet globe.
 */
export default function NewChatButton({
    fullWidth,
    compact,
    sx,
}: {
    fullWidth?: boolean;
    compact?: boolean;
    sx?: SxProps<Theme>;
}) {
    const { status, creatingChat, startNewChat } = useAgent();
    const disabled = !canStartNewChat(status, creatingChat);
    const spinner = <CircularProgress size={compact ? 16 : 14} aria-label="Creating the chat" />;
    if (compact)
        return (
            <Tooltip title="New chat">
                {/* a disabled button fires no events, so the tooltip listens on the wrapper */}
                <Box component="span" sx={[{ display: 'inline-flex', flex: 'none' }, ...(Array.isArray(sx) ? sx : [sx])]}>
                    <IconButton
                        size="small"
                        aria-label="New chat"
                        disabled={disabled}
                        onClick={() => void startNewChat()}
                        sx={{ ...rowIconButtonSx, color: agentColors.green, '&:hover': { bgcolor: alpha(agentColors.green, 0.04) } }}
                    >
                        {creatingChat ? spinner : <AddIcon sx={{ fontSize: 22 }} />}
                    </IconButton>
                </Box>
            </Tooltip>
        );
    return (
        <Button
            size={fullWidth ? 'medium' : 'small'}
            variant="outlined"
            fullWidth={fullWidth}
            startIcon={creatingChat ? spinner : <AddIcon />}
            disabled={disabled}
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
