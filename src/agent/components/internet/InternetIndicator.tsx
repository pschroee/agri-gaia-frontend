// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The internet display of a chat (gateway issue #175, design `internet-access`, b1/b5): in the header of the agent
// page a calm status button with the state ("Internet off · 8 blocked", "+1" for several grants); in the panel the
// globe next to the chat selector with a badge for several grants. #228: quiet blocked count, never red; the
// tooltip explains it. A click opens the popover; with the internet off it asks "Switch on full
// access?" first. Replaces `InternetToggle`.

import { useMemo, useRef, useState } from 'react';
import Badge from '@mui/material/Badge';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import PublicIcon from '@mui/icons-material/Public';
import PublicOffIcon from '@mui/icons-material/PublicOff';

import AlertSnackbar from '../../../components/common/AlertSnackbar';
import { useInternetContext } from '../../InternetContext';
import { activeGrants, normalizeGrants } from '../../internet';
import { WARNING_TEXT_COLOR, indicatorState, indicatorTooltip } from '../../internetView';
import type { Chat } from '../../types';
import { useChatSettings } from '../../useChatSettings';
import { useNow } from '../../useNow';
import HeaderStatusButton, { type StatusTone } from '../HeaderStatusButton';
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

    const tooltip = indicatorTooltip(state, blocked);
    const tone: StatusTone = off ? 'default' : full ? 'attention' : 'running';

    const control = compact ? (
        <Badge
            overlap="rectangular"
            color="primary"
            badgeContent={state.count}
            invisible={state.count < 2}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            slotProps={{ badge: { 'aria-hidden': true } as object }}
            sx={{ flex: 'none' }}
        >
            <Tooltip title={tooltip}>
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
            </Tooltip>
        </Badge>
    ) : (
        <HeaderStatusButton
            icon={<Icon sx={{ fontSize: 18 }} aria-hidden />}
            label={
                <>
                    {state.text}
                    {state.count > 1 && <span style={{ color: agentColors.muted }}> +{state.count - 1}</span>}
                    {blockedCount > 0 && <span style={{ color: agentColors.muted }}> · {blockedCount} blocked</span>}
                </>
            }
            tone={tone}
            open={open}
            onClick={() => setOpen(true)}
            ariaLabel={state.aria}
            tooltip={tooltip}
            testId="agent-internet-indicator"
            buttonRef={anchor}
            dataAttrs={{ 'data-internet': state.mode, 'data-blocked': String(blockedCount) }}
        />
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
                // with refused connections the click shows them (the tooltip says "click for details", #228)
                confirmSwitchOn={off && blockedCount === 0}
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
