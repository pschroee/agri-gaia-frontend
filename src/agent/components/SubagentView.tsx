// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Looking into a subagent, read-only (issue #48): its sub-entry under the chat, the breadcrumb that replaces the chat's
// title, the transcript in the chat's own components and the footer that replaces the input (frame since issue #54).
import { Fragment, MouseEvent, useCallback, useMemo, useState } from 'react';

import Box from '@mui/material/Box';
import { alpha } from '@mui/material/styles';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

import { deliveryText, isLiveStatus, runTranscript, subagentStateText } from '../subagents';
import type { RunStatus, SubagentItem, SubagentNavItem, SubagentRun } from '../subagents';
import { outputsByCall } from '../files';
import { placePlans } from '../plan';
import type { Plan } from '../plan';
import type { TranscriptItem } from '../transcript';
import type { Approval, Artifact, SubagentMessage, SubagentMessageMode, ToolExecution } from '../types';
import { AgentBlock, UserBubble } from './Conversation';
import EllipsisText from './EllipsisText';
import type { Files, Thinking } from './Conversation';
import PlanCard from './PlanCard';
import { STATE_COLOR, SubagentIcon, SubagentState } from './SubagentState';
import WorkingIndicator from './WorkingIndicator';
import { agentColors } from './tokens';

/**
 * Content of a sub-entry: robot, title and state. The title ellipsizes; only then a one-line tooltip shows it in full
 * (issue #52: the task itself is the first message of the subagent's transcript, not a tooltip).
 */
export function SubagentEntryContent({ item }: { item: SubagentNavItem }) {
    return (
        <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0, width: '100%' }}>
            <SubagentIcon size={15} />
            <EllipsisText text={item.title} sx={{ flex: 1 }} />
            <SubagentState status={item.status} compact />
        </Box>
    );
}

/** Arrow on a chat that opens or closes the group of its subagents (with their number). */
export function GroupToggleButton({ open, count, onToggle }: { open: boolean; count: number; onToggle: () => void }) {
    const click = (e: MouseEvent) => {
        // inside a menu item or a history entry: toggling must not select the chat
        e.stopPropagation();
        e.preventDefault();
        onToggle();
    };
    return (
        <ButtonBase
            component="span"
            role="button"
            aria-expanded={open}
            aria-label={`${open ? 'Hide' : 'Show'} ${count} subagent${count === 1 ? '' : 's'}`}
            data-testid="agent-subagent-group-toggle"
            onClick={click}
            onMouseDown={(e: MouseEvent) => e.stopPropagation()}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation();
                    e.preventDefault();
                    onToggle();
                }
            }}
            sx={{
                flex: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.25,
                borderRadius: 1,
                px: 0.5,
                fontSize: 11,
                color: 'text.secondary',
                '&:hover': { bgcolor: 'action.hover' },
            }}
        >
            <SubagentIcon size={13} muted />
            {count}
            <ChevronRightIcon
                sx={{ fontSize: 16, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 150ms' }}
            />
        </ButtonBase>
    );
}

/**
 * "← <chat title> › <subagent title>" in one line. Arrow and chat title lead back; the subagent's title ellipsizes
 * first, the chat title gives way down to a short stub. `onMouseDown` stops the click from opening a surrounding select.
 * Tooltips (issue #52): "Back to chat" on the way back, the subagent's title only when it is cut; hover only, so at
 * most one shows and none stays behind after a click elsewhere.
 */
export function SubagentBreadcrumb({
    chatTitle,
    item,
    onBack,
    fontSize = 13,
}: {
    chatTitle: string;
    item: Pick<SubagentNavItem, 'title'>;
    onBack: () => void;
    fontSize?: number;
}) {
    const back = (e: MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        onBack();
    };
    return (
        <Box
            component="span"
            data-testid="agent-subagent-breadcrumb"
            sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0, fontSize, lineHeight: 'inherit' }}
        >
            <Tooltip title="Back to chat" disableFocusListener disableInteractive enterDelay={400}>
                <ButtonBase
                    component="span"
                    role="button"
                    tabIndex={0}
                    aria-label={`Back to chat ${chatTitle}`}
                    data-testid="agent-subagent-back"
                    onMouseDown={(e: MouseEvent) => e.stopPropagation()}
                    onClick={back}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.stopPropagation();
                            e.preventDefault();
                            onBack();
                        }
                    }}
                    sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 0.5,
                        minWidth: 0,
                        flex: '0 1 auto',
                        maxWidth: '38%',
                        borderRadius: 0.5,
                        color: 'text.secondary',
                        fontSize: 'inherit',
                        '&:hover': { color: 'text.primary', textDecoration: 'underline' },
                    }}
                >
                    <ArrowBackIcon sx={{ fontSize: fontSize + 3, flex: 'none' }} />
                    <Box
                        component="span"
                        sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                        {chatTitle}
                    </Box>
                </ButtonBase>
            </Tooltip>
            <Box component="span" aria-hidden sx={{ color: 'text.disabled', flex: 'none' }}>
                ›
            </Box>
            <SubagentIcon size={fontSize + 2} />
            <EllipsisText
                text={item.title}
                testId="agent-subagent-breadcrumb-title"
                sx={{ flex: '1 1 0', minWidth: 40, color: agentColors.subagent, fontWeight: 500 }}
            />
        </Box>
    );
}

/** Head of a subagent's view: its state as a chip ("done", "running") and "Subagent log". */
function SubagentLogHead({ status }: { status: RunStatus }) {
    const color = STATE_COLOR[status];
    return (
        <Box
            data-testid="agent-subagent-head"
            sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 12, color: 'text.secondary', minWidth: 0 }}
        >
            <Box
                component="span"
                data-testid="agent-subagent-status"
                data-status={status}
                sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    height: 24,
                    px: '10px',
                    borderRadius: '12px',
                    bgcolor: alpha(color, 0.1),
                    color,
                    fontWeight: 500,
                    flex: 'none',
                    whiteSpace: 'nowrap',
                }}
            >
                {isLiveStatus(status) ? (
                    <CircularProgress size={10} thickness={5} sx={{ color }} />
                ) : (
                    <Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color }} />
                )}
                {subagentStateText(status)}
            </Box>
            <span>Subagent log</span>
        </Box>
    );
}

/**
 * The user's message to a subagent (issue #81): the chat's bubble, then its delivery state; a failed one offers "Send
 * again", which fills the field. Only the gateway's record makes such a bubble.
 */
function YouMessage({
    message,
    dense,
    files,
    onResend,
}: {
    message: SubagentMessage;
    dense: boolean;
    files: { chatId?: string; known: Artifact[] };
    onResend?: (text: string) => void;
}) {
    const failed = message.status === 'failed';
    return (
        <Box
            data-testid="agent-subagent-you"
            data-status={message.status}
            sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5, minWidth: 0 }}
        >
            <UserBubble text={message.text} dense={dense} files={files} />
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    fontSize: 12,
                    color: failed ? 'error.main' : 'text.secondary',
                    minWidth: 0,
                    overflowWrap: 'anywhere',
                }}
            >
                <span>{deliveryText(message)}</span>
                {failed && onResend && (
                    <Button
                        size="small"
                        onClick={() => onResend(message.text)}
                        data-testid="agent-subagent-resend"
                        sx={{ minWidth: 0, py: 0, fontSize: 12, textTransform: 'none' }}
                    >
                        Send again
                    </Button>
                )}
            </Box>
        </Box>
    );
}

/** The thread goes on in a new run after the message above (issue #81). */
function ContinuedLine({ mode }: { mode: SubagentMessageMode }) {
    const text =
        mode === 'restart'
            ? 'Continued in a new run – its earlier session was no longer available, the gateway passed on the transcript'
            : 'Continued in a new run';
    return (
        <Divider data-testid="agent-subagent-continued" sx={{ fontSize: 12, color: 'text.secondary' }}>
            {text}
        </Divider>
    );
}

/** A later task of the thread: the main agent's message to the subagent, never shown as the user's (issue #81). */
function NoteLine({ text }: { text: string }) {
    return (
        <Box
            data-testid="agent-subagent-note"
            sx={{
                fontSize: 12.5,
                color: 'text.secondary',
                borderLeft: 2,
                borderColor: 'divider',
                pl: 1.25,
                minWidth: 0,
                overflowWrap: 'anywhere',
                whiteSpace: 'pre-wrap',
            }}
        >
            <Typography component="span" sx={{ display: 'block', fontSize: 11.5, color: 'text.disabled' }}>
                Message from the main agent
            </Typography>
            {text}
        </Box>
    );
}

/**
 * A subagent's run with the chat's own components: the task as a user message, answers with their thinking and tool
 * steps in order (#57), the user's messages from the gateway's record (#81). On top its state and "Subagent log"
 * (issue #54; the violet selector, or the breadcrumb on /ai-agent, marks that this is not the chat).
 */
export function SubagentTranscript({
    run,
    status,
    dense,
    chatId,
    executions,
    artifacts,
    plans,
    approvals,
    onDecide,
    messages = [],
    onResend,
}: {
    run: SubagentRun;
    status: RunStatus;
    dense: boolean;
    chatId: string;
    /** The tool executions of the chat (exit codes, output excerpts of the subagent's calls). */
    executions?: ToolExecution[];
    /** The chat's files: those the subagent sent show as its file messages (issue #62). */
    artifacts?: Artifact[];
    /** The chat's plans (issue #70); those of this subagent's calls show under its answer. */
    plans?: Plan[];
    approvals?: Approval[];
    onDecide?: (approval: Approval, approve: boolean) => Promise<void>;
    /** The chat's messages to subagents; the thread's own are shown in order (issue #81). */
    messages?: SubagentMessage[];
    /** "Send again" of a failed message: puts its text into the field. */
    onResend?: (text: string) => void;
}) {
    const live = isLiveStatus(status);
    const items = useMemo<SubagentItem[]>(
        () => runTranscript(run, live, executions, messages),
        [run, live, executions, messages],
    );
    // the chat's own item kinds (user, agent, notices …) are what files and plans are placed by
    const base = useMemo(
        () => items.filter((it): it is TranscriptItem => it.kind === 'user' || it.kind === 'agent'),
        [items],
    );
    const sent = useMemo(() => outputsByCall(base, artifacts), [base, artifacts]);
    const [open, setOpen] = useState<Record<string, boolean>>({});
    const onOpenChange = useCallback((id: string, o: boolean) => setOpen((c) => ({ ...c, [id]: o })), []);
    const thinking = useMemo<Thinking>(() => ({ open, onOpenChange }), [open, onOpenChange]);
    const files = useMemo<Files>(() => ({ chatId, known: [] }), [chatId]);
    const placed = useMemo(() => placePlans(base, plans ?? [], false), [base, plans]);
    return (
        <Box
            data-testid="agent-subagent-transcript"
            data-run-id={run.runId}
            sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, minWidth: 0 }}
        >
            <SubagentLogHead status={status} />
            {items.length === 0 && (
                <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
                    {live ? 'The subagent is starting …' : 'This subagent left no entries.'}
                </Typography>
            )}
            {items.map((it) =>
                it.kind === 'user' ? (
                    <UserBubble key={it.key} text={it.text} dense={dense} files={files} />
                ) : it.kind === 'you' ? (
                    <YouMessage
                        key={it.key}
                        message={it.message}
                        dense={dense}
                        files={files}
                        onResend={onResend}
                    />
                ) : it.kind === 'continued' ? (
                    <ContinuedLine key={it.key} mode={it.mode} />
                ) : it.kind === 'note' ? (
                    <NoteLine key={it.key} text={it.text} />
                ) : it.kind === 'agent' ? (
                    <Fragment key={it.key}>
                        {/* no chat id: a subagent's display images are not served per subagent */}
                        <AgentBlock
                            item={it}
                            dense={dense}
                            thinking={thinking}
                            active={live && it.key === items[items.length - 1].key}
                            results={sent.get(it.key)}
                            filesChatId={chatId}
                        />
                        {/* plans of this subagent's calls (issue #70); the plans left over are not shown here */}
                        {placed.byItem.get(it.key)?.map((p) => (
                            <PlanCard
                                key={p.id}
                                plan={p}
                                approval={approvals?.find((a) => a.id === p.approval_id)}
                                onDecide={onDecide}
                                dense={dense}
                            />
                        ))}
                    </Fragment>
                ) : null,
            )}
            {/* the working hint only while the run shows nothing of its current answer yet (#57); quiet: always */}
            {live && (status === 'idle' || items[items.length - 1]?.kind !== 'agent') && (
                <WorkingIndicator label={status === 'idle' ? 'The subagent is quiet …' : 'The subagent is working …'} />
            )}
        </Box>
    );
}
