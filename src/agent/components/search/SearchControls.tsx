// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The interventions of a training search (gateway issue #168, design "Training search"): stop the running trial
// (no dialog, "Stopping…" until the stream reports it), stop the search, change the budget, give a hint and adopt
// a finished trial. One component for the card, the panel and the page; in the panel the buttons are icons.

import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import StopCircleOutlinedIcon from '@mui/icons-material/StopCircleOutlined';
import HighlightOffIcon from '@mui/icons-material/HighlightOff';
import StopIcon from '@mui/icons-material/Stop';
import TuneIcon from '@mui/icons-material/Tune';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { controlError, type ExperimentsActions, type Search, type Trial } from '../../experiments';
import {
    budgetBody,
    budgetErrors,
    budgetForm,
    goalSign,
    maxRunsCap,
    minutesText,
    targetFieldLabel,
    type BudgetForm,
} from '../../searchView';
import { agentColors } from '../tokens';
import {
    ADOPT_TEXT,
    BUDGET_DIALOG_TEXT,
    HINT_INTRO,
    HINT_MAX,
    HINT_SENT_AS,
    HINT_SENT_AS_INLINE,
    STOP_SEARCH_TEXT,
    canAdopt,
    budgetUsedText,
    canStopTrial,
    hintCounter,
    hintError,
    hintTrimmed,
    isStopping,
    pruneStopping,
    searchIsOpen,
    stopSearchDetail,
} from './controlRules';

type Props = {
    chatId: string;
    search: Search;
    trial?: Trial;
    variant: 'card' | 'panel' | 'page';
    actions: ExperimentsActions;
    compact?: boolean;
    /** Which buttons: all (default), the stopping ones (card header) or the adjusting ones (card footer). */
    part?: 'all' | 'stop' | 'adjust';
};

type Dlg = 'stop' | 'budget' | 'hint' | 'adopt' | undefined;

function useFullScreen(): boolean {
    return useMediaQuery('(max-width:599.95px)');
}

function Confirm(props: {
    open: boolean;
    title: string;
    body: string;
    detail?: string;
    action: string;
    danger?: boolean;
    busy: boolean;
    error?: string;
    onCancel: () => void;
    onConfirm: () => void;
}) {
    const full = useFullScreen();
    return (
        <Dialog
            open={props.open}
            onClose={props.busy ? undefined : props.onCancel}
            maxWidth="xs"
            fullWidth
            fullScreen={full}
        >
            <DialogTitle sx={{ fontSize: 17 }}>{props.title}</DialogTitle>
            <DialogContent>
                <DialogContentText sx={{ fontSize: 14 }}>{props.body}</DialogContentText>
                {props.detail && (
                    <DialogContentText sx={{ fontSize: 13, color: 'text.secondary', mt: 1 }}>
                        {props.detail}
                    </DialogContentText>
                )}
                {props.error && (
                    <Alert severity="error" sx={{ mt: 1.5, fontSize: 13 }}>
                        {props.error}
                    </Alert>
                )}
            </DialogContent>
            <DialogActions>
                <Button autoFocus onClick={props.onCancel} disabled={props.busy}>
                    Cancel
                </Button>
                <Button
                    variant="contained"
                    color={props.danger ? 'error' : 'primary'}
                    disabled={props.busy}
                    onClick={props.onConfirm}
                >
                    {props.action}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

/** One budget row: a number field and the box "Not set". */
function BudgetRow(props: {
    label: string;
    set: boolean;
    value: string;
    help?: string;
    error?: string;
    onSet: (set: boolean) => void;
    onValue: (v: string) => void;
    adornment?: string;
}) {
    return (
        <Box sx={{ mb: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, flexWrap: 'wrap' }}>
                <TextField
                    size="small"
                    type="number"
                    label={props.label}
                    value={props.set ? props.value : ''}
                    disabled={!props.set}
                    error={!!props.error}
                    onChange={(e) => props.onValue(e.target.value)}
                    inputProps={{ 'aria-label': props.label }}
                    InputProps={props.adornment ? { endAdornment: <span>{props.adornment}</span> } : undefined}
                    sx={{ flex: '1 1 200px' }}
                />
                <FormControlLabel
                    control={
                        <Checkbox size="small" checked={!props.set} onChange={(e) => props.onSet(!e.target.checked)} />
                    }
                    label={<Typography sx={{ fontSize: 13 }}>Not set</Typography>}
                    sx={{ mt: 0.5 }}
                />
            </Box>
            {props.error ? (
                <Typography role="alert" sx={{ fontSize: 12, color: 'error.main', mt: 0.25 }}>
                    {props.error}
                </Typography>
            ) : (
                props.help && (
                    <Typography sx={{ fontSize: 12, color: agentColors.muted, mt: 0.25 }}>{props.help}</Typography>
                )
            )}
        </Box>
    );
}

function BudgetDialog(props: { search: Search; actions: ExperimentsActions; onClose: () => void }) {
    const { search } = props;
    const full = useFullScreen();
    const [form, setForm] = useState<BudgetForm>(() => budgetForm(search));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>();
    const errors = useMemo(() => budgetErrors(form, search), [form, search]);
    const invalid = Object.keys(errors).length > 0;
    const used = search.used;
    const cap = maxRunsCap(search);
    const save = async () => {
        setBusy(true);
        setError(undefined);
        try {
            await props.actions.changeBudget(search.id, budgetBody(form));
            props.onClose();
        } catch (e) {
            setError(controlError(e));
            setBusy(false);
        }
    };
    return (
        <Dialog
            open
            onClose={busy ? undefined : props.onClose}
            maxWidth="sm"
            fullWidth
            fullScreen={full}
            sx={{ '& .MuiDialog-paper': { maxWidth: 600 } }}
        >
            <DialogTitle sx={{ fontSize: 17, pb: 0.5 }}>Change budget</DialogTitle>
            <DialogContent>
                <Typography sx={{ fontSize: 12, color: 'text.secondary', mb: 1.5 }}>{budgetUsedText(search)}</Typography>
                <DialogContentText sx={{ fontSize: 13, mb: 2 }}>{BUDGET_DIALOG_TEXT}</DialogContentText>
                <BudgetRow
                    label="Number of runs"
                    set={form.runs.set}
                    value={form.runs.value}
                    help={`${used?.runs ?? 0} used · at most ${cap}`}
                    error={errors.runs}
                    onSet={(set) => setForm({ ...form, runs: { ...form.runs, set } })}
                    onValue={(value) => setForm({ ...form, runs: { ...form.runs, value } })}
                />
                <Box sx={{ mb: 1.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, flexWrap: 'wrap' }}>
                        <TextField
                            size="small"
                            type="number"
                            label="Hours"
                            value={form.timeSet ? form.hours : ''}
                            disabled={!form.timeSet}
                            error={!!errors.time}
                            onChange={(e) => setForm({ ...form, hours: e.target.value })}
                            sx={{ flex: '1 1 90px' }}
                        />
                        <TextField
                            size="small"
                            type="number"
                            label="Minutes"
                            value={form.timeSet ? form.minutes : ''}
                            disabled={!form.timeSet}
                            error={!!errors.time}
                            onChange={(e) => setForm({ ...form, minutes: e.target.value })}
                            sx={{ flex: '1 1 90px' }}
                        />
                        <FormControlLabel
                            control={
                                <Checkbox
                                    size="small"
                                    checked={!form.timeSet}
                                    onChange={(e) => setForm({ ...form, timeSet: !e.target.checked })}
                                />
                            }
                            label={<Typography sx={{ fontSize: 13 }}>Not set</Typography>}
                            sx={{ mt: 0.5 }}
                        />
                    </Box>
                    {errors.time ? (
                        <Typography role="alert" sx={{ fontSize: 12, color: 'error.main', mt: 0.25 }}>
                            {errors.time}
                        </Typography>
                    ) : (
                        <Typography sx={{ fontSize: 12, color: agentColors.muted, mt: 0.25 }}>
                            Compute time · {minutesText(used?.compute_minutes ?? 0)} used
                        </Typography>
                    )}
                </Box>
                <BudgetRow
                    label={targetFieldLabel(search.objective)}
                    set={form.target.set}
                    value={form.target.value}
                    help={`The search ends when a trial reaches ${goalSign(search.objective)} this value`}
                    error={errors.target}
                    onSet={(set) => setForm({ ...form, target: { ...form.target, set } })}
                    onValue={(value) => setForm({ ...form, target: { ...form.target, value } })}
                />
                <BudgetRow
                    label="Runs without improvement"
                    set={form.patience.set}
                    value={form.patience.value}
                    help={`${used?.since_improvement ?? 0} since the last improvement`}
                    error={errors.patience}
                    onSet={(set) => setForm({ ...form, patience: { ...form.patience, set } })}
                    onValue={(value) => setForm({ ...form, patience: { ...form.patience, value } })}
                />
                {error && (
                    <Alert severity="error" sx={{ fontSize: 13 }}>
                        {error}
                    </Alert>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={props.onClose} disabled={busy}>
                    Cancel
                </Button>
                <Button variant="contained" disabled={busy || invalid} onClick={save}>
                    Save budget
                </Button>
            </DialogActions>
        </Dialog>
    );
}

/** The hint field; in the panel it sits inline under the card, elsewhere in a dialog. */
function HintForm(props: { search: Search; actions: ExperimentsActions; inline: boolean; onClose: () => void }) {
    const full = useFullScreen();
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>();
    const problem = hintError(text);
    const send = async () => {
        if (problem) return;
        setBusy(true);
        setError(undefined);
        try {
            await props.actions.giveHint(props.search.id, hintTrimmed(text));
            props.onClose();
        } catch (e) {
            setError(controlError(e));
            setBusy(false);
        }
    };
    const field = (
        <>
            <TextField
                autoFocus
                multiline
                minRows={props.inline ? 2 : 3}
                fullWidth
                size="small"
                label="Hint for the next trial"
                value={text}
                onChange={(e) => setText(e.target.value)}
                error={text.length > HINT_MAX}
                helperText={
                    <Box component="span" sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                        <span>{props.inline ? HINT_SENT_AS_INLINE : HINT_SENT_AS}</span>
                        <span>{hintCounter(text)}</span>
                    </Box>
                }
            />
            {error && (
                <Alert severity="error" sx={{ mt: 1, fontSize: 13 }}>
                    {error}
                </Alert>
            )}
        </>
    );
    if (props.inline)
        return (
            <Box sx={{ mt: 1 }}>
                {field}
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 1 }}>
                    <Button size="small" onClick={props.onClose} disabled={busy}>
                        Cancel
                    </Button>
                    <Button size="small" variant="contained" disabled={busy || !!problem} onClick={send}>
                        Send hint
                    </Button>
                </Box>
            </Box>
        );
    return (
        <Dialog open onClose={busy ? undefined : props.onClose} maxWidth="sm" fullWidth fullScreen={full}>
            <DialogTitle sx={{ fontSize: 17 }}>Give a hint</DialogTitle>
            <DialogContent sx={{ pt: 1 }}>
                <DialogContentText sx={{ fontSize: 14, mb: 1.5 }}>{HINT_INTRO}</DialogContentText>
                {field}
            </DialogContent>
            <DialogActions>
                <Button onClick={props.onClose} disabled={busy}>
                    Cancel
                </Button>
                <Button variant="contained" disabled={busy || !!problem} onClick={send}>
                    Send hint
                </Button>
            </DialogActions>
        </Dialog>
    );
}

export function SearchControls({ search, trial, variant, actions, compact, part = 'all' }: Props) {
    const icons = part === 'adjust' ? false : (compact ?? variant === 'panel');
    const [dlg, setDlg] = useState<Dlg>();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>();
    const [requested, setRequested] = useState<ReadonlySet<string>>(new Set());

    // Local "Stopping…" until the stream reports the trial as ended (G3).
    useEffect(() => {
        setRequested((r) => (r.size ? pruneStopping(r, trial) : r));
    }, [trial?.id, trial?.state]);

    if (!searchIsOpen(search)) return null;

    const stopping = isStopping(trial, requested);
    const stopTrial = async () => {
        if (!trial || stopping) return;
        setError(undefined);
        setRequested((r) => new Set(r).add(trial.id));
        try {
            await actions.stopTrial(search.id, trial.id);
        } catch (e) {
            setRequested((r) => {
                const n = new Set(r);
                n.delete(trial.id);
                return n;
            });
            setError(controlError(e));
        }
    };
    const run = async (fn: () => Promise<void>) => {
        setBusy(true);
        setError(undefined);
        try {
            await fn();
            setDlg(undefined);
        } catch (e) {
            setError(controlError(e));
        } finally {
            setBusy(false);
        }
    };
    const close = () => {
        setDlg(undefined);
        setError(undefined);
    };

    const button = (
        key: string,
        label: string,
        icon: ReactNode | undefined,
        onClick: () => void,
        opts: { disabled?: boolean; color?: 'error' } = {},
    ): ReactNode =>
        icons ? (
            <Tooltip key={key} title={label}>
                <span>
                    <IconButton
                        size="small"
                        aria-label={label}
                        disabled={opts.disabled}
                        color={opts.color}
                        onClick={onClick}
                    >
                        {icon}
                    </IconButton>
                </span>
            </Tooltip>
        ) : (
            <Button
                key={key}
                size="small"
                startIcon={icon}
                disabled={opts.disabled}
                color={opts.color}
                onClick={onClick}
            >
                {label}
            </Button>
        );

    const adoptIdx = trial?.idx ?? 0;
    const adopt = ADOPT_TEXT(adoptIdx);
    const items: ReactNode[] = [];
    const showStop = part !== 'adjust';
    const showAdjust = part !== 'stop';
    // The button keeps its words while a stop is requested (the trial row says "Stopping…"); between two trials it
    // stays, disabled, as in the design.
    if (showStop && (canStopTrial(search, trial) || (part === 'stop' && !trial && search.state === 'running')))
        items.push(
            button('trial', 'Stop trial', icons ? <StopCircleOutlinedIcon fontSize="small" /> : <StopIcon fontSize="small" />, stopTrial, {
                disabled: stopping || !trial,
            }),
        );
    if (showAdjust && canAdopt(search, trial))
        items.push(button('adopt', adopt.action, <CheckCircleOutlineIcon fontSize="small" />, () => setDlg('adopt')));
    if (showAdjust) {
        items.push(button('budget', 'Change budget', <TuneIcon fontSize="small" />, () => setDlg('budget')));
        items.push(button('hint', 'Give a hint', <LightbulbOutlinedIcon fontSize="small" />, () => setDlg('hint')));
    }
    if (showStop)
        items.push(
            button('stop', 'Stop search', icons ? <HighlightOffIcon fontSize="small" /> : undefined, () => setDlg('stop'), {
                color: icons ? undefined : 'error',
            }),
        );

    return (
        <Box data-variant={variant}>
            <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: icons ? 0 : 0.5 }}>{items}</Box>
            {error && dlg === undefined && (
                <Alert severity="error" sx={{ mt: 1, fontSize: 13 }} onClose={() => setError(undefined)}>
                    {error}
                </Alert>
            )}
            {dlg === 'hint' && (
                <HintForm search={search} actions={actions} inline={variant === 'panel' || !!compact} onClose={close} />
            )}
            {dlg === 'budget' && <BudgetDialog search={search} actions={actions} onClose={close} />}
            <Confirm
                open={dlg === 'stop'}
                {...STOP_SEARCH_TEXT}
                detail={stopSearchDetail(trial)}
                action="Stop search"
                danger
                busy={busy}
                error={dlg === 'stop' ? error : undefined}
                onCancel={close}
                onConfirm={() => run(() => actions.stopSearch(search.id))}
            />
            <Confirm
                open={dlg === 'adopt'}
                title={adopt.title}
                body={adopt.body}
                action={adopt.action}
                busy={busy}
                error={dlg === 'adopt' ? error : undefined}
                onCancel={close}
                onConfirm={() => run(() => actions.adoptTrial(search.id, adoptIdx))}
            />
        </Box>
    );
}

export default SearchControls;
