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
import StopCircleOutlinedIcon from '@mui/icons-material/StopCircleOutlined';
import CloseIcon from '@mui/icons-material/Close';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import UploadFileIcon from '@mui/icons-material/UploadFile';

import { AgentApiError } from '../api';
import { isSlashCommand } from '../commands';
import { PageContext, contextKey, hasSelection, inputPlaceholder, visibleContext } from '../pageContext';
import { attachHint, canSend, checkSizes, emptyStaged, stagedReducer, uploadErrorText } from '../files';
import type { FreshChat } from '../newChat';
import type { Artifact, Command } from '../types';
import { RUN_STATE_HINT, abortErrorText, inputControls, inputStatusText, isRunning } from '../runState';
import type { RunState } from '../runState';
import { sendTipIdle, sendTipReducer } from '../sendTooltip';
import { useFileDrop } from '../useFileDrop';
import { useSlashCommands } from '../useSlashCommands';
import { useAgentDropTarget } from './AgentDropZone';
import SlashCommandMenu, { optionId } from './SlashCommandMenu';
import { StagedAttachments } from './Attachments';
import { PageContextChip } from './PageContextChip';
import { Elapsed, RUN_STATE_COLOR, RunStateIcon } from './RunStateChip';
import { agentColors } from './tokens';

type Props = {
    /** Sends the text with the names of the uploaded attachments and the page context (unless the user removed it). */
    onSend: (text: string, attachments: string[], context?: PageContext) => Promise<void>;
    /** Uploads files for the agent (button and drag and drop); without it the field takes no files. */
    onUpload?: (files: File[]) => Promise<Artifact[]>;
    /** Size limit per file in MB (gateway config), checked before uploading. */
    maxFileMb?: number;
    /** Chat of the field, for thumbnails of staged images. */
    chatId?: string;
    /** The agent works: the input stays usable, sending queues the message. */
    running?: boolean;
    /** Run state of the chat: while a turn runs (working or waiting), Stop sits in the field and the state below it. */
    runState?: RunState;
    /** Start of the running turn (ms), for the timer below the field. */
    since?: number;
    /** Stops the running turn (`POST …/abort`). */
    onAbort?: () => Promise<void>;
    disabled?: boolean;
    placeholder?: string;
    /** Controls in the row below the field (model and thinking level). */
    toolbar?: ReactNode;
    /** Slash commands offered while the input starts with "/"; without onCommand, "/…" is sent as a message. */
    commands?: Command[];
    /** Runs "/…"; false: it failed and the transcript explains, the text goes back into the field. */
    onCommand?: (text: string) => Promise<boolean>;
    /** The command list just opened (to load it again). */
    onCommandsOpen?: () => void;
    /**
     * Context of the current platform page, sent with every message; a selection in it shows as a removable chip
     * (the page alone shows none).
     */
    pageContext?: PageContext;
    /** The chat was just created by "New chat": take the focus and upload its files, then call onStartTaken. */
    start?: FreshChat;
    onStartTaken?: () => void;
    /** Text the field starts with (the chat's draft, carried between agent page and panel, issue #50). */
    initialText?: string;
    /** Called with the field's text whenever it changes (to keep the draft). */
    onTextChange?: (text: string) => void;
};

const NO_COMMANDS: Command[] = [];

/**
 * Message field with send (Enter) and a row below (model, thinking level, run state). While a turn runs, the
 * send arrow becomes Stop (issue #39); with text in the field the queue arrow sits next to it and Enter queues: the
 * gateway queues the message and the queue above the field shows it. Escape never stops. The run state ("Working ·
 * 12 s", "Needs approval", "Stopping …") shows small in the row below the field, a failed stop as a short
 * line until the state changes or the user dismisses it.
 */
export default function ChatInput({
    onSend,
    onUpload,
    maxFileMb,
    chatId,
    running,
    runState,
    since,
    onAbort,
    disabled,
    placeholder,
    toolbar,
    commands,
    onCommand,
    onCommandsOpen,
    pageContext,
    start,
    onStartTaken,
    initialText,
    onTextChange,
}: Props) {
    const [text, setText] = useState(initialText ?? '');
    useEffect(() => onTextChange?.(text), [text, onTextChange]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>();
    const [anchor, setAnchor] = useState<HTMLDivElement | null>(null);
    const [staged, dispatchStaged] = useReducer(stagedReducer, emptyStaged);
    // key of the selection the user removed with the chip's cross, for the next message only; a new selection
    // shows the chip again
    const [dismissedContext, setDismissedContext] = useState<string>();
    const context = visibleContext(pageContext, dismissedContext);
    const chip = hasSelection(context) ? context : undefined;
    // controlled tooltip of the send button (sendTooltip.ts: not after a send, not without real pointer movement)
    const [sendTip, sendTipEvent] = useReducer(sendTipReducer, sendTipIdle);
    const fileRef = useRef<HTMLInputElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const listId = `agent-slash-${useId().replace(/:/g, '')}`;
    const slash = useSlashCommands(onCommand ? commands ?? NO_COMMANDS : NO_COMMANDS, text, setText);
    const justSlash = text === '/';
    // stop: "Stopping …" from the click until the turn has ended (the chat event follows the response)
    const [stopBusy, setStopBusy] = useState(false);
    const [stopRequested, setStopRequested] = useState(false);
    const [stopError, setStopError] = useState<string>();
    const turnRuns = isRunning(runState);
    useEffect(() => {
        if (!turnRuns) setStopRequested(false);
    }, [turnRuns]);
    // a new state makes an old stop error obsolete
    useEffect(() => setStopError(undefined), [runState]);
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
            dispatchStaged({ type: 'upload_failed', error: uploadErrorText(e, maxFileMb) });
        }
    };

    // A chat just created by "New chat": the field is ready at once, files dropped without an open chat are attached.
    // Handled once per entry (StrictMode runs effects twice in development).
    const uploadRef = useRef(upload);
    uploadRef.current = upload;
    const handledStart = useRef<FreshChat>();
    useEffect(() => {
        if (!start || handledStart.current === start) return;
        handledStart.current = start;
        inputRef.current?.focus();
        if (start.files.length) void uploadRef.current(start.files);
        onStartTaken?.();
    }, [start, onStartTaken]);

    const send = async () => {
        const t = text.trim();
        const command = !!onCommand && isSlashCommand(t);
        // a command goes without the attachments; they stay for the next message
        if (busy || (command ? !t : !canSend(t, staged))) return;
        const attachments = command ? [] : staged.files;
        sendTipEvent({ type: 'send' });
        setBusy(true);
        setError(undefined);
        // cleared right away (the message shows in the history or the queue); restored when sending fails
        setText('');
        if (attachments.length) dispatchStaged({ type: 'clear' });
        try {
            if (command && onCommand) {
                if (!(await onCommand(t))) setText((cur) => (cur.trim() ? `${t}\n\n${cur}` : t));
            } else {
                await onSend(t, attachments.map((a) => a.name), context);
                setDismissedContext(undefined);
            }
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

    const stop = async () => {
        if (!onAbort || stopBusy) return;
        setStopBusy(true);
        setStopError(undefined);
        try {
            await onAbort();
            setStopRequested(true);
        } catch (e) {
            const status = e instanceof AgentApiError ? e.status : undefined;
            setStopError(abortErrorText(status, e instanceof Error ? e.message : String(e)));
        } finally {
            setStopBusy(false);
        }
    };
    const stopping = stopBusy || (stopRequested && turnRuns);
    const hasContent = text.trim() !== '' || staged.files.length > 0;
    const controls = inputControls(onAbort ? runState : undefined, hasContent, running);
    const queueing = controls.enter === 'queue';
    const statusText = inputStatusText(runState, stopping);
    const showStatus = !!runState && !!statusText;

    // Enter sends or queues; Escape is left alone (the slash menu closes with it), it never stops the agent
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
            {chip && <PageContextChip context={chip} onRemove={() => setDismissedContext(contextKey(chip))} />}
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
                    queueing
                        ? 'Queue another message …'
                        : `${inputPlaceholder(chip, placeholder)}${onCommand ? ' (/ for commands)' : ''}`
                }
                ref={setAnchor}
                inputRef={inputRef}
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
                            <Tooltip title={attachHint(maxFileMb)}>
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
                        <InputAdornment position="end" sx={{ alignSelf: 'flex-end', mb: 1.5, gap: 0.25 }}>
                            {controls.buttons.includes('stop') && (
                                <Tooltip title="Stop">
                                    <span>
                                        <IconButton
                                            size="small"
                                            color="error"
                                            disabled={stopping}
                                            onClick={() => void stop()}
                                            aria-label="Stop"
                                            data-testid="agent-stop"
                                        >
                                            {stopping ? (
                                                <CircularProgress size={16} color="inherit" aria-label="Stopping" />
                                            ) : (
                                                <StopCircleOutlinedIcon fontSize="small" />
                                            )}
                                        </IconButton>
                                    </span>
                                </Tooltip>
                            )}
                            {controls.buttons.some((b) => b !== 'stop') && (
                                <Tooltip
                                    title={
                                        queueing
                                            ? 'Queue message (goes to the agent when the current run ends)'
                                            : 'Send (Enter)'
                                    }
                                    open={sendTip.open}
                                    onOpen={(e) =>
                                        sendTipEvent({
                                            type: 'open',
                                            by: e.type.startsWith('mouse') ? 'hover' : 'focus',
                                        })
                                    }
                                    onClose={() => sendTipEvent({ type: 'close' })}
                                >
                                    <span
                                        onMouseMove={() => sendTipEvent({ type: 'move' })}
                                        onMouseLeave={() => sendTipEvent({ type: 'leave' })}
                                    >
                                        <IconButton
                                            size="small"
                                            color="primary"
                                            disabled={disabled || busy || !sendable}
                                            onClick={() => void send()}
                                            aria-label={queueing ? 'Queue message' : 'Send'}
                                        >
                                            <SendIcon fontSize="small" />
                                        </IconButton>
                                    </span>
                                </Tooltip>
                            )}
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
            {stopError && (
                <Box role="alert" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
                    <Typography sx={{ fontSize: 11.5, color: agentColors.amberText, flex: 1, minWidth: 0 }}>
                        {stopError}
                    </Typography>
                    <IconButton
                        size="small"
                        aria-label="Dismiss"
                        onClick={() => setStopError(undefined)}
                        sx={{ p: 0.25, my: -0.5 }}
                    >
                        <CloseIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                </Box>
            )}
            {(toolbar || showStatus) && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, mt: toolbar ? -0.5 : 0 }}>
                    {toolbar && (
                        // next to the run state the picker keeps its width (a fraction of a pixel less wraps it);
                        // the state's label gives way instead
                        <Box sx={{ flex: showStatus ? '1 0 auto' : '1 1 auto', minWidth: 0, ml: -0.75 }}>{toolbar}</Box>
                    )}
                    {showStatus && (
                        <Box
                            component="span"
                            role="status"
                            aria-live="polite"
                            data-testid="agent-run-status"
                            title={RUN_STATE_HINT[runState]}
                            sx={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 0.6,
                                // gives way before model and thinking level wrap: the label shrinks, dot and timer stay
                                flex: '0 1000 auto',
                                minWidth: 0,
                                overflow: 'hidden',
                                fontSize: 11,
                                whiteSpace: 'nowrap',
                                color: RUN_STATE_COLOR[runState],
                            }}
                        >
                            <RunStateIcon state={runState} size={7} />
                            <Box component="span" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {statusText}
                            </Box>
                            {turnRuns && since !== undefined && (
                                <Box component="span" sx={{ flex: 'none', display: 'inline-flex', gap: 0.6 }}>
                                    <span>·</span>
                                    <Elapsed since={since} />
                                </Box>
                            )}
                        </Box>
                    )}
                </Box>
            )}
        </Box>
    );
}
