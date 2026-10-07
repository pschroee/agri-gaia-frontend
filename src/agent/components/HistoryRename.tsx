// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

/** Rename in the history list of /ai-agent (issue #49): the "⋯" menu of an entry and the inline title field. */
import { useRef, useState } from 'react';

import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';

import { MAX_TITLE } from '../rename';

/** Class of the menu button; the entry shows it on hover and focus, the selected entry always. */
export const ENTRY_MENU_CLASS = 'agent-history-menu';

/**
 * "⋯" at the right of a history entry with "Rename". The field opens only after the menu has closed: opened while
 * the menu still traps the focus, it would lose the focus at once, and a blur saves.
 */
export function HistoryEntryMenu({
    title,
    visible,
    onRename,
}: {
    title: string;
    visible: boolean;
    onRename: () => void;
}) {
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const renameAfterClose = useRef(false);
    const open = Boolean(anchor);
    return (
        <>
            <IconButton
                className={ENTRY_MENU_CLASS}
                size="small"
                aria-label={`Options for ${title}`}
                aria-haspopup="menu"
                aria-expanded={open ? 'true' : undefined}
                data-testid="agent-history-menu-button"
                onClick={(e) => {
                    e.stopPropagation();
                    setAnchor(e.currentTarget);
                }}
                onKeyDown={(e) => e.stopPropagation()}
                sx={{
                    flex: 'none',
                    width: 24,
                    height: 24,
                    mt: -0.25,
                    mr: -0.5,
                    color: 'text.secondary',
                    // takes its room always, so a title does not reflow when the button shows on hover
                    opacity: visible || open ? 1 : 0,
                    '&:focus-visible': { opacity: 1 },
                }}
            >
                <MoreHorizIcon sx={{ fontSize: 18 }} />
            </IconButton>
            <Menu
                anchorEl={anchor}
                open={open}
                onClose={() => setAnchor(null)}
                // the menu is portalled, but React events still bubble to the entry, which would select the chat
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                disableRestoreFocus
                TransitionProps={{
                    onExited: () => {
                        if (!renameAfterClose.current) return;
                        renameAfterClose.current = false;
                        onRename();
                    },
                }}
            >
                <MenuItem
                    dense
                    data-testid="agent-history-rename"
                    onClick={() => {
                        renameAfterClose.current = true;
                        setAnchor(null);
                    }}
                >
                    <ListItemIcon>
                        <DriveFileRenameOutlineIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Rename</ListItemText>
                </MenuItem>
            </Menu>
        </>
    );
}

/** The title as a text field, prefilled and selected: Enter or leaving it saves, Escape cancels. */
export function RenameField({
    value,
    onChange,
    onCommit,
    onCancel,
}: {
    value: string;
    onChange: (v: string) => void;
    onCommit: () => void;
    onCancel: () => void;
}) {
    return (
        <InputBase
            autoFocus
            fullWidth
            value={value}
            placeholder="Untitled chat"
            onChange={(e) => onChange(e.target.value)}
            onFocus={(e) => e.target.select()}
            onBlur={onCommit}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
                // the entry around it selects the chat on Enter and Space
                e.stopPropagation();
                if (e.key === 'Enter') {
                    e.preventDefault();
                    onCommit();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    onCancel();
                }
            }}
            inputProps={{
                maxLength: MAX_TITLE,
                'aria-label': 'Chat title',
                'data-testid': 'agent-history-rename-input',
            }}
            sx={{
                fontSize: 13,
                lineHeight: 1.4,
                bgcolor: 'background.paper',
                border: 1,
                borderColor: 'primary.main',
                borderRadius: 0.75,
                px: 0.75,
                '& input': { p: '2px 0' },
            }}
        />
    );
}
