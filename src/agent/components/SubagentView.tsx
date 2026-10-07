// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Looking into a subagent, read-only (issue #48): its sub-entry under the chat, the breadcrumb that replaces the chat's
// title, the transcript in the chat's own components and the slim line that replaces the input.
import { MouseEvent, useCallback, useMemo, useState } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

import { isLiveStatus, runTranscript } from '../subagents';
import type { RunStatus, SubagentNavItem, SubagentRun } from '../subagents';
import { AgentBlock, UserBubble } from './Conversation';
import EllipsisText from './EllipsisText';
import type { Files, Thinking } from './Conversation';
import { SubagentIcon, SubagentState } from './SubagentState';
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

/** Replaces the input while a subagent is open: "Subagent · running · read-only" and "Back to chat", one line. */
export function SubagentReadOnlyBar({ status, onBack }: { status: RunStatus; onBack: () => void }) {
    return (
        <Box
            data-testid="agent-subagent-readonly"
            role="status"
            sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                minWidth: 0,
                px: 1.25,
                py: 0.5,
                borderRadius: 1,
                border: 1,
                borderColor: agentColors.subagent,
                bgcolor: agentColors.subagentTint,
                fontSize: 12.5,
            }}
        >
            <SubagentIcon size={16} />
            <Box
                component="span"
                sx={{
                    flex: 1,
                    minWidth: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.75,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                }}
            >
                <span>Subagent</span>
                <span aria-hidden>·</span>
                <SubagentState status={status} />
                <span aria-hidden>·</span>
                <Box component="span" sx={{ color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    read-only
                </Box>
            </Box>
            <Button
                size="small"
                onClick={onBack}
                startIcon={<ArrowBackIcon sx={{ fontSize: '16px !important' }} />}
                sx={{ flex: 'none', textTransform: 'none', fontSize: 12.5, py: 0.25, color: agentColors.subagent }}
            >
                Back to chat
            </Button>
        </Box>
    );
}

/**
 * A subagent's run with the chat's own components: the task as a user message, answers as text, tool calls as step
 * lists with their result. A narrow coloured border on the left marks that this is not the chat.
 */
export function SubagentTranscript({
    run,
    status,
    dense,
    chatId,
}: {
    run: SubagentRun;
    status: RunStatus;
    dense: boolean;
    chatId: string;
}) {
    const live = isLiveStatus(status);
    const items = useMemo(() => runTranscript(run, live), [run, live]);
    const [open, setOpen] = useState<Record<string, boolean>>({});
    const onOpenChange = useCallback((id: string, o: boolean) => setOpen((c) => ({ ...c, [id]: o })), []);
    const thinking = useMemo<Thinking>(() => ({ open, onOpenChange }), [open, onOpenChange]);
    const files = useMemo<Files>(() => ({ chatId, known: [] }), [chatId]);
    return (
        <Box
            data-testid="agent-subagent-transcript"
            data-run-id={run.runId}
            sx={{
                borderLeft: `3px solid ${agentColors.subagent}`,
                pl: dense ? 1.25 : 1.75,
                display: 'flex',
                flexDirection: 'column',
                gap: dense ? 1.5 : 1.75,
                minWidth: 0,
            }}
        >
            {items.length === 0 && (
                <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
                    {live ? 'The subagent is starting …' : 'This subagent left no entries.'}
                </Typography>
            )}
            {items.map((it) =>
                it.kind === 'user' ? (
                    <UserBubble key={it.key} text={it.text} dense={dense} files={files} />
                ) : it.kind === 'agent' ? (
                    // no chat id: a subagent's display images are not served per subagent
                    <AgentBlock key={it.key} item={it} dense={dense} thinking={thinking} />
                ) : null,
            )}
            {live && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary', fontSize: 12.5 }}>
                    <CircularProgress size={14} sx={{ color: agentColors.subagent }} />
                    {status === 'idle' ? 'The subagent is quiet …' : 'The subagent is working …'}
                </Box>
            )}
        </Box>
    );
}
