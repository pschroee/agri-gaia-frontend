// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { useCallback, useEffect, useMemo, useState } from 'react';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';

import { useAgent } from '../AgentContext';
import { agentApi } from '../api';
import { Effect, isBlocked, isPlatformCall, isToday, outcomeOf } from '../format';
import type { Approval, ChatDetail } from '../types';
import ActivityTable, { ActivityRow } from './ActivityTable';
import EffectChip from './EffectChip';
import { agentColors } from './tokens';

/** How many of the most recent chats the activity view loads. */
const MAX_CHATS = 25;

export function Kpi({ value, label, highlight }: { value: number | string; label: string; highlight?: boolean }) {
    return (
        <Box
            sx={{
                border: 1,
                borderColor: highlight ? agentColors.amberLine : 'divider',
                bgcolor: highlight ? agentColors.amberTint : '#fff',
                borderRadius: 1,
                px: 2,
                py: 1.75,
            }}
        >
            <Typography
                sx={{ fontSize: 26, lineHeight: 1.2, color: highlight ? agentColors.amberText : 'text.primary' }}
            >
                {value}
            </Typography>
            <Typography sx={{ fontSize: 13, color: highlight ? agentColors.amberText : 'text.secondary', mt: 0.5 }}>
                {label}
            </Typography>
        </Box>
    );
}

const LEGEND: { effect: Effect; text: string }[] = [
    { effect: 'read', text: 'GET' },
    { effect: 'write', text: 'POST, PUT, PATCH' },
    { effect: 'compute', text: 'training start' },
    { effect: 'irreversible', text: 'DELETE' },
];

/**
 * Activity of the agent across the user's recent chats: key figures and every platform call with its
 * effect and result. The gateway has no endpoint across chats, so the view loads the chats one by one.
 */
export default function ActivityView({ refreshKey }: { refreshKey: number }) {
    const { chats } = useAgent();
    const [details, setDetails] = useState<ChatDetail[]>([]);
    const [pending, setPending] = useState<Approval[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string>();

    const recent = useMemo(
        () => [...chats].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, MAX_CHATS),
        [chats],
    );
    const recentIds = recent.map((c) => c.id).join(',');

    const load = useCallback(async () => {
        setLoading(true);
        setError(undefined);
        try {
            const ids = recentIds ? recentIds.split(',') : [];
            const [list, approvals] = await Promise.all([
                Promise.all(ids.map((id) => agentApi.chat(id).catch(() => undefined))),
                agentApi.pendingApprovals().catch(() => [] as Approval[]),
            ]);
            setDetails(list.filter((d): d is ChatDetail => !!d));
            setPending(Array.isArray(approvals) ? approvals : []);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }, [recentIds]);

    useEffect(() => {
        void load();
    }, [load, refreshKey]);

    const rows = useMemo<ActivityRow[]>(() => {
        const out: ActivityRow[] = [];
        for (const d of details) {
            const calls = d.socket_calls ?? [];
            for (const call of calls.filter(isPlatformCall)) {
                const log = call.tool_call_id ? calls.filter((c) => c.tool_call_id === call.tool_call_id) : [call];
                out.push({ call, chat: d.chat, log, approvals: d.approvals ?? [] });
            }
        }
        return out.sort((a, b) => b.call.created_at.localeCompare(a.call.created_at));
    }, [details]);

    const today = rows.filter((r) => isToday(r.call.created_at));
    const blockedToday = today.filter((r) => isBlocked(r.call)).length;
    const rejectedToday = today.filter((r) => outcomeOf(r.call.result) === 'rejected').length;

    return (
        <Box sx={{ display: 'grid', gap: 3 }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 2 }}>
                <Kpi value={today.length} label="platform calls today" />
                <Kpi value={pending.length} label="waiting for approval" highlight={pending.length > 0} />
                <Kpi value={blockedToday} label="blocked by the delegation today" />
                <Kpi value={rejectedToday} label="rejected by you today" />
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                <Typography
                    sx={{ fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: 'text.disabled' }}
                >
                    Effect
                </Typography>
                {LEGEND.map((l) => (
                    <Box key={l.effect} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <EffectChip effect={l.effect} />
                        <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>{l.text}</Typography>
                    </Box>
                ))}
                {loading && <CircularProgress size={16} sx={{ ml: 'auto' }} />}
            </Box>
            {error && <Alert severity="warning">{error}</Alert>}
            <ActivityTable rows={rows} />
            {chats.length > MAX_CHATS && (
                <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                    Shows the {MAX_CHATS} most recently used chats.
                </Typography>
            )}
        </Box>
    );
}
