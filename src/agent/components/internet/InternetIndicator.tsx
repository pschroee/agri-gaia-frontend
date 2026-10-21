// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The internet display of a chat (gateway issue #175, design `internet-access`, b1/b5): in the header of the agent
// page a text button with the state, a badge for several grants and the "n blocked" chip; in the panel the globe next
// to the chat selector with two badges. A click opens the popover; with the internet off it asks "Switch on full
// access?" first. Replaces `InternetToggle`.

import { useMemo, useRef, useState } from 'react';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import BlockIcon from '@mui/icons-material/Block';
import PublicIcon from '@mui/icons-material/Public';
import PublicOffIcon from '@mui/icons-material/PublicOff';

import AlertSnackbar from '../../../components/common/AlertSnackbar';
import { useInternetContext } from '../../InternetContext';
import { activeGrants, normalizeGrants } from '../../internet';
import { WARNING_TEXT_COLOR, indicatorState } from '../../internetView';
import type { Chat } from '../../types';
import { useChatSettings } from '../../useChatSettings';
import { useNow } from '../../useNow';
import { agentColors, rowIconButtonSx } from '../tokens';
import InternetPopover from './InternetPopover';

/** Once a minute is enough for "24 min"; the display also follows every stream event. */
const TICK_MS = 30_000;

export default function InternetIndicator({ chat, compact = false }: { chat: Chat; compact?: boolean }) {
    const handle = useInternetContext();
    const settings = useChatSettings(chat);
    const [open, setOpen] = useState(false);
    const anchor = useRef<HTMLButtonElement>(null);
    // before the first read the chat's own list stands in, so the display does not flash "off"
    const seeded = useMemo(() => activeGrants(normalizeGrants(chat.internet_grants)), [chat.internet_grants]);
    const active = handle?.loaded ? handle.active : seeded;
    const blocked = handle?.blocked ?? chat.internet_blocked;
    const now = useNow(active.length > 0, TICK_MS);
    const state = indicatorState(active, blocked, now);
    const off = state.mode === 'off';
    const full = state.mode === 'full';
    const color = full ? WARNING_TEXT_COLOR : off ? 'text.secondary' : agentColors.green;
    const Icon = off ? PublicOffIcon : PublicIcon;
    const blockedCount = blocked?.count ?? 0;

    const common = {
        ref: anchor,
        'aria-label': state.aria,
        'aria-haspopup': 'dialog' as const,
        'aria-expanded': open,
        'data-testid': 'agent-internet-indicator',
        'data-internet': state.mode,
        onClick: () => setOpen(true),
    };

    const control = compact ? (
        <Badge
            overlap="rectangular"
            color="error"
            badgeContent={blockedCount}
            invisible={blockedCount === 0}
            anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
            slotProps={{ badge: { 'aria-hidden': true } as object }}
            sx={{ flex: 'none' }}
        >
            <Badge
                overlap="rectangular"
                color="primary"
                badgeContent={state.count}
                invisible={state.count < 2}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                slotProps={{ badge: { 'aria-hidden': true } as object }}
            >
                <IconButton
                    {...common}
                    size="small"
                    sx={{
                        ...rowIconButtonSx,
                        color,
                        borderColor: full ? WARNING_TEXT_COLOR : off ? agentColors.outline : agentColors.green,
                    }}
                >
                    <Icon sx={{ fontSize: 22, color: full ? '#ed6c02' : undefined }} aria-hidden />
                </IconButton>
            </Badge>
        </Badge>
    ) : (
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, flex: 'none' }}>
            <Button
                {...common}
                size="small"
                color="inherit"
                startIcon={
                    <Badge
                        color="primary"
                        badgeContent={state.count}
                        invisible={state.count < 2}
                        slotProps={{ badge: { 'aria-hidden': true } as object }}
                    >
                        <Icon sx={{ fontSize: 18, color: full ? '#ed6c02' : color }} aria-hidden />
                    </Badge>
                }
                sx={{ color, textTransform: 'none', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', minWidth: 0 }}
            >
                {state.text}
            </Button>
            {blockedCount > 0 && (
                <Chip
                    component="span"
                    size="small"
                    color="error"
                    variant="outlined"
                    icon={<BlockIcon />}
                    label={state.blockedText}
                    aria-hidden
                    sx={{ height: 22, fontSize: 12 }}
                />
            )}
        </Box>
    );

    const close = () => setOpen(false);
    return (
        <>
            {control}
            <InternetPopover
                open={open}
                // the panel's popover takes the width of the chat row, the page's hangs under the button
                anchorEl={
                    compact
                        ? anchor.current?.closest('[data-testid="agent-chat-picker-row"]') ?? anchor.current
                        : anchor.current
                }
                onClose={close}
                chatId={chat.id}
                active={active}
                blocked={blocked}
                now={now}
                onEndGrant={(id) => handle?.endGrant(id) ?? Promise.resolve()}
                onEndAll={() => handle?.endAll() ?? Promise.resolve()}
                confirmSwitchOn={off}
                busy={settings.busy === 'internet'}
                onSwitchOn={() => {
                    close();
                    void settings.setInternet(true);
                }}
                wide={compact}
            />
            <AlertSnackbar
                severity="error"
                message={settings.error}
                open={!!settings.error}
                onClose={settings.clearError}
            />
        </>
    );
}
