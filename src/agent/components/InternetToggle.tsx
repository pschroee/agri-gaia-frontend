// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Switch from '@mui/material/Switch';
import Tooltip from '@mui/material/Tooltip';
import PublicIcon from '@mui/icons-material/Public';
import PublicOffIcon from '@mui/icons-material/PublicOff';

import AlertSnackbar from '../../components/common/AlertSnackbar';
import { internetHint } from '../settings';
import type { Chat } from '../types';
import { useChatSettings } from '../useChatSettings';
import { agentColors } from './tokens';

/**
 * Internet access of the chat's sandbox: a globe that shows the state. In the narrow panel the globe itself is the
 * switch (role "switch", next to the chat selector); in the chat header of the agent page a labelled switch follows it.
 */
export default function InternetToggle({ chat, compact = false }: { chat: Chat; compact?: boolean }) {
    const settings = useChatSettings(chat);
    const on = chat.internet;
    const busy = settings.busy === 'internet';
    const hint = internetHint(chat);
    const toggle = () => void settings.setInternet(!on);
    const Icon = on ? PublicIcon : PublicOffIcon;
    const color = on ? agentColors.green : 'text.disabled';

    const control = compact ? (
        <Tooltip title={`${hint} Click to switch ${on ? 'off' : 'on'}.`}>
            <IconButton
                size="small"
                role="switch"
                aria-checked={on}
                aria-label="Internet access"
                data-testid="agent-internet-toggle"
                data-internet={on ? 'on' : 'off'}
                disabled={busy}
                onClick={toggle}
                sx={{
                    flex: 'none',
                    color,
                    bgcolor: on ? agentColors.greenTint : undefined,
                    border: 1,
                    borderColor: on ? agentColors.greenLine : 'divider',
                    borderRadius: 1,
                    p: '6px',
                }}
            >
                {busy ? <CircularProgress size={16} /> : <Icon sx={{ fontSize: 18 }} />}
            </IconButton>
        </Tooltip>
    ) : (
        <Tooltip title={hint}>
            <Box
                component="label"
                data-testid="agent-internet-toggle"
                data-internet={on ? 'on' : 'off'}
                sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.5,
                    flex: 'none',
                    fontSize: 12,
                    color: on ? agentColors.green : 'text.secondary',
                    cursor: busy ? 'default' : 'pointer',
                    whiteSpace: 'nowrap',
                }}
            >
                <Icon sx={{ fontSize: 17, color }} aria-hidden />
                Internet
                <Switch
                    size="small"
                    checked={on}
                    disabled={busy}
                    onChange={toggle}
                    inputProps={{ 'aria-label': 'Internet access' }}
                    sx={{ ml: -0.25 }}
                />
            </Box>
        </Tooltip>
    );

    return (
        <>
            {control}
            <AlertSnackbar
                severity="error"
                message={settings.error}
                open={!!settings.error}
                onClose={settings.clearError}
            />
        </>
    );
}
