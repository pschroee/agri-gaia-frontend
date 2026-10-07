// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Link from '@mui/material/Link';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import { useAgent } from '../AgentContext';
import { agentApi } from '../api';
import { chatTitle, formatClock, variantLabel } from '../format';
import { effortLabel } from '../modelChoice';
import {
    activeConnection,
    activityText,
    APPROVAL_KIND_LABEL,
    bindingsText,
    approvalSubject,
    Check,
    formatAgo,
    formatPrice,
    gatewayCheck,
    modelRows,
    platformChecks,
    poolByVariant,
    poolTotals,
    shortImage,
    sortApprovals,
    STATUS_REFRESH_MS,
    subagentsAtOnce,
    Tone,
    VariantPool,
} from '../status';
import type { Approval, Config, Me, Model, PlatformStatus, Pool, Variant } from '../types';
import { formatTokensShort } from '../usage';
import { Kpi } from './ActivityView';
import { agentColors, blockSx, MONO } from './tokens';

type Snapshot = {
    at: number;
    gateway: { ms?: number; error?: unknown };
    me?: Me;
    pool?: Pool;
    poolError?: unknown;
    variants?: Variant[];
    models?: Model[];
    config?: Config;
    approvals?: Approval[];
    platform?: PlatformStatus;
    platformError?: unknown;
};

const settled = <T,>(r: PromiseSettledResult<T>) => (r.status === 'fulfilled' ? r.value : undefined);
const failed = (r: PromiseSettledResult<unknown>) => (r.status === 'rejected' ? r.reason : undefined);
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Loads everything the tab shows; a failed request leaves its section empty instead of failing the tab. */
async function loadSnapshot(): Promise<Snapshot> {
    const t0 = performance.now();
    const meP = agentApi.me().then((me) => ({ me, ms: Math.round(performance.now() - t0) }));
    const [me, pool, variants, models, config, approvals, platform] = await Promise.allSettled([
        meP,
        agentApi.pool(),
        agentApi.variants(),
        agentApi.models(),
        agentApi.config(),
        agentApi.pendingApprovals(),
        agentApi.platform(),
    ]);
    const meV = settled(me);
    const arr = <T,>(v: T[] | undefined) => (Array.isArray(v) ? v : undefined);
    return {
        at: Date.now(),
        gateway: meV ? { ms: meV.ms } : { error: failed(me) },
        me: meV?.me,
        pool: settled(pool),
        poolError: failed(pool),
        variants: arr(settled(variants)),
        models: arr(settled(models)),
        config: settled(config),
        approvals: arr(settled(approvals)),
        platform: settled(platform),
        platformError: failed(platform),
    };
}

function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
    return (
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, mb: 1.25 }}>
            <Typography
                component="h2"
                sx={{ fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: 'text.disabled' }}
            >
                {children}
            </Typography>
            {aside && <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>{aside}</Typography>}
        </Box>
    );
}

function Empty({ children }: { children: ReactNode }) {
    return <Typography sx={{ color: 'text.secondary', fontSize: 14, py: 1 }}>{children}</Typography>;
}

const TONE_COLOR: Record<Tone, string> = {
    ok: agentColors.ok,
    warn: agentColors.amber,
    bad: agentColors.red,
    off: '#bdbdbd',
};

function Dot({ tone }: { tone: Tone }) {
    return (
        <Box
            component="span"
            aria-hidden
            sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: TONE_COLOR[tone], flex: 'none', mt: '5px' }}
        />
    );
}

function Reachability({ checks }: { checks: Check[] }) {
    return (
        <Box sx={{ ...blockSx, px: 2, py: 0.5 }} data-testid="agent-status-reachability">
            {checks.map((c, i) => (
                <Box
                    key={c.key}
                    data-tone={c.tone}
                    data-check={c.key}
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: '18px 160px minmax(0, 1fr)',
                        alignItems: 'start',
                        py: 1.25,
                        borderTop: i === 0 ? 0 : 1,
                        borderColor: 'divider',
                    }}
                >
                    <Dot tone={c.tone} />
                    <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>{c.label}</Typography>
                    <Box sx={{ minWidth: 0 }}>
                        <Typography
                            sx={{
                                fontSize: 14,
                                color: c.tone === 'bad' ? agentColors.red : 'text.primary',
                                overflowWrap: 'anywhere',
                            }}
                        >
                            {c.text}
                        </Typography>
                        {c.detail && (
                            <Typography sx={{ fontSize: 12.5, color: 'text.secondary', overflowWrap: 'anywhere' }}>
                                {c.detail}
                            </Typography>
                        )}
                    </Box>
                </Box>
            ))}
        </Box>
    );
}

function Count({ value, label, color }: { value: number; label: string; color?: string }) {
    return (
        <Box sx={{ textAlign: 'center' }}>
            <Typography sx={{ fontSize: 20, lineHeight: 1.2, color: color ?? 'text.primary' }}>{value}</Typography>
            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{label}</Typography>
        </Box>
    );
}

function VariantCard({ p, onOpenChat }: { p: VariantPool; onOpenChat: (id: string) => void }) {
    return (
        <Box sx={{ ...blockSx, p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }} data-variant={p.variant}>
            <Box>
                <Typography sx={{ fontSize: 14.5, fontWeight: 500 }}>{p.label}</Typography>
                <Typography sx={{ fontSize: 12, color: 'text.disabled', fontFamily: MONO }}>
                    {p.variant}
                    {p.active ? (
                        <Box component="span" sx={{ fontFamily: 'inherit', color: agentColors.ok, ml: 1 }}>
                            new chats
                        </Box>
                    ) : (
                        <Box component="span" sx={{ fontFamily: 'inherit', ml: 1 }}>
                            older chats only
                        </Box>
                    )}
                </Typography>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1 }}>
                <Count value={p.free} label="free" color={agentColors.ok} />
                <Count value={p.busy} label="busy" color={agentColors.green} />
                <Count value={p.starting} label="starting" color={agentColors.amberText} />
                <Count value={p.target} label="target" />
            </Box>
            {p.images.length > 0 && (
                <Box sx={{ fontSize: 12, color: 'text.secondary' }}>
                    Image{' '}
                    {p.images.map((img) => (
                        <Tooltip key={img} title={img}>
                            <Box component="span" sx={{ fontFamily: MONO, color: 'text.primary', mr: 1 }}>
                                {shortImage(img)}
                            </Box>
                        </Tooltip>
                    ))}
                </Box>
            )}
            <Box sx={{ borderTop: 1, borderColor: 'divider', pt: 1.25, display: 'grid', gap: 0.75 }}>
                {p.mine.length === 0 && (
                    <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>None of your chats here.</Typography>
                )}
                {p.mine.map((m) => (
                    <Box key={m.slotId} sx={{ display: 'flex', alignItems: 'baseline', gap: 1, minWidth: 0 }}>
                        <Link
                            component="button"
                            type="button"
                            onClick={() => onOpenChat(m.chatId)}
                            title={m.title}
                            sx={{
                                fontSize: 13.5,
                                textAlign: 'left',
                                minWidth: 0,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {m.title}
                        </Link>
                        <Typography sx={{ fontSize: 12, color: 'text.secondary', whiteSpace: 'nowrap', ml: 'auto' }}>
                            {activityText(m.activity)}
                        </Typography>
                    </Box>
                ))}
                {p.others > 0 && (
                    <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>
                        {p.others} busy with other users' chats
                    </Typography>
                )}
            </Box>
        </Box>
    );
}

const headSx = { fontWeight: 500, whiteSpace: 'nowrap' } as const;
const numSx = { textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } as const;

/**
 * Status of the agent service: reachability of gateway and platform API, the warm pool per variant with the user's
 * chats, pending approvals, models and variants. Reloads every 15 s and on the page's refresh button.
 */
export default function StatusView({
    refreshKey,
    onOpenChat,
}: {
    refreshKey: number;
    onOpenChat: (id: string) => void;
}) {
    const { chats, models: ctxModels, me: ctxMe } = useAgent();
    const [snap, setSnap] = useState<Snapshot>();
    const [loading, setLoading] = useState(false);
    const alive = useRef(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const s = await loadSnapshot();
            if (alive.current) setSnap(s);
        } finally {
            if (alive.current) setLoading(false);
        }
    }, []);

    useEffect(() => {
        alive.current = true;
        void load();
        const t = setInterval(() => void load(), STATUS_REFRESH_MS);
        return () => {
            alive.current = false;
            clearInterval(t);
        };
    }, [load, refreshKey]);

    const me = snap?.me ?? ctxMe;
    const variants = useMemo(() => snap?.variants ?? [], [snap?.variants]);
    const pools = useMemo(() => poolByVariant(snap?.pool, variants, chats), [snap?.pool, variants, chats]);
    const totals = poolTotals(pools);
    const models = useMemo(() => modelRows(snap?.models ?? ctxModels, chats), [snap?.models, ctxModels, chats]);
    const approvals = sortApprovals(snap?.approvals ?? []);
    const titleOf = (id: string) => chatTitle(chats.find((c) => c.id === id));
    const checks = snap
        ? [gatewayCheck(snap.gateway, me), ...platformChecks(snap.platform, snap.platformError, me, snap.at)]
        : [];
    const cfg = snap?.config;
    const connection = activeConnection(cfg, variants);

    if (!snap) {
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, color: 'text.secondary' }}>
                <CircularProgress size={18} />
                <Typography sx={{ fontSize: 14 }}>Loading status …</Typography>
            </Box>
        );
    }

    return (
        <Box sx={{ display: 'grid', gap: 3.5 }} data-testid="agent-status">
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 2 }}>
                <Kpi value={snap.pool ? totals.free : '–'} label="free sandboxes" />
                <Kpi
                    value={snap.pool ? totals.busy : '–'}
                    label={`busy · ${snap.pool ? totals.mine : '–'} with your chats`}
                />
                <Kpi value={snap.pool ? totals.starting : '–'} label="starting" />
                <Kpi
                    value={snap.approvals ? approvals.length : '–'}
                    label="waiting for your approval"
                    highlight={approvals.length > 0}
                />
            </Box>

            {snap.gateway.error !== undefined && (
                <Alert severity="error" data-testid="agent-status-error">
                    The agent gateway is not reachable: {errText(snap.gateway.error)}. Retrying every{' '}
                    {STATUS_REFRESH_MS / 1000} s.
                </Alert>
            )}

            <section>
                <SectionTitle
                    aside={
                        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                            Updated {formatClock(new Date(snap.at).toISOString(), true)} · every{' '}
                            {STATUS_REFRESH_MS / 1000} s{loading && <CircularProgress size={12} />}
                        </Box>
                    }
                >
                    Reachability
                </SectionTitle>
                <Reachability checks={checks} />
            </section>

            <section data-testid="agent-status-pool">
                <SectionTitle aside="Sandboxes kept ready for the connection of new chats">Warm pool</SectionTitle>
                {snap.poolError !== undefined ? (
                    <Alert severity="warning">Pool status unavailable: {errText(snap.poolError)}</Alert>
                ) : pools.length === 0 ? (
                    <Empty>No sandboxes in the pool.</Empty>
                ) : (
                    <Box
                        sx={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                            gap: 2,
                        }}
                    >
                        {pools.map((p) => (
                            <VariantCard key={p.variant} p={p} onOpenChat={onOpenChat} />
                        ))}
                    </Box>
                )}
            </section>

            <section data-testid="agent-status-approvals">
                <SectionTitle>Pending approvals</SectionTitle>
                {approvals.length === 0 ? (
                    <Empty>No approvals are waiting for you.</Empty>
                ) : (
                    <Table size="small" sx={{ '& td, & th': { fontSize: 14 } }}>
                        <TableHead>
                            <TableRow>
                                <TableCell sx={headSx}>Waiting since</TableCell>
                                <TableCell sx={headSx}>Kind</TableCell>
                                <TableCell sx={headSx}>Subject</TableCell>
                                <TableCell sx={headSx}>Via</TableCell>
                                <TableCell sx={headSx}>Chat</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {approvals.map((a) => (
                                <TableRow key={a.id}>
                                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                                        {formatClock(a.created_at)}
                                        <Box component="span" sx={{ color: 'text.secondary', ml: 1, fontSize: 12.5 }}>
                                            {formatAgo(a.created_at, snap.at)}
                                        </Box>
                                    </TableCell>
                                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                                        {APPROVAL_KIND_LABEL[a.kind] ?? a.kind}
                                    </TableCell>
                                    <TableCell
                                        sx={{
                                            fontFamily: a.kind === 'internet_access' ? undefined : MONO,
                                            fontSize: '13px !important',
                                            overflowWrap: 'anywhere',
                                        }}
                                    >
                                        {approvalSubject(a)}
                                    </TableCell>
                                    <TableCell sx={{ textTransform: 'uppercase', color: 'text.secondary' }}>
                                        {a.via}
                                    </TableCell>
                                    <TableCell sx={{ maxWidth: 240 }}>
                                        <Link
                                            component="button"
                                            type="button"
                                            onClick={() => onOpenChat(a.chat_id)}
                                            // a title word longer than the cell breaks instead of widening the table
                                            sx={{ fontSize: 14, textAlign: 'left', overflowWrap: 'anywhere' }}
                                        >
                                            {titleOf(a.chat_id)}
                                        </Link>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </section>

            <section data-testid="agent-status-models">
                <SectionTitle aside="Prices per 1M tokens in the tariff in effect now">Models</SectionTitle>
                {models.length === 0 ? (
                    <Empty>The gateway offers no models.</Empty>
                ) : (
                    <Table size="small" sx={{ '& td, & th': { fontSize: 14 } }}>
                        <TableHead>
                            <TableRow>
                                <TableCell sx={headSx}>Model</TableCell>
                                <TableCell sx={headSx}>Provider</TableCell>
                                <TableCell sx={{ ...headSx, textAlign: 'right' }}>Context window</TableCell>
                                <TableCell sx={{ ...headSx, textAlign: 'right' }}>Input</TableCell>
                                <TableCell sx={{ ...headSx, textAlign: 'right' }}>Cached input</TableCell>
                                <TableCell sx={{ ...headSx, textAlign: 'right' }}>Output</TableCell>
                                <TableCell sx={headSx}>Tariff now</TableCell>
                                <TableCell sx={headSx}>Thinking levels</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {models.map((m) => (
                                <TableRow key={m.id}>
                                    <TableCell>
                                        {m.name}
                                        {m.isDefault && (
                                            <Box
                                                component="span"
                                                sx={{
                                                    ml: 1,
                                                    fontSize: 11,
                                                    px: 0.75,
                                                    py: '1px',
                                                    borderRadius: '3px',
                                                    color: agentColors.green,
                                                    bgcolor: agentColors.greenTint,
                                                    border: `1px solid ${agentColors.greenLine}`,
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.6px',
                                                }}
                                            >
                                                default
                                            </Box>
                                        )}
                                        <Typography sx={{ fontSize: 12, color: 'text.disabled', fontFamily: MONO }}>
                                            {m.id}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>{m.provider}</TableCell>
                                    <TableCell sx={numSx}>{m.window ? formatTokensShort(m.window) : '–'}</TableCell>
                                    <TableCell sx={numSx}>{formatPrice(m.input)}</TableCell>
                                    <TableCell sx={numSx}>{formatPrice(m.cacheRead)}</TableCell>
                                    <TableCell sx={numSx}>{formatPrice(m.output)}</TableCell>
                                    <TableCell>
                                        {m.tariff ? (
                                            <Tooltip
                                                title={m.peakHours ? `Peak hours (local time): ${m.peakHours}` : ''}
                                            >
                                                <Box
                                                    component="span"
                                                    sx={{
                                                        whiteSpace: 'nowrap',
                                                        color:
                                                            m.tariff === 'peak'
                                                                ? agentColors.amberText
                                                                : agentColors.ok,
                                                    }}
                                                >
                                                    {m.tariff === 'peak'
                                                        ? 'Peak'
                                                        : `Off-peak ×${Math.round((m.offpeakFactor ?? 1) * 100) / 100}`}
                                                </Box>
                                            </Tooltip>
                                        ) : (
                                            <Box component="span" sx={{ color: 'text.secondary' }}>
                                                Flat
                                            </Box>
                                        )}
                                        {m.peakHours && (
                                            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                                                peak {m.peakHours}
                                            </Typography>
                                        )}
                                    </TableCell>
                                    <TableCell sx={{ color: m.levels.length ? 'text.primary' : 'text.secondary' }}>
                                        {m.levels.length ? m.levels.map(effortLabel).join(', ') : 'not known yet'}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
                {models.some((m) => m.levels.length === 0) && (
                    <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 1 }}>
                        Thinking levels are reported per chat once the agent has used a model.
                    </Typography>
                )}
            </section>

            <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 3 }}>
                {connection ? (
                    <section data-testid="agent-status-connection">
                        <SectionTitle aside="Set by the gateway (AGW_TOOLSETS)">Connection of new chats</SectionTitle>
                        <Box sx={{ ...blockSx, p: 2, display: 'grid', gap: 1 }}>
                            <Box>
                                <Typography sx={{ fontSize: 14.5, fontWeight: 500 }}>
                                    {variantLabel(connection)}
                                </Typography>
                                <Typography sx={{ fontSize: 12, color: 'text.disabled', fontFamily: MONO }}>
                                    {connection.id}
                                </Typography>
                            </Box>
                            <Typography sx={{ fontSize: 13.5, color: 'text.secondary' }}>
                                Every new chat talks to the platform through {bindingsText(connection.id)}. Older chats
                                keep the connection they were created with.
                            </Typography>
                            <Typography
                                sx={{ fontSize: 12.5, color: 'text.secondary', overflowWrap: 'anywhere' }}
                                data-testid="agent-status-connection-tools"
                            >
                                {(connection.tools ?? []).length} tools: {(connection.tools ?? []).join(', ')}
                            </Typography>
                        </Box>
                    </section>
                ) : (
                    <section data-testid="agent-status-variants">
                        <SectionTitle>Connection variants</SectionTitle>
                        {variants.length === 0 ? (
                            <Empty>The gateway reports no variants.</Empty>
                        ) : (
                            <Table size="small" sx={{ '& td, & th': { fontSize: 14 } }}>
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={headSx}>Variant</TableCell>
                                        <TableCell sx={headSx}>Tools</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {variants.map((v) => (
                                        <TableRow key={v.id}>
                                            <TableCell>
                                                {variantLabel(v)}
                                                <Typography
                                                    sx={{ fontSize: 12, color: 'text.disabled', fontFamily: MONO }}
                                                >
                                                    {v.id}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Tooltip title={(v.tools ?? []).join(', ')}>
                                                    <Box
                                                        component="span"
                                                        sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}
                                                    >
                                                        {(v.tools ?? []).length} tools
                                                    </Box>
                                                </Tooltip>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </section>
                )}
                <section data-testid="agent-status-defaults">
                    <SectionTitle>Defaults</SectionTitle>
                    {!cfg ? (
                        <Empty>Not available.</Empty>
                    ) : (
                        <Box
                            component="dl"
                            sx={{
                                ...blockSx,
                                p: 2,
                                m: 0,
                                display: 'grid',
                                gridTemplateColumns: 'minmax(0, 1fr) auto',
                                gap: '6px 16px',
                                fontSize: 13.5,
                                '& dt': { color: 'text.secondary' },
                                '& dd': { m: 0, textAlign: 'right' },
                            }}
                        >
                            {connection && (
                                <>
                                    <dt>Connection of new chats</dt>
                                    <dd>{bindingsText(connection.id)}</dd>
                                </>
                            )}
                            <dt>Internet for new chats</dt>
                            <dd>{cfg.internet_default ? 'on' : 'off'}</dd>
                            <dt>Automatic compaction</dt>
                            <dd>{cfg.auto_compact_default === false ? 'off' : 'on'}</dd>
                            <dt>Subagents at the same time</dt>
                            <dd>{subagentsAtOnce(cfg)}</dd>
                            {cfg.approval_timeout_s !== undefined && (
                                <>
                                    <dt>Approval expires after</dt>
                                    <dd>{Math.round(cfg.approval_timeout_s / 60)} min</dd>
                                </>
                            )}
                            {cfg.idle_timeout_s !== undefined && (
                                <>
                                    <dt>Idle chat rests after</dt>
                                    <dd>{Math.round(cfg.idle_timeout_s / 60)} min</dd>
                                </>
                            )}
                            {cfg.artifact_max_mb !== undefined && (
                                <>
                                    <dt>File limit</dt>
                                    <dd>{cfg.artifact_max_mb} MB</dd>
                                </>
                            )}
                        </Box>
                    )}
                </section>
            </Box>
        </Box>
    );
}
