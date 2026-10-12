// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

/**
 * The trash of /ai-agent (issue #76): the entry "Trash (N)" under the history, the trash list that replaces the
 * history, the read-only banner of a chat in the trash, and the questions and notice of the actions.
 */
import { useState } from 'react';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Snackbar from '@mui/material/Snackbar';
import Typography from '@mui/material/Typography';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import RestoreIcon from '@mui/icons-material/Restore';

import { chatTitle, formatRelativeDay } from '../format';
import { purgeLabel, retentionHint } from '../trash';
import type { TrashEntry, TrashList } from '../types';
import type { TrashDialog, TrashNotice } from '../useTrash';
import { agentColors } from './tokens';

const SECTION_LABEL = {
    fontSize: 11.5,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: 'text.disabled',
} as const;

/** The entry under the history: "Trash (N)", always visible, also at 0. */
export function TrashEntryButton({ count, onOpen }: { count?: number; onOpen: () => void }) {
    return (
        <Box
            role="button"
            tabIndex={0}
            data-testid="agent-trash-entry"
            onClick={onOpen}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen()}
            sx={{
                flex: 'none',
                display: 'flex',
                alignItems: 'center',
                columnGap: 1,
                mt: 1,
                px: 1.25,
                py: 1,
                borderTop: 1,
                borderColor: 'divider',
                borderRadius: 1,
                cursor: 'pointer',
                fontSize: 13,
                color: 'text.secondary',
                '&:hover': { bgcolor: 'action.hover' },
            }}
        >
            <DeleteOutlineIcon sx={{ fontSize: 18 }} />
            <span>{count === undefined ? 'Trash' : `Trash (${count})`}</span>
        </Box>
    );
}

function TrashRow({
    chat,
    active,
    retentionDays,
    onOpen,
    onRestore,
    onDelete,
}: {
    chat: TrashEntry;
    active: boolean;
    retentionDays: number;
    onOpen: () => void;
    onRestore: () => void;
    onDelete: () => void;
}) {
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const purge = retentionDays > 0 && chat.purge_at ? purgeLabel(chat.purge_at) : undefined;
    const title = chatTitle(chat);
    return (
        <Box
            role="button"
            tabIndex={0}
            data-testid="agent-trash-chat"
            data-chat-id={chat.id}
            aria-current={active ? 'true' : undefined}
            onClick={onOpen}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen()}
            sx={{
                display: 'flex',
                alignItems: 'flex-start',
                columnGap: 0.5,
                px: 1.25,
                py: 1.1,
                mb: 0.4,
                borderRadius: 1,
                cursor: 'pointer',
                fontSize: 13,
                lineHeight: 1.4,
                color: active ? 'text.primary' : 'text.secondary',
                bgcolor: active ? agentColors.greenTint : undefined,
                '&:hover': { bgcolor: active ? agentColors.greenTint : 'action.hover' },
            }}
        >
            <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box
                    title={title}
                    sx={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        overflowWrap: 'anywhere',
                    }}
                >
                    {title}
                </Box>
                <Box sx={{ fontSize: 11, color: 'text.disabled', mt: 0.25 }}>
                    <Box component="span" sx={{ display: 'block' }}>
                        {`Deleted ${formatRelativeDay(chat.trashed_at)}`}
                    </Box>
                    {purge && (
                        <Box component="span" sx={{ display: 'block', color: agentColors.amberText }}>
                            {purge}
                        </Box>
                    )}
                </Box>
            </Box>
            <IconButton
                size="small"
                aria-label={`Options for ${title}`}
                aria-haspopup="menu"
                data-testid="agent-trash-menu-button"
                onClick={(e) => {
                    e.stopPropagation();
                    setAnchor(e.currentTarget);
                }}
                onKeyDown={(e) => e.stopPropagation()}
                sx={{ flex: 'none', width: 24, height: 24, mt: -0.25, mr: -0.5, color: 'text.secondary' }}
            >
                <MoreHorizIcon sx={{ fontSize: 18 }} />
            </IconButton>
            <Menu
                anchorEl={anchor}
                open={!!anchor}
                onClose={() => setAnchor(null)}
                // portalled, but React events bubble to the row, which would open the chat
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
                <MenuItem
                    dense
                    data-testid="agent-trash-restore"
                    onClick={() => {
                        setAnchor(null);
                        onRestore();
                    }}
                >
                    <ListItemIcon>
                        <RestoreIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Restore</ListItemText>
                </MenuItem>
                <MenuItem
                    dense
                    data-testid="agent-trash-delete"
                    sx={{ color: 'error.main' }}
                    onClick={() => {
                        setAnchor(null);
                        onDelete();
                    }}
                >
                    <ListItemIcon sx={{ color: 'inherit' }}>
                        <DeleteForeverIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Delete permanently</ListItemText>
                </MenuItem>
            </Menu>
        </Box>
    );
}

/** The left column while the trash is shown (instead of the history). */
export function TrashView({
    trash,
    openId,
    onBack,
    onOpen,
    onRestore,
    onDelete,
    onEmpty,
}: {
    trash?: TrashList;
    /** The chat open read-only on the right. */
    openId?: string;
    onBack: () => void;
    onOpen: (id: string) => void;
    onRestore: (id: string) => void;
    onDelete: (chat: TrashEntry) => void;
    onEmpty: () => void;
}) {
    const chats = trash?.chats ?? [];
    const days = trash?.retention_days ?? 0;
    const hint = retentionHint(days);
    return (
        <Box
            data-testid="agent-trash-view"
            sx={{ borderRight: 1, borderColor: 'divider', pr: 2.5, display: 'flex', flexDirection: 'column', minHeight: 0 }}
        >
            <Button
                size="small"
                startIcon={<ArrowBackIcon />}
                onClick={onBack}
                sx={{ alignSelf: 'flex-start', textTransform: 'none', fontSize: 13, px: 0, mb: 1 }}
            >
                History
            </Button>
            <Typography sx={{ ...SECTION_LABEL, mb: 1.25 }}>Trash</Typography>
            <Button
                variant="outlined"
                size="small"
                startIcon={<DeleteForeverIcon />}
                disabled={chats.length === 0}
                onClick={onEmpty}
                sx={{ alignSelf: 'flex-start', textTransform: 'none', mb: 1.5 }}
            >
                Empty trash
            </Button>
            {hint && <Typography sx={{ fontSize: 12, color: 'text.secondary', mb: 1.5 }}>{hint}</Typography>}
            <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                {chats.length === 0 && (
                    <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>The trash is empty.</Typography>
                )}
                {chats.map((c) => (
                    <TrashRow
                        key={c.id}
                        chat={c}
                        active={c.id === openId}
                        retentionDays={days}
                        onOpen={() => onOpen(c.id)}
                        onRestore={() => onRestore(c.id)}
                        onDelete={() => onDelete(c)}
                    />
                ))}
            </Box>
        </Box>
    );
}

/** Above a chat in the trash: it is read only, with restore and permanent deletion. */
export function TrashBanner({ onRestore, onDelete }: { onRestore: () => void; onDelete: () => void }) {
    return (
        <Alert
            severity="info"
            data-testid="agent-trash-banner"
            sx={{ fontSize: 13, alignItems: 'center', '& .MuiAlert-action': { pt: 0, mr: 0 } }}
            action={
                <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 1 }}>
                    <Button size="small" onClick={onRestore} sx={{ textTransform: 'none' }}>
                        Restore
                    </Button>
                    <Button size="small" color="error" onClick={onDelete} sx={{ textTransform: 'none' }}>
                        Delete permanently
                    </Button>
                </Box>
            }
        >
            This chat is in the trash.
        </Alert>
    );
}

/** Texts of the questions in front of the actions. */
function dialogTexts(d: TrashDialog): { title: string; body: string; confirm: string; danger: boolean } {
    if (d.kind === 'move')
        return {
            title: 'Move chat to trash?',
            body: 'The agent is still working in this chat. Moving it to the trash stops the agent, its background tasks and subagents, and rejects open approvals.',
            confirm: 'Move to trash',
            danger: false,
        };
    if (d.kind === 'delete')
        return {
            title: 'Delete chat permanently?',
            body: `“${chatTitle(d.chat)}” and its messages, files and approvals will be deleted. This cannot be undone. Activity keeps an anonymised record of the agent's calls as “Deleted chat”.`,
            confirm: 'Delete permanently',
            danger: true,
        };
    return {
        title: 'Empty trash?',
        body: `${d.count} ${d.count === 1 ? 'chat' : 'chats'} will be deleted permanently. This cannot be undone.`,
        confirm: 'Empty trash',
        danger: true,
    };
}

export function TrashDialogs({
    dialog,
    onCancel,
    onConfirm,
}: {
    dialog?: TrashDialog;
    onCancel: () => void;
    onConfirm: () => void;
}) {
    const t = dialog ? dialogTexts(dialog) : undefined;
    return (
        <Dialog open={!!dialog} onClose={onCancel} aria-labelledby="agent-trash-dialog-title" maxWidth="xs" fullWidth>
            {t && (
                <>
                    <DialogTitle id="agent-trash-dialog-title">{t.title}</DialogTitle>
                    <DialogContent>
                        <DialogContentText>{t.body}</DialogContentText>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={onCancel}>Cancel</Button>
                        <Button
                            variant="contained"
                            color={t.danger ? 'error' : 'primary'}
                            onClick={onConfirm}
                            data-testid="agent-trash-confirm"
                        >
                            {t.confirm}
                        </Button>
                    </DialogActions>
                </>
            )}
        </Dialog>
    );
}

/** The short notice after an action, bottom left; "Undo" for a move to the trash (6 s). */
export function TrashSnackbar({ notice, onClose }: { notice?: TrashNotice; onClose: () => void }) {
    return (
        <Snackbar
            open={!!notice}
            onClose={(_, reason) => {
                if (reason !== 'clickaway') onClose();
            }}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            autoHideDuration={6000}
            message={notice?.text}
            action={
                notice?.undo && (
                    <Button color="inherit" size="small" onClick={notice.undo} data-testid="agent-trash-undo">
                        Undo
                    </Button>
                )
            }
        />
    );
}
