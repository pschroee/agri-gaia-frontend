// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The panel's chat row (issue #54, design "Agent Chat Panel v2"; before: issue #38): an outlined field with the
// floating label "Chat" and the open chat's title, then "New chat" and the internet switch as square outlined buttons
// of the same height. With a subagent open the field turns violet ("Subagent", 2 px border), a back arrow sits in it
// and the title reads "Chat › 🤖 Subagent". The list opens with "Search chats" on top, which filters chats and the
// open chat's subagents; the open chat's subagents sit indented under it (#48: open while one runs). The "🤖 n" badge of
// every other chat opens its group too (issue #60): the first time it loads the chat's short list of runs, without
// opening or waking the chat, and a click on a sub-entry opens that chat with the subagent's view.

import { KeyboardEvent, MouseEvent, ReactNode, useMemo, useRef, useState } from 'react';

import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import Popover from '@mui/material/Popover';
import Tooltip from '@mui/material/Tooltip';
import { alpha } from '@mui/material/styles';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SearchIcon from '@mui/icons-material/Search';

import { useAgent } from '../AgentContext';
import { searchChats } from '../chatSearch';
import { chatTitle } from '../format';
import { runStateOf, runStateText } from '../runState';
import type { SubagentNavItem } from '../subagents';
import type { Chat } from '../types';
import { useChatSubagentGroups } from '../useChatSubagentGroups';
import { useSubagentNav } from '../useSubagentNav';
import { isHovered, isTruncated } from './EllipsisText';
import EllipsisText from './EllipsisText';
import InternetToggle from './InternetToggle';
import NewChatButton, { NewChatError } from './NewChatButton';
import RunStateChip from './RunStateChip';
import { SubagentIcon, SubagentState } from './SubagentState';
import { CHAT_ROW_HEIGHT, agentColors } from './tokens';

const VIOLET = agentColors.subagent;
/** Room kept free below the list: the platform footer (30 px) and the popover's margin. */
const FOOTER_SPACE = 30 + 16;

/** Badge on a chat with subagents: "🤖 3 ⌄"; on the open chat it opens or closes the group under it. */
function SubagentBadge({ count, open, onToggle }: { count: number; open?: boolean; onToggle?: () => void }) {
    const toggle = (e: MouseEvent | KeyboardEvent) => {
        // inside a list row: toggling must not select the chat
        e.stopPropagation();
        e.preventDefault();
        onToggle?.();
    };
    const label = `${count} subagent${count === 1 ? '' : 's'}`;
    return (
        <ButtonBase
            component="span"
            role={onToggle ? 'button' : undefined}
            tabIndex={onToggle ? 0 : -1}
            aria-expanded={onToggle ? !!open : undefined}
            aria-label={onToggle ? `${open ? 'Hide' : 'Show'} ${label}` : label}
            data-testid={onToggle ? 'agent-subagent-group-toggle' : 'agent-subagent-count'}
            onClick={onToggle ? toggle : undefined}
            onMouseDown={(e: MouseEvent) => onToggle && e.stopPropagation()}
            onKeyDown={(e: KeyboardEvent) => {
                if (onToggle && (e.key === 'Enter' || e.key === ' ')) toggle(e);
            }}
            disabled={!onToggle}
            sx={{
                flex: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '2px',
                height: 28,
                pl: 1,
                pr: onToggle ? 0.5 : 1,
                mr: 1,
                borderRadius: '14px',
                bgcolor: alpha(VIOLET, 0.08),
                color: VIOLET,
                fontSize: 12,
                '&.Mui-disabled': { color: VIOLET },
            }}
        >
            <SubagentIcon size={16} />
            {count}
            {onToggle && (open ? <ExpandLessIcon sx={{ fontSize: 18 }} /> : <ExpandMoreIcon sx={{ fontSize: 18 }} />)}
        </ButtonBase>
    );
}

/** A chat in the list: title (bold and tinted when open), its state while something happens, open approvals. */
function ChatRow({
    chat,
    selected,
    badge,
    onSelect,
}: {
    chat: Chat;
    selected: boolean;
    badge?: ReactNode;
    onSelect: () => void;
}) {
    const state = runStateOf(chat);
    return (
        <Box
            data-testid="agent-chat-option"
            data-chat-id={chat.id}
            sx={{
                display: 'flex',
                alignItems: 'center',
                bgcolor: selected ? alpha(agentColors.green, 0.08) : 'transparent',
                '&:hover': { bgcolor: selected ? alpha(agentColors.green, 0.12) : 'rgba(0, 0, 0, 0.04)' },
            }}
        >
            <ButtonBase
                role="option"
                aria-selected={selected}
                onClick={onSelect}
                sx={{
                    flex: 1,
                    minWidth: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    minHeight: 44,
                    py: 1,
                    pl: 2,
                    pr: 1,
                    justifyContent: 'flex-start',
                    textAlign: 'left',
                    fontSize: 14,
                    lineHeight: 1.4,
                    color: 'text.primary',
                }}
            >
                {/* long titles wrap in full (issue #38) */}
                <Box component="span" sx={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere', fontWeight: selected ? 500 : 400 }}>
                    {chatTitle(chat)}
                </Box>
                {runStateText(state, 'list') && (
                    <Box component="span" sx={{ flex: 'none', display: 'inline-flex' }}>
                        <RunStateChip state={state} />
                    </Box>
                )}
                {chat.pending_approvals > 0 && state !== 'waiting' && (
                    <Box
                        component="span"
                        sx={{ color: agentColors.amberText, fontSize: 12, flex: 'none', whiteSpace: 'nowrap' }}
                    >
                        {chat.pending_approvals} waiting
                    </Box>
                )}
            </ButtonBase>
            {badge}
        </Box>
    );
}

/** A subagent under its chat: robot, title, state; tinted violet when open. */
function SubagentRow({ item, selected, onSelect }: { item: SubagentNavItem; selected: boolean; onSelect: () => void }) {
    return (
        <ButtonBase
            role="option"
            aria-selected={selected}
            data-testid="agent-subagent-entry"
            data-run-id={item.runId}
            onClick={onSelect}
            sx={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                minHeight: 40,
                pl: 4,
                pr: 2,
                justifyContent: 'flex-start',
                textAlign: 'left',
                fontSize: 14,
                bgcolor: selected ? alpha(VIOLET, 0.08) : 'transparent',
                '&:hover': { bgcolor: alpha(VIOLET, 0.06) },
            }}
        >
            <SubagentIcon size={18} />
            <EllipsisText text={item.title} sx={{ flex: 1 }} />
            <SubagentState status={item.status} />
        </ButtonBase>
    );
}

/** A line in place of a group's sub-entries: its short list is loading, failed or empty (issue #60). */
export function GroupNote({ loading, error, indent = 4 }: { loading?: boolean; error?: string; indent?: number }) {
    return (
        <Box
            role={error ? 'alert' : 'status'}
            data-testid="agent-subagent-group-note"
            sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                minHeight: 32,
                pl: indent,
                pr: 2,
                fontSize: 12.5,
                color: error ? 'error.main' : 'text.secondary',
            }}
        >
            {loading && <CircularProgress size={12} thickness={5} sx={{ color: VIOLET }} />}
            {loading ? 'Loading subagents …' : error ? `Could not load the subagents: ${error}` : 'No subagents found.'}
        </Box>
    );
}

/** The panel's chat row: selector field, "New chat" and the internet switch (issue #54). */
export default function ChatSelector() {
    const { chats, selectedChatId, selectChat } = useAgent();
    const selected = chats.find((c) => c.id === selectedChatId);
    const sub = useSubagentNav();
    const groups = useChatSubagentGroups(chats);
    const [menuOpen, setMenuOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [tipOpen, setTipOpen] = useState(false);
    const rowRef = useRef<HTMLDivElement>(null);
    const fieldRef = useRef<HTMLButtonElement>(null);
    const titleRef = useRef<HTMLSpanElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const isSub = !!(selected && sub.selected);
    const result = useMemo(
        () =>
            searchChats(
                chats.map((c) => ({ ...c, title: chatTitle(c) })),
                query,
                { chatId: sub.chatId, selectedChatId, subagents: sub.items, others: groups.known },
            ),
        [chats, query, sub.chatId, selectedChatId, sub.items, groups.known],
    );
    const close = () => {
        setMenuOpen(false);
        setQuery('');
    };
    const pickChat = (id: string) => {
        close();
        selectChat(id);
    };
    const pickSubagent = (runId: string) => {
        close();
        sub.select(runId);
    };
    // a subagent of another chat: that chat opens with the subagent's view (issue #60)
    const pickOtherSubagent = (chatId: string, runId: string) => {
        close();
        selectChat(chatId, runId);
    };
    // the list ends above the platform footer, so MUI never moves it up over the field
    const [menuMaxHeight, setMenuMaxHeight] = useState<number>();
    const open = () => {
        setTipOpen(false);
        const bottom = rowRef.current?.getBoundingClientRect().bottom ?? 0;
        setMenuMaxHeight(Math.max(200, window.innerHeight - bottom - 4 - FOOTER_SPACE));
        setMenuOpen(true);
    };
    // Enter in the search field opens the first match (a chat, else a subagent of the open chat)
    const onSearchKey = (e: KeyboardEvent) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const first = result.chats[0];
        if (first) pickChat(first.id);
        else if (result.subagents?.[0]) pickSubagent(result.subagents[0].runId);
    };
    const label = isSub ? 'Subagent' : 'Chat';
    const title = selected ? chatTitle(selected) : chats.length ? 'Select a chat' : 'No chats yet';

    const rows: ReactNode[] = [];
    if (result.chats.length === 0)
        rows.push(
            <Box key="none" sx={{ px: 2, py: 1.25, fontSize: 14, color: 'text.secondary' }}>
                {query.trim() ? 'No chat matches.' : 'No chats yet'}
            </Box>,
        );
    for (const c of result.chats) {
        const isOpenChat = c.id === sub.chatId && sub.items.length > 0;
        if (!isOpenChat && (c.subagents ?? 0) > 0) {
            // another chat: its group loads on the first expand (issue #60); a search shows only matching subagents
            const g = groups.group(c);
            const matches = result.others?.[c.id];
            const groupOpen = !!matches || g.open;
            rows.push(
                <ChatRow
                    key={c.id}
                    chat={c}
                    selected={c.id === selectedChatId && !isSub}
                    onSelect={() => pickChat(c.id)}
                    badge={
                        <SubagentBadge
                            count={c.subagents ?? 0}
                            open={groupOpen}
                            onToggle={matches ? undefined : () => groups.toggle(c)}
                        />
                    }
                />,
            );
            if (!groupOpen) continue;
            const items = matches ?? g.items;
            if (!items || items.length === 0)
                rows.push(<GroupNote key={`note:${c.id}`} loading={g.loading} error={g.error} />);
            else
                for (const it of items)
                    rows.push(
                        <SubagentRow
                            key={`sub:${c.id}:${it.runId}`}
                            item={it}
                            selected={false}
                            onSelect={() => pickOtherSubagent(c.id, it.runId)}
                        />,
                    );
            continue;
        }
        const subsShown = isOpenChat ? (result.subagents ?? (sub.open ? sub.items : [])) : [];
        const count = isOpenChat ? sub.items.length : 0;
        const groupOpen = isOpenChat && (result.subagents ? result.subagents.length > 0 : sub.open);
        rows.push(
            <ChatRow
                key={c.id}
                chat={c}
                selected={c.id === selectedChatId && !isSub}
                onSelect={() => pickChat(c.id)}
                badge={
                    count > 0 ? (
                        <SubagentBadge
                            count={count}
                            open={groupOpen}
                            onToggle={!result.subagents ? sub.toggle : undefined}
                        />
                    ) : undefined
                }
            />,
        );
        for (const it of subsShown)
            rows.push(
                <SubagentRow
                    key={`sub:${it.runId}`}
                    item={it}
                    selected={sub.selected?.runId === it.runId}
                    onSelect={() => pickSubagent(it.runId)}
                />,
            );
    }

    return (
        // minmax(0, 1fr): an auto column would grow to the title's full width and push the buttons out of the panel
        <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1 }}>
            <Box
                ref={rowRef}
                data-testid="agent-chat-picker-row"
                sx={{ display: 'flex', gap: 1, alignItems: 'center', minWidth: 0 }}
            >
                <Box sx={{ position: 'relative', flex: 1, minWidth: 0 }}>
                    {/* floating label of an outlined field */}
                    <Box
                        component="span"
                        aria-hidden
                        sx={{
                            position: 'absolute',
                            top: -8,
                            left: 10,
                            px: 0.5,
                            bgcolor: '#fff',
                            fontSize: 12,
                            lineHeight: '16px',
                            color: isSub ? VIOLET : menuOpen ? agentColors.green : 'text.secondary',
                            zIndex: 1,
                            pointerEvents: 'none',
                        }}
                    >
                        {label}
                    </Box>
                    <Box
                        data-testid="agent-chat-field"
                        data-subagent={isSub ? 'true' : undefined}
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            height: CHAT_ROW_HEIGHT,
                            boxSizing: 'border-box',
                            borderRadius: 1,
                            overflow: 'hidden',
                            border: isSub
                                ? `2px solid ${VIOLET}`
                                : menuOpen
                                  ? `2px solid ${agentColors.green}`
                                  : `1px solid ${agentColors.outline}`,
                            '&:hover': !isSub && !menuOpen ? { borderColor: 'rgba(0, 0, 0, 0.87)' } : undefined,
                        }}
                    >
                        {isSub && (
                            <Tooltip title="Back to chat" disableFocusListener disableInteractive enterDelay={400}>
                                <IconButton
                                    aria-label={`Back to chat ${title}`}
                                    data-testid="agent-subagent-back"
                                    onClick={() => sub.select(undefined)}
                                    sx={{ width: 40, height: '100%', borderRadius: 0, flex: 'none', color: 'rgba(0, 0, 0, 0.54)' }}
                                >
                                    <ArrowBackIcon sx={{ fontSize: 20 }} />
                                </IconButton>
                            </Tooltip>
                        )}
                        <Tooltip
                            // the chat title in full, only when it is cut; a subagent's title has its own (issue #52).
                            // Hover only: the field keeps focus after its list closes, and a tooltip must not stay.
                            title={selected && !isSub ? chatTitle(selected) : ''}
                            open={tipOpen && !menuOpen && !isSub}
                            onOpen={() => {
                                if (!menuOpen && isHovered(fieldRef.current) && isTruncated(titleRef.current))
                                    setTipOpen(true);
                            }}
                            onClose={() => setTipOpen(false)}
                            disableFocusListener
                            disableInteractive
                            enterDelay={400}
                            enterNextDelay={400}
                        >
                            <ButtonBase
                                ref={fieldRef}
                                role="combobox"
                                aria-label={label}
                                aria-haspopup="listbox"
                                aria-expanded={menuOpen}
                                data-testid="agent-chat-select"
                                onClick={open}
                                onKeyDown={(e) => {
                                    if (e.key === 'ArrowDown') {
                                        e.preventDefault();
                                        open();
                                    }
                                }}
                                sx={{
                                    flex: 1,
                                    minWidth: 0,
                                    height: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 0.5,
                                    pl: isSub ? 0 : 1.75,
                                    pr: 0.75,
                                    justifyContent: 'flex-start',
                                    textAlign: 'left',
                                    '&:hover': { bgcolor: 'rgba(0, 0, 0, 0.02)' },
                                }}
                            >
                                {isSub && selected && sub.selected ? (
                                    <Box
                                        component="span"
                                        data-testid="agent-subagent-breadcrumb"
                                        sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0, flex: '0 1 auto' }}
                                    >
                                        <Box
                                            component="span"
                                            sx={{
                                                flex: '0 1 auto',
                                                minWidth: 24,
                                                fontSize: 14,
                                                color: 'text.secondary',
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                            }}
                                        >
                                            {chatTitle(selected)}
                                        </Box>
                                        <ChevronRightIcon sx={{ fontSize: 18, color: 'rgba(0, 0, 0, 0.38)', flex: 'none' }} />
                                        <SubagentIcon size={20} />
                                        <EllipsisText
                                            text={sub.selected.title}
                                            testId="agent-subagent-breadcrumb-title"
                                            sx={{ flex: '0 1 auto', minWidth: 40, fontSize: 16, fontWeight: 500, color: VIOLET }}
                                        />
                                    </Box>
                                ) : (
                                    <Box
                                        component="span"
                                        ref={titleRef}
                                        data-testid="agent-chat-select-title"
                                        sx={{
                                            flex: '0 1 auto',
                                            minWidth: 0,
                                            fontSize: 16,
                                            color: selected ? 'text.primary' : 'text.secondary',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                        }}
                                    >
                                        {title}
                                    </Box>
                                )}
                                <Box component="span" sx={{ flex: 1 }} />
                                <ArrowDropDownIcon sx={{ fontSize: 24, color: 'rgba(0, 0, 0, 0.54)', flex: 'none' }} />
                            </ButtonBase>
                        </Tooltip>
                    </Box>
                </Box>
                <NewChatButton compact />
                {selected && <InternetToggle chat={selected} compact />}
            </Box>
            <NewChatError />
            <Popover
                open={menuOpen}
                anchorEl={rowRef.current}
                onClose={close}
                // the search field takes the focus, not the list's paper
                disableAutoFocus
                TransitionProps={{ onEntered: () => searchRef.current?.focus() }}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                slotProps={{
                    paper: {
                        sx: {
                            mt: 0.5,
                            width: rowRef.current?.offsetWidth,
                            maxWidth: 'calc(100vw - 32px)',
                            maxHeight: menuMaxHeight,
                            display: 'flex',
                            flexDirection: 'column',
                        },
                    },
                }}
            >
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        px: 1.5,
                        height: 48,
                        flex: 'none',
                        borderBottom: 1,
                        borderColor: 'divider',
                    }}
                >
                    <SearchIcon sx={{ fontSize: 20, color: 'rgba(0, 0, 0, 0.54)' }} />
                    <InputBase
                        inputRef={searchRef}
                        fullWidth
                        placeholder="Search chats"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={onSearchKey}
                        inputProps={{ 'aria-label': 'Search chats', 'data-testid': 'agent-chat-search' }}
                        sx={{ fontSize: 14 }}
                    />
                </Box>
                <Box role="listbox" aria-label="Chats" data-testid="agent-chat-list" sx={{ overflowY: 'auto', py: 1 }}>
                    {rows}
                </Box>
            </Popover>
        </Box>
    );
}
