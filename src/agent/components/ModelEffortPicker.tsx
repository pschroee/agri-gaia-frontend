// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { MouseEvent, ReactNode, useEffect, useState } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import CheckIcon from '@mui/icons-material/Check';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import MemoryOutlinedIcon from '@mui/icons-material/MemoryOutlined';
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';

import { effortLabel, modelName, pickerState, switchFailure } from '../modelChoice';
import type { Chat, ContextTooLarge, Model } from '../types';
import ContextTooLargeDialog from './ContextTooLargeDialog';

type Props = {
    chat?: Chat;
    models: Model[];
    /** Narrow layout of the context panel: shorter buttons. */
    dense?: boolean;
    onModel: (model: string, compactFirst?: boolean) => Promise<void>;
    onEffort: (level: string) => Promise<void>;
    /** "/model x" in the input did not fit the context: open the same prompt (a new object per attempt). */
    tooLargeRequest?: { details: ContextTooLarge };
    /** Further chat settings in the same row, after the thinking level (e.g. the subagent limit). */
    extra?: ReactNode;
};

const triggerSx = {
    textTransform: 'none',
    fontSize: 12,
    fontWeight: 400,
    color: 'text.secondary',
    minWidth: 0,
    height: 28,
    pl: 1,
    pr: 0.5,
    py: 0,
    borderRadius: '14px',
    '& .MuiButton-startIcon': { mr: 0.5, ml: 0 },
    '& .MuiButton-endIcon': { ml: 0, mr: 0 },
    '& .MuiButton-startIcon > *:nth-of-type(1)': { fontSize: 16 },
    '& .MuiButton-endIcon > *:nth-of-type(1)': { fontSize: 18 },
} as const;

function Trigger({
    label,
    icon,
    hint,
    title,
    disabled,
    maxWidth,
    onClick,
}: {
    label: string;
    icon: ReactNode;
    hint?: string;
    title: string;
    disabled: boolean;
    maxWidth: number;
    onClick: (e: MouseEvent<HTMLElement>) => void;
}) {
    return (
        <Tooltip title={hint ?? title}>
            {/* span: a disabled button fires no events, the tooltip needs a live wrapper */}
            <Box component="span" sx={{ display: 'inline-flex', minWidth: 0 }}>
                <Button
                    size="small"
                    variant="text"
                    color="inherit"
                    startIcon={icon}
                    endIcon={<ArrowDropDownIcon />}
                    disabled={disabled}
                    onClick={onClick}
                    aria-label={`${title}: ${label}`}
                    aria-haspopup="menu"
                    sx={{ ...triggerSx, maxWidth }}
                >
                    <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {label}
                    </Box>
                </Button>
            </Box>
        </Tooltip>
    );
}

/**
 * Model and thinking level of the open chat, below the input field. Both are locked while the agent works; levels
 * are those pi reports for the model. When the context does not fit the new model, a prompt offers to compact first;
 * the gateway then switches by itself (pending_model, shown next to the pickers until done).
 */
export default function ModelEffortPicker({
    chat,
    models,
    dense = false,
    onModel,
    onEffort,
    tooLargeRequest,
    extra,
}: Props) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>();
    const [tooLarge, setTooLarge] = useState<ContextTooLarge>();
    const [modelAnchor, setModelAnchor] = useState<HTMLElement | null>(null);
    const [effortAnchor, setEffortAnchor] = useState<HTMLElement | null>(null);
    useEffect(() => {
        if (!tooLargeRequest) return;
        setError(undefined);
        setTooLarge(tooLargeRequest.details);
    }, [tooLargeRequest]);
    const state = pickerState(chat, busy);
    const name = (id: string) => modelName(models, id);
    // the chat's own model stays selectable even when the gateway no longer lists it
    const options: Pick<Model, 'id' | 'name' | 'provider'>[] =
        chat && !models.some((m) => m.id === chat.model)
            ? [{ id: chat.model, name: chat.model, provider: chat.model.split('/')[0] }, ...models]
            : models;

    const run = async (action: () => Promise<void>) => {
        setBusy(true);
        setError(undefined);
        try {
            await action();
            return true;
        } catch (e) {
            const f = switchFailure(e);
            if (f.kind === 'too_large') setTooLarge(f.details);
            else setError(f.message);
            return false;
        } finally {
            setBusy(false);
        }
    };

    const pickModel = (id: string) => {
        setModelAnchor(null);
        if (!chat || id === chat.model) return;
        void run(() => onModel(id));
    };

    const pickEffort = (level: string) => {
        setEffortAnchor(null);
        if (!chat || level === chat.thinking_level) return;
        void run(() => onEffort(level));
    };

    const compactAndSwitch = async () => {
        if (!tooLarge) return;
        const model = tooLarge.model;
        if (await run(() => onModel(model, true))) setTooLarge(undefined);
    };

    const effortText = chat?.thinking_level ? effortLabel(chat.thinking_level) : 'Thinking';

    return (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 0.25, minWidth: 0 }}>
            <Trigger
                title="Model"
                label={chat ? name(chat.model) : 'Model'}
                icon={<MemoryOutlinedIcon />}
                hint={state.modelHint}
                disabled={state.modelDisabled}
                maxWidth={dense ? 170 : 240}
                onClick={(e) => setModelAnchor(e.currentTarget)}
            />
            <Trigger
                title="Thinking level"
                label={effortText}
                icon={<PsychologyOutlinedIcon />}
                hint={state.effortHint}
                disabled={state.effortDisabled}
                maxWidth={dense ? 120 : 160}
                onClick={(e) => setEffortAnchor(e.currentTarget)}
            />
            {extra}
            {busy && <CircularProgress size={12} sx={{ ml: 0.5 }} aria-label="Switching" />}
            {state.pending && (
                <Typography
                    data-testid="agent-pending-model"
                    sx={{
                        fontSize: 11.5,
                        color: 'text.secondary',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        ml: 0.5,
                        minWidth: 0,
                    }}
                >
                    <CircularProgress size={10} />
                    <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {`Compacting, then ${name(state.pending)}`}
                    </Box>
                </Typography>
            )}
            {error && (
                <Typography role="alert" sx={{ flexBasis: '100%', fontSize: 11.5, color: 'error.main', px: 0.75 }}>
                    {error}
                </Typography>
            )}
            <Menu
                anchorEl={modelAnchor}
                open={!!modelAnchor}
                onClose={() => setModelAnchor(null)}
                anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
                transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                MenuListProps={{ dense: true, 'aria-label': 'Model' }}
            >
                {options.map((m) => {
                    const current = m.id === chat?.model;
                    return (
                        <MenuItem key={m.id} selected={current} onClick={() => pickModel(m.id)} sx={{ maxWidth: 360 }}>
                            <ListItemIcon sx={{ minWidth: 28 }}>
                                {current && <CheckIcon fontSize="small" />}
                            </ListItemIcon>
                            <ListItemText
                                primary={m.name}
                                secondary={m.provider}
                                primaryTypographyProps={{ fontSize: 13.5 }}
                                secondaryTypographyProps={{ fontSize: 11.5, sx: { whiteSpace: 'normal' } }}
                            />
                        </MenuItem>
                    );
                })}
            </Menu>
            <Menu
                anchorEl={effortAnchor}
                open={!!effortAnchor}
                onClose={() => setEffortAnchor(null)}
                anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
                transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                MenuListProps={{ dense: true, 'aria-label': 'Thinking level' }}
            >
                {state.levels.map((l) => {
                    const current = l === chat?.thinking_level;
                    return (
                        <MenuItem key={l} selected={current} onClick={() => pickEffort(l)}>
                            <ListItemIcon sx={{ minWidth: 28 }}>
                                {current && <CheckIcon fontSize="small" />}
                            </ListItemIcon>
                            <ListItemText primary={effortLabel(l)} primaryTypographyProps={{ fontSize: 13.5 }} />
                        </MenuItem>
                    );
                })}
            </Menu>
            <ContextTooLargeDialog
                details={tooLarge}
                name={tooLarge ? name(tooLarge.model) : ''}
                busy={busy}
                error={tooLarge ? error : undefined}
                onCancel={() => {
                    setTooLarge(undefined);
                    setError(undefined);
                }}
                onConfirm={() => void compactAndSwitch()}
            />
        </Box>
    );
}
