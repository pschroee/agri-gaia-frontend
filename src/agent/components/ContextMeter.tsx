// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { ReactNode } from 'react';

import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip';

import type { Chat } from '../types';
import {
    cacheHitRate,
    compactionReason,
    costSplit,
    describeContext,
    formatPercent,
    formatTokens,
    formatTokensShort,
    formatUsd,
} from '../usage';
import type { Compacting, ContextLevel } from '../usage';
import { agentColors } from './tokens';

export const LEVEL_COLOR: Record<ContextLevel, string> = {
    normal: agentColors.green,
    warn: agentColors.amber,
    danger: agentColors.red,
};
const LEVEL_TEXT: Record<ContextLevel, string> = {
    normal: 'text.secondary',
    warn: agentColors.amberText,
    danger: agentColors.red,
};

/** Ring that fills with the share of the context window used; a tick marks where auto-compaction starts. */
export function ContextRing({
    ratio,
    thresholdRatio,
    level,
    size = 18,
    compacting = false,
}: {
    ratio: number;
    thresholdRatio?: number;
    level: ContextLevel;
    size?: number;
    compacting?: boolean;
}) {
    if (compacting) {
        return <CircularProgress size={size - 2} thickness={5} sx={{ color: agentColors.green, m: '1px', flex: 'none' }} />;
    }
    const r = 7;
    const c = 2 * Math.PI * r;
    const t = thresholdRatio !== undefined && thresholdRatio > 0 && thresholdRatio < 1 ? thresholdRatio : undefined;
    // tick on the ring at the threshold, from the top clockwise
    const a = t !== undefined ? 2 * Math.PI * t - Math.PI / 2 : 0;
    return (
        <Box
            component="svg"
            viewBox="0 0 18 18"
            aria-hidden
            data-context-level={level}
            sx={{ width: size, height: size, flex: 'none', display: 'block' }}
        >
            <circle cx="9" cy="9" r={r} fill="none" strokeWidth="2.5" stroke="#e0e0e0" />
            {ratio > 0 && (
                <circle
                    cx="9"
                    cy="9"
                    r={r}
                    fill="none"
                    strokeWidth="2.5"
                    strokeLinecap={ratio < 1 ? 'round' : 'butt'}
                    stroke={LEVEL_COLOR[level]}
                    strokeDasharray={`${c * Math.max(ratio, 0.02)} ${c}`}
                    transform="rotate(-90 9 9)"
                />
            )}
            {t !== undefined && (
                <line
                    x1={9 + 5 * Math.cos(a)}
                    y1={9 + 5 * Math.sin(a)}
                    x2={9 + 9 * Math.cos(a)}
                    y2={9 + 9 * Math.sin(a)}
                    stroke="#616161"
                    strokeWidth="1"
                />
            )}
        </Box>
    );
}

function Rows({ rows }: { rows: [string, ReactNode][] }) {
    return (
        <Box
            component="dl"
            sx={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', columnGap: 1.5, rowGap: 0.25, m: 0 }}
        >
            {rows.map(([k, v]) => (
                <Box key={k} sx={{ display: 'contents' }}>
                    <Box component="dt" sx={{ opacity: 0.75 }}>
                        {k}
                    </Box>
                    <Box component="dd" sx={{ m: 0, fontVariantNumeric: 'tabular-nums' }}>
                        {v}
                    </Box>
                </Box>
            ))}
        </Box>
    );
}

const tipSx = { fontSize: 12, lineHeight: 1.45, p: 0.5, maxWidth: 300 } as const;

/**
 * Context usage as a ring with the percentage; the tooltip names tokens, window, compaction threshold and
 * reserve. Amber shortly before auto-compaction, red at it; a running compaction shows as a spinner.
 */
export function ContextMeter({
    chat,
    compacting,
    label = false,
}: {
    chat: Chat;
    compacting?: Compacting;
    /** Wide layout: the word "context" after the percentage and "Compacting …" next to the spinner. */
    label?: boolean;
}) {
    const ctx = chat.context;
    const autoCompact = chat.auto_compact ?? true;
    const d = ctx ? describeContext(ctx, autoCompact) : undefined;
    const level = d?.level ?? 'normal';
    const running = !!compacting;
    const rows: [string, ReactNode][] = d
        ? [
              ...(d.measured ? ([['Used', d.used]] as [string, ReactNode][]) : []),
              ['Window', d.window],
              ['Auto-compaction', autoCompact ? `from ${d.threshold}` : 'off'],
              ['Reserve', d.reserve],
              ...(d.headroom ? ([['Headroom', d.headroom]] as [string, ReactNode][]) : []),
              ['Compactions', String(chat.compactions ?? 0)],
          ]
        : [['Compactions', String(chat.compactions ?? 0)]];
    const title = running
        ? `Compacting the context${compacting?.reason ? ` (${compactionReason(compacting.reason)})` : ''} …`
        : d
          ? d.measured
              ? `Context ${d.percent}`
              : 'Context: measured again after the next answer'
          : 'Context not measured yet';
    const warning =
        !running && d?.measured && level !== 'normal'
            ? autoCompact
                ? level === 'danger'
                    ? 'The agent compacts the conversation with its next answer.'
                    : 'Auto-compaction comes soon: older parts of the conversation will be summarised.'
                : 'The context is nearly full and auto-compaction is off.'
            : undefined;
    return (
        <Tooltip
            title={
                <Box sx={tipSx}>
                    <Box sx={{ fontWeight: 500, mb: 0.5 }}>{title}</Box>
                    <Rows rows={rows} />
                    {warning && <Box sx={{ mt: 0.75 }}>{warning}</Box>}
                </Box>
            }
        >
            <Box
                component="span"
                tabIndex={0}
                role="status"
                aria-label={running ? 'Compacting the context' : `Context usage ${d?.percent ?? 'unknown'}`}
                data-testid="agent-context-meter"
                data-context-level={running ? 'compacting' : level}
                sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.6,
                    flex: 'none',
                    whiteSpace: 'nowrap',
                    fontSize: 12,
                    fontVariantNumeric: 'tabular-nums',
                    color: running ? agentColors.green : LEVEL_TEXT[level],
                    fontWeight: level === 'normal' || running ? 400 : 500,
                    cursor: 'default',
                    borderRadius: 1,
                    outline: 'none',
                    '&:focus-visible': { boxShadow: `0 0 0 2px ${agentColors.greenLine}` },
                }}
            >
                <ContextRing
                    ratio={d?.ratio ?? 0}
                    thresholdRatio={autoCompact ? d?.thresholdRatio : undefined}
                    level={level}
                    compacting={running}
                />
                {running ? (label ? 'Compacting …' : null) : (d?.percent ?? '–')}
                {label && !running && (
                    <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>
                        context
                    </Box>
                )}
            </Box>
        </Tooltip>
    );
}

/** Total cost of the chat by tariff; the tooltip splits it and names the tokens. */
export function ChatCost({ chat, tokens = false }: { chat: Chat; tokens?: boolean }) {
    const c = costSplit(chat);
    const t = chat.tokens;
    const cache = cacheHitRate(t?.input, t?.cache_read);
    const rows: [string, ReactNode][] = [
        ['Tokens', `${formatTokens(t?.total)} (${formatTokens(t?.input)} in · ${formatTokens(t?.output)} out)`],
        ['From cache', `${formatTokens(t?.cache_read)}${cache !== undefined ? ` (${formatPercent(cache * 100)})` : ''}`],
        ['Main answers', formatUsd(c.main)],
        ['Subagents, compaction', formatUsd(c.other)],
        ['Model calls', String(c.calls)],
    ];
    return (
        <Tooltip
            title={
                <Box sx={tipSx}>
                    <Box sx={{ fontWeight: 500, mb: 0.5 }}>Cost {formatUsd(c.total)}</Box>
                    <Rows rows={rows} />
                    <Box sx={{ mt: 0.75, opacity: 0.85 }}>
                        By tariff (peak or off-peak at the time of each call), counted at the gateway's model proxy.
                    </Box>
                </Box>
            }
        >
            <Box
                component="span"
                tabIndex={0}
                data-testid="agent-chat-cost"
                aria-label={`Cost ${formatUsd(c.total)}`}
                sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.75,
                    flex: 'none',
                    whiteSpace: 'nowrap',
                    fontSize: 12,
                    color: 'text.secondary',
                    fontVariantNumeric: 'tabular-nums',
                    cursor: 'default',
                    borderRadius: 1,
                    outline: 'none',
                    '&:focus-visible': { boxShadow: `0 0 0 2px ${agentColors.greenLine}` },
                }}
            >
                {tokens && (
                    <span>
                        <Box component="span" sx={{ color: 'text.primary' }}>
                            {formatTokensShort(t?.total)}
                        </Box>{' '}
                        tokens ·
                    </span>
                )}
                <Box component="span" sx={{ color: 'text.primary' }}>
                    {formatUsd(c.total, true)}
                </Box>
            </Box>
        </Tooltip>
    );
}
