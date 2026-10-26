// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';

import { PERIODS } from '../../activity';
import type { Period } from '../../activity';
import { formatClock } from '../../format';
import { agentColors } from '../tokens';

export type FilterOption = { value: string; label: string; count?: number };
export type FilterSelect = { id: string; label: string; value: string; options: FilterOption[]; minWidth?: number };

export type FilterStatus = { refreshing: boolean; live: boolean; fetchedAt?: number; failed: boolean };

export type OverviewFilterBarProps = {
    period?: Period;
    onPeriod?: (p: Period) => void;
    selects: FilterSelect[];
    onSelect: (id: string, value: string) => void;
    showReset: boolean;
    onReset: () => void;
    status: FilterStatus;
};

/** Text of an option: the label, with the number of matching entries in brackets when known. */
export const optionText = (o: FilterOption): string => (o.count === undefined ? o.label : `${o.label} (${o.count})`);

/** "Live · updated 15:51:20", "Updated 15:51:20", or the failure note; empty before the first answer. */
export function statusText(s: FilterStatus): string {
    if (s.failed) return 'Could not refresh · retrying';
    if (s.fetchedAt === undefined) return '';
    const at = formatClock(new Date(s.fetchedAt).toISOString(), true);
    return s.live ? `Live · updated ${at}` : `Updated ${at}`;
}

/** Period buttons, drop-downs, "Reset" and the live status of an overview. */
export default function OverviewFilterBar(p: OverviewFilterBarProps) {
    const text = statusText(p.status);
    return (
        <Box data-testid="overview-filter-bar" sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            {p.period && p.onPeriod && (
                <ToggleButtonGroup
                    size="small"
                    exclusive
                    value={p.period}
                    onChange={(_, v: Period | null) => v && p.onPeriod?.(v)}
                    aria-label="Period"
                >
                    {PERIODS.map((o) => (
                        <ToggleButton key={o.value} value={o.value} sx={{ px: 1.75, textTransform: 'none' }}>
                            {o.label}
                        </ToggleButton>
                    ))}
                </ToggleButtonGroup>
            )}
            {p.selects.map((s) => (
                <Select
                    key={s.id}
                    size="small"
                    value={s.value}
                    displayEmpty
                    onChange={(e) => p.onSelect(s.id, e.target.value)}
                    inputProps={{ 'aria-label': s.label }}
                    renderValue={(v) => {
                        const o = s.options.find((x) => x.value === v);
                        return o ? optionText(o) : String(v);
                    }}
                    sx={{ minWidth: s.minWidth ?? 190, maxWidth: 360, fontSize: 14 }}
                >
                    {s.options.map((o) => (
                        <MenuItem key={o.value} value={o.value} sx={{ fontSize: 14, maxWidth: 360 }}>
                            <Typography noWrap sx={{ fontSize: 14 }}>
                                {optionText(o)}
                            </Typography>
                        </MenuItem>
                    ))}
                </Select>
            ))}
            {p.showReset && (
                <Button size="small" onClick={p.onReset}>
                    Reset
                </Button>
            )}
            <Box sx={{ ml: 'auto', display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                {p.status.refreshing && <CircularProgress size={14} aria-label="Refreshing" />}
                {text && (
                    <Typography
                        data-testid="overview-status"
                        sx={{ fontSize: 12, color: p.status.failed ? agentColors.amberText : 'text.secondary' }}
                    >
                        {text}
                    </Typography>
                )}
            </Box>
        </Box>
    );
}
