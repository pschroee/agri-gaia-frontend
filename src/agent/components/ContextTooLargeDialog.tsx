// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';

import { tooLargeText } from '../modelChoice';
import type { ContextTooLarge } from '../types';

type Props = {
    details?: ContextTooLarge;
    /** Display name of the requested model. */
    name: string;
    busy: boolean;
    error?: string;
    onCancel: () => void;
    onConfirm: () => void;
};

/** Prompt when the conversation does not fit the requested model: compact first, then switch. */
export default function ContextTooLargeDialog({ details, name, busy, error, onCancel, onConfirm }: Props) {
    return (
        <Dialog open={!!details} onClose={onCancel} maxWidth="xs" fullWidth>
            <DialogTitle sx={{ fontSize: 17 }}>Context does not fit {name}</DialogTitle>
            <DialogContent>
                <DialogContentText sx={{ fontSize: 14 }}>{details && tooLargeText(details, name)}</DialogContentText>
                {error && (
                    <Alert severity="error" sx={{ mt: 1.5, fontSize: 13 }}>
                        {error}
                    </Alert>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onCancel}>Cancel</Button>
                <Button variant="contained" disabled={busy} onClick={onConfirm}>
                    {busy ? 'Starting …' : 'Compact first, then switch'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
