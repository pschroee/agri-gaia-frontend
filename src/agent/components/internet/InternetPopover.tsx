// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The popover of the internet indicator (gateway issue #175, design `internet-access`, b3/b4/b7/b8): the active grants
// with their list, remaining time or data and a switch-off each, the latest refusals, "Show in Activity" and SWITCH
// ALL OFF. With the internet off the same popover asks "Switch on full access?" (b2/b6, A22).

import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import LinearProgress from '@mui/material/LinearProgress';
import Popover from '@mui/material/Popover';
import Typography from '@mui/material/Typography';
import BlockIcon from '@mui/icons-material/Block';
import InventoryIcon from '@mui/icons-material/Inventory2';
import LinkIcon from '@mui/icons-material/Link';
import PublicIcon from '@mui/icons-material/Public';
import PublicOffIcon from '@mui/icons-material/PublicOff';
import TravelExploreIcon from '@mui/icons-material/TravelExplore';

import type { InternetBlocked, InternetGrant, InternetKind } from '../../internet';
import {
    blockedActivityLink,
    blockedDetail,
    blockedTarget,
    grantProgress,
    packageNote,
    popoverGrantTitle,
    shownBlocked,
    shownRoots,
    showInActivityText,
} from '../../internetIndicator';
import {
    BLOCKED_EXPLAINER,
    FULL_POPOVER_LINE,
    KIND_CHIP,
    NOTHING_BLOCKED,
    PACKAGE_FOLD,
    POPOVER_EMPTY,
    SEARCH_POPOVER_LINE,
    SHOW_FEWER_TEXT,
    SWITCH_ON_TITLE,
    WARNING_AREA_COLOR,
    WARNING_TEXT_COLOR,
    blockedHeading,
    rootPackages,
    showAllText,
    switchOnText,
} from '../../internetView';
import { MONO, agentColors } from '../tokens';

const ICONS: Record<InternetKind, typeof PublicIcon> = {
    search: TravelExploreIcon,
    domains: LinkIcon,
    packages: InventoryIcon,
    full: PublicIcon,
};

export type InternetPopoverProps = {
    anchorEl: HTMLElement | null;
    open: boolean;
    onClose: () => void;
    chatId: string;
    active: InternetGrant[];
    blocked?: InternetBlocked;
    now: number;
    /** Ends one grant; rejects with the failure. */
    onEndGrant: (id: number) => Promise<void>;
    onEndAll: () => Promise<void>;
    /** Internet off: ask "Switch on full access?" instead of listing grants. */
    confirmSwitchOn?: boolean;
    onSwitchOn?: () => void;
    busy?: boolean;
    /** Panel and phone: the popover takes the width of the anchor (the chat row). */
    wide?: boolean;
};

const chipSx = (full: boolean) => ({
    height: 20,
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: 0.5,
    ...(full ? { color: WARNING_TEXT_COLOR, borderColor: '#ffb74d', bgcolor: '#fff4e5' } : { color: 'text.secondary' }),
});

function GrantBlock({
    grant,
    now,
    first,
    onEnd,
}: {
    grant: InternetGrant;
    now: number;
    first: boolean;
    onEnd: () => void;
}) {
    const [all, setAll] = useState(false);
    const full = grant.kind === 'full';
    const accent = full ? WARNING_AREA_COLOR : agentColors.green;
    const Icon = ICONS[grant.kind];
    const title = popoverGrantTitle(grant);
    const prog = grantProgress(grant, now);
    const roots = rootPackages(grant.packages);
    const text = grant.kind === 'search' ? SEARCH_POPOVER_LINE : full ? FULL_POPOVER_LINE : '';
    const lines =
        grant.kind === 'domains'
            ? grant.domains.map((d) => ({ eco: '', name: d, note: '' }))
            : grant.kind === 'packages'
            ? shownRoots(grant.packages, all).map((p) => ({
                  eco: p.ecosystem,
                  name: p.name,
                  note: packageNote(p),
              }))
            : [];
    return (
        <Box
            data-testid="agent-internet-grant"
            sx={{
                borderTop: 1,
                borderColor: 'divider',
                px: 2,
                py: 1.5,
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Icon sx={{ fontSize: 18, color: accent }} aria-hidden />
                <Typography component="span" sx={{ fontSize: 14, fontWeight: 500 }}>
                    {title}
                </Typography>
                <Chip size="small" variant="outlined" label={KIND_CHIP[grant.kind]} sx={chipSx(full)} />
                <Button
                    size="small"
                    variant="outlined"
                    autoFocus={first}
                    aria-label={`Switch off ${title.toLowerCase()}`}
                    onClick={onEnd}
                    sx={{ ml: 'auto', height: 28, whiteSpace: 'nowrap' }}
                >
                    Switch off
                </Button>
            </Box>
            {text && <Typography sx={{ fontSize: 13, lineHeight: 1.45, color: 'text.secondary' }}>{text}</Typography>}
            {lines.length > 0 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    {lines.map((l) => (
                        <Box
                            key={`${l.eco}:${l.name}`}
                            sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 12.5, minWidth: 0 }}
                        >
                            {l.eco && (
                                <Chip
                                    size="small"
                                    variant="outlined"
                                    label={l.eco}
                                    sx={{ height: 18, fontSize: 11, color: 'text.secondary', bgcolor: '#fafafa' }}
                                />
                            )}
                            <Box
                                component="span"
                                sx={{
                                    fontFamily: MONO,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    minWidth: 0,
                                }}
                            >
                                {l.name}
                            </Box>
                            {l.note && (
                                <Box
                                    component="span"
                                    sx={{ ml: 'auto', fontSize: 12, color: 'text.secondary', whiteSpace: 'nowrap' }}
                                >
                                    {l.note}
                                </Box>
                            )}
                        </Box>
                    ))}
                    {grant.kind === 'packages' && roots.length > PACKAGE_FOLD && (
                        <Link
                            component="button"
                            type="button"
                            underline="hover"
                            aria-expanded={all}
                            onClick={() => setAll((v) => !v)}
                            sx={{ alignSelf: 'flex-start', fontSize: 12.5 }}
                        >
                            {all ? SHOW_FEWER_TEXT : showAllText(roots.length)}
                        </Link>
                    )}
                </Box>
            )}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                <LinearProgress
                    variant="determinate"
                    value={prog.value}
                    aria-label={grant.kind === 'packages' ? 'Packages installed' : 'Data used'}
                    aria-valuetext={prog.valueText}
                    sx={{
                        height: 4,
                        borderRadius: 2,
                        bgcolor: full ? 'rgba(237, 108, 2, 0.2)' : 'rgba(15, 84, 50, 0.16)',
                        '& .MuiLinearProgress-bar': { bgcolor: full ? '#ed6c02' : agentColors.green },
                    }}
                />
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap', fontSize: 12 }}>
                    <Box component="span" sx={{ color: 'text.primary' }}>
                        {prog.caption}
                    </Box>
                    <Box component="span" sx={{ color: 'text.secondary' }}>
                        {prog.time}
                    </Box>
                </Box>
                {prog.extra && <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{prog.extra}</Typography>}
            </Box>
        </Box>
    );
}

function BlockedBlock({ blocked }: { blocked?: InternetBlocked }) {
    const rows = shownBlocked(blocked);
    return (
        <Box
            data-testid="agent-internet-blocked"
            sx={{
                borderTop: 1,
                borderColor: 'divider',
                px: 2,
                py: 1.5,
                bgcolor: '#fafafa',
                display: 'flex',
                flexDirection: 'column',
                gap: 0.75,
            }}
        >
            <Typography
                sx={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: 'text.secondary',
                    letterSpacing: 0.8,
                    textTransform: 'uppercase',
                }}
            >
                {blockedHeading(blocked)}
            </Typography>
            <Typography data-testid="agent-internet-blocked-explainer" sx={{ fontSize: 12, color: 'text.secondary' }}>
                {BLOCKED_EXPLAINER}
            </Typography>
            {rows.map((e, i) => (
                <Box
                    key={`${e.at}:${i}`}
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: '14px minmax(0, 1fr)',
                        columnGap: 0.75,
                        fontSize: 12,
                        lineHeight: '16px',
                    }}
                >
                    <BlockIcon sx={{ fontSize: 14, color: 'text.secondary' }} aria-hidden />
                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, minWidth: 0 }}>
                        <Box
                            component="span"
                            sx={{
                                fontFamily: MONO,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                minWidth: 0,
                            }}
                        >
                            {blockedTarget(e)}
                        </Box>
                        <Box component="span" sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
                            · blocked
                        </Box>
                    </Box>
                    <Box component="span" sx={{ gridColumn: 2, color: 'text.secondary' }}>
                        {blockedDetail(e)}
                    </Box>
                </Box>
            ))}
            {rows.length === 0 && (
                <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{NOTHING_BLOCKED}</Typography>
            )}
        </Box>
    );
}

export default function InternetPopover(p: InternetPopoverProps) {
    const [error, setError] = useState<string>();
    const run = (f: () => Promise<void>) => {
        setError(undefined);
        f().catch((e: unknown) => setError(e instanceof Error ? e.message : 'The request failed.'));
    };
    const width = p.wide ? p.anchorEl?.offsetWidth ?? 380 : 380;
    return (
        <Popover
            open={p.open}
            anchorEl={p.anchorEl}
            onClose={p.onClose}
            anchorOrigin={{ vertical: 'bottom', horizontal: p.wide ? 'left' : 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: p.wide ? 'left' : 'right' }}
            slotProps={{
                paper: {
                    role: 'dialog',
                    'aria-label': p.confirmSwitchOn ? SWITCH_ON_TITLE : 'Internet access',
                    elevation: 8,
                    sx: {
                        mt: 0.5,
                        width,
                        maxWidth: 'calc(100vw - 16px)',
                        maxHeight: 'calc(100vh - 96px)',
                        overflowY: 'auto',
                    },
                } as object,
            }}
        >
            {p.confirmSwitchOn ? (
                <Box
                    data-testid="agent-internet-confirm"
                    sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}
                >
                    <Typography sx={{ fontSize: 15, fontWeight: 500 }}>{SWITCH_ON_TITLE}</Typography>
                    <Typography sx={{ fontSize: 13, lineHeight: 1.45, color: 'text.secondary' }}>
                        {switchOnText()}
                    </Typography>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                        <Button size="small" onClick={p.onClose}>
                            Cancel
                        </Button>
                        <Button
                            size="small"
                            variant="contained"
                            color="warning"
                            disabled={p.busy}
                            onClick={p.onSwitchOn}
                        >
                            Switch on
                        </Button>
                    </Box>
                </Box>
            ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                    <Box
                        sx={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'baseline',
                            px: 2,
                            pt: 1.75,
                            pb: 1.25,
                        }}
                    >
                        <Typography component="span" sx={{ fontSize: 15, fontWeight: 500 }}>
                            Internet access
                        </Typography>
                        <Typography component="span" sx={{ fontSize: 12, color: 'text.secondary' }}>
                            {p.active.length ? `${p.active.length} active` : 'off'}
                        </Typography>
                    </Box>
                    {p.active.map((g, i) => (
                        <GrantBlock
                            key={g.id}
                            grant={g}
                            now={p.now}
                            first={i === 0}
                            onEnd={() => run(() => p.onEndGrant(g.id))}
                        />
                    ))}
                    {p.active.length === 0 && (
                        <Typography
                            sx={{
                                borderTop: 1,
                                borderColor: 'divider',
                                p: 2,
                                fontSize: 13,
                                lineHeight: 1.45,
                                color: 'text.secondary',
                            }}
                        >
                            {POPOVER_EMPTY}
                        </Typography>
                    )}
                    {error && (
                        <Alert severity="error" sx={{ mx: 2, mb: 1 }}>
                            {error}
                        </Alert>
                    )}
                    <BlockedBlock blocked={p.blocked} />
                    <Box
                        sx={{
                            borderTop: 1,
                            borderColor: 'divider',
                            px: 2,
                            py: 1.25,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 1,
                            flexWrap: 'wrap',
                        }}
                    >
                        <Link
                            component={RouterLink}
                            to={blockedActivityLink(p.chatId)}
                            onClick={p.onClose}
                            underline="hover"
                            sx={{ fontSize: 13, fontWeight: 500 }}
                        >
                            {showInActivityText(p.blocked)}
                        </Link>
                        {p.active.length > 0 && (
                            <Button
                                size="small"
                                variant="outlined"
                                color="error"
                                startIcon={<PublicOffIcon />}
                                onClick={() => run(p.onEndAll)}
                            >
                                Switch all off
                            </Button>
                        )}
                    </Box>
                </Box>
            )}
        </Popover>
    );
}
