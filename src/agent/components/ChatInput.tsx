// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { KeyboardEvent, ReactNode, useEffect, useId, useReducer, useRef, useState } from 'react';

import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import SendIcon from '@mui/icons-material/Send';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import UploadFileIcon from '@mui/icons-material/UploadFile';

import { isSlashCommand } from '../commands';
import { canSend, checkSizes, emptyStaged, stagedReducer } from '../files';
import type { Artifact, Command } from '../types';
import { useFileDrop } from '../useFileDrop';
import { useSlashCommands } from '../useSlashCommands';
import { useAgentDropTarget } from './AgentDropZone';
import SlashCommandMenu, { optionId } from './SlashCommandMenu';
import { StagedAttachments } from './Attachments';
import { agentColors } from './tokens';

type Props = {
    /** Sends the text with the names of the uploaded attachments. */
    onSend: (text: string, attachments: string[]) => Promise<void>;
    /** Uploads files for the agent (button and drag and drop); without it the field takes no files. */
    onUpload?: (files: File[]) => Promise<Artifact[]>;
    /** Size limit per file in MB (gateway config), checked before uploading. */
    maxFileMb?: number;
    /** Chat of the field, for thumbnails of staged images. */
    chatId?: string;
    /** The agent works: the input stays usable, sending queues the message. */
    running?: boolean;
    disabled?: boolean;
    placeholder?: string;
    hint?: string;
    /** Controls in the row below the field (model and thinking level); the hint then moves to the right. */
    toolbar?: ReactNode;
    /** Narrow layout: with a toolbar, the hint shrinks to its icon with a tooltip. */
    dense?: boolean;
    /** Slash commands offered while the input starts with "/"; without onCommand, "/…" is sent as a message. */
    commands?: Command[];
    /** Runs "/…"; false: it failed and the transcript explains, the text goes back into the field. */
    onCommand?: (text: string) => Promise<boolean>;
    /** The command list just opened (to load it again). */
    onCommandsOpen?: () => void;
};

const NO_COMMANDS: Command[] = [];

/**
 * Message field with send (Enter) and a hint line below. While the agent works, sending is not blocked: the
 * gateway queues the message and the queue above the field shows it. Stopping lives in the run status above.
 */
export default function ChatInput({
    onSend,
    onUpload,
    maxFileMb,
    chatId,
    running,
    disabled,
    placeholder,
    hint,
    toolbar,
    dense,
    commands,
    onCommand,
    onCommandsOpen,
}: Props) {
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>();
    const [anchor, setAnchor] = useState<HTMLDivElement | null>(null);
    const [staged, dispatchStaged] = useReducer(stagedReducer, emptyStaged);
    // The send button's tooltip is controlled: sending disables the button under the pointer or focus. A
    // disabled button fires no blur, and its wrapper gets a fresh mouseover, so an uncontrolled tooltip stayed
    // open after sending. After a send it stays closed until the pointer has left the button.
    const [sendTip, setSendTip] = useState(false);
    const sendTipHeld = useRef(false);
    const sendHovered = useRef(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const listId = `agent-slash-${useId().replace(/:/g, '')}`;
    const slash = useSlashCommands(onCommand ? commands ?? NO_COMMANDS : NO_COMMANDS, text, setText);
    const justSlash = text === '/';
    useEffect(() => {
        if (justSlash && onCommand) onCommandsOpen?.();
    }, [justSlash, onCommand, onCommandsOpen]);

    const upload = async (files: File[]) => {
        if (!onUpload || files.length === 0) return;
        const { ok, error: tooBig } = checkSizes(files, maxFileMb);
        if (tooBig) dispatchStaged({ type: 'refused', error: tooBig });
        if (ok.length === 0) return;
        dispatchStaged({ type: 'upload_start' });
        try {
            dispatchStaged({ type: 'upload_done', files: await onUpload(ok) });
            // the size note stays visible next to the uploaded files
            if (tooBig) dispatchStaged({ type: 'refused', error: tooBig });
        } catch (e) {
            dispatchStaged({ type: 'upload_failed', error: `Upload failed: ${e instanceof Error ? e.message : String(e)}` });
        }
    };

    const send = async () => {
        const t = text.trim();
        const command = !!onCommand && isSlashCommand(t);
        // a command goes without the attachments; they stay for the next message
        if (busy || (command ? !t : !canSend(t, staged))) return;
        const attachments = command ? [] : staged.files;
        sendTipHeld.current = sendHovered.current;
        setSendTip(false);
        setBusy(true);
        setError(undefined);
        // cleared right away (the message shows in the history or the queue); restored when sending fails
        setText('');
        if (attachments.length) dispatchStaged({ type: 'clear' });
        try {
            if (command && onCommand) {
                if (!(await onCommand(t))) setText((cur) => (cur.trim() ? `${t}\n\n${cur}` : t));
            } else await onSend(t, attachments.map((a) => a.name));
        } catch (e) {
            if (t) setText((cur) => (cur.trim() ? `${t}\n\n${cur}` : t));
            if (attachments.length) dispatchStaged({ type: 'restore', files: attachments });
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    // Dropped files: the surrounding AgentDropZone (whole panel or chat area) hands them here; without one the
    // input area itself is the drop target.
    const dropTarget = onUpload && !disabled ? (files: File[]) => void upload(files) : undefined;
    const inZone = useAgentDropTarget(dropTarget);
    const ownDrop = useFileDrop(inZone ? undefined : dropTarget);
    const dragging = ownDrop.active;
    const dropHandlers = inZone ? {} : ownDrop.handlers;
    const uploading = staged.uploading > 0;
    const sendable = onCommand && isSlashCommand(text.trim()) ? true : canSend(text, staged);

    const onKeyDown = (e: KeyboardEvent) => {
        if (slash.onKeyDown(e)) return;
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void send();
        }
    };

    return (
        <Box sx={{ display: 'grid', gap: 0.75, position: 'relative' }} data-testid="agent-chat-input" {...dropHandlers}>
            {dragging && (
                <Box
                    data-testid="agent-drop-zone"
                    sx={{
                        position: 'absolute',
                        inset: -4,
                        zIndex: 2,
                        pointerEvents: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 1,
                        border: `2px dashed ${agentColors.green}`,
                        borderRadius: 1,
                        bgcolor: 'rgba(238, 243, 240, 0.94)',
                        color: agentColors.green,
                        fontSize: 13,
                        fontWeight: 500,
                    }}
                >
                    <UploadFileIcon sx={{ fontSize: 20 }} />
                    Drop files to attach them
                </Box>
            )}
            {onUpload && (
                <input
                    ref={fileRef}
                    type="file"
                    multiple
                    hidden
                    data-testid="agent-file-input"
                    onChange={(e) => {
                        const files = Array.from(e.target.files ?? []);
                        e.target.value = '';
                        void upload(files);
                    }}
                />
            )}
            <StagedAttachments
                chatId={chatId}
                files={staged.files}
                onRemove={(name) => dispatchStaged({ type: 'remove', name })}
            />
            <TextField
                size="small"
                fullWidth
                multiline
                maxRows={6}
                value={text}
                disabled={disabled}
                placeholder={
                    running
                        ? 'Queue another message …'
                        : `${placeholder ?? 'Ask the agent …'}${onCommand ? ' (/ for commands)' : ''}`
                }
                ref={setAnchor}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={onKeyDown}
                sx={{ bgcolor: '#fff', '& .MuiInputBase-input': { fontSize: 14 } }}
                inputProps={{
                    role: onCommand ? 'combobox' : undefined,
                    'aria-autocomplete': onCommand ? 'list' : undefined,
                    'aria-expanded': onCommand ? slash.open : undefined,
                    'aria-controls': slash.open ? listId : undefined,
                    'aria-activedescendant': slash.open ? optionId(listId, slash.active) : undefined,
                }}
                InputProps={{
                    startAdornment: onUpload ? (
                        <InputAdornment position="start" sx={{ alignSelf: 'flex-end', mb: 1.5, mr: 0.25, ml: -0.75 }}>
                            <Tooltip
                                title={
                                    maxFileMb
                                        ? `Attach files (placed under /workspace/inputs/, at most ${maxFileMb} MB each)`
                                        : 'Attach files (placed under /workspace/inputs/)'
                                }
                            >
                                <span>
                                    <IconButton
                                        size="small"
                                        disabled={disabled || uploading}
                                        onClick={() => fileRef.current?.click()}
                                        aria-label="Attach files"
                                    >
                                        {uploading ? (
                                            <CircularProgress size={16} aria-label="Uploading" />
                                        ) : (
                                            <AttachFileIcon fontSize="small" />
                                        )}
                                    </IconButton>
                                </span>
                            </Tooltip>
                        </InputAdornment>
                    ) : undefined,
                    endAdornment: (
                        <InputAdornment position="end" sx={{ alignSelf: 'flex-end', mb: 1.5 }}>
                            <Tooltip
                                title={
                                    running
                                        ? 'Queue message (goes to the agent when the current run ends)'
                                        : 'Send (Enter)'
                                }
                                open={sendTip}
                                onOpen={() => {
                                    if (!sendTipHeld.current) setSendTip(true);
                                }}
                                onClose={() => setSendTip(false)}
                            >
                                <span
                                    onMouseEnter={() => {
                                        sendHovered.current = true;
                                    }}
                                    onMouseLeave={() => {
                                        sendHovered.current = false;
                                        sendTipHeld.current = false;
                                    }}
                                >
                                    <IconButton
                                        size="small"
                                        color="primary"
                                        disabled={disabled || busy || !sendable}
                                        onClick={() => void send()}
                                        aria-label={running ? 'Queue message' : 'Send'}
                                    >
                                        <SendIcon fontSize="small" />
                                    </IconButton>
                                </span>
                            </Tooltip>
                        </InputAdornment>
                    ),
                }}
            />
            {onCommand && <SlashCommandMenu menu={slash} anchor={anchor} id={listId} />}
            {uploading && (
                <Typography sx={{ fontSize: 11.5, color: 'text.secondary' }} role="status">
                    Uploading …
                </Typography>
            )}
            {(error || staged.error) && (
                <Typography role="alert" sx={{ fontSize: 11.5, color: 'error.main' }}>
                    {error ?? staged.error}
                </Typography>
            )}
            {(toolbar || !error) && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, mt: toolbar ? -0.5 : 0 }}>
                    {toolbar && <Box sx={{ flex: '1 1 auto', minWidth: 0, ml: -0.75 }}>{toolbar}</Box>}
                    {toolbar && dense ? (
                        <Tooltip title={hint ?? 'Write actions need your approval.'}>
                            <LockOutlinedIcon
                                aria-label={hint ?? 'Write actions need your approval.'}
                                sx={{ fontSize: 14, color: 'text.secondary', flex: 'none' }}
                            />
                        </Tooltip>
                    ) : (
                        <Typography
                            sx={{
                                fontSize: 11,
                                color: 'text.secondary',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 0.5,
                                flex: toolbar ? 'none' : undefined,
                                whiteSpace: 'nowrap',
                            }}
                        >
                            <LockOutlinedIcon sx={{ fontSize: 12 }} />
                            {hint ?? 'Write actions need your approval.'}
                        </Typography>
                    )}
                </Box>
            )}
        </Box>
    );
}
