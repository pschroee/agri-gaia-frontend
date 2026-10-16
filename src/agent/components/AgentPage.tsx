// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import ClearIcon from '@mui/icons-material/Clear';
import SearchIcon from '@mui/icons-material/Search';
import SyncIcon from '@mui/icons-material/Sync';

import { useAgent } from '../AgentContext';
import { historyGroups, searchChats } from '../chatSearch';
import { chatTitle, formatRelativeDay } from '../format';
import { AgentTab, agentTabOf } from '../panelCarry';
import { runSince, runStateOf } from '../runState';
import type { SubagentNavItem } from '../subagents';
import type { Chat } from '../types';
import { useChatSubagentGroups } from '../useChatSubagentGroups';
import { useSubagentNav } from '../useSubagentNav';
import { useRenameChat } from '../useRenameChat';
import { useTrashActions } from '../useTrash';
import ActivityView from './ActivityView';
import StatusView from './StatusView';
import ChatView from './ChatView';
import { GroupNote } from './ChatSelector';
import { ENTRY_MENU_CLASS, HistoryEntryMenu, RenameField } from './HistoryRename';
import { TrashBanner, TrashDialogs, TrashEntryButton, TrashSnackbar, TrashView } from './TrashView';
import { ChatTokens, ContextMeter } from './ContextMeter';
import PlanButton from './PlanButton';
import TaskButton from './TaskButton';
import InternetToggle from './InternetToggle';
import AgentDropZone from './AgentDropZone';
import AgentMenuTheme from './AgentMenuTheme';
import NewChatButton, { NewChatError } from './NewChatButton';
import RunStateChip from './RunStateChip';
import SignInNotice from './SignInNotice';
import { GroupToggleButton, SubagentBreadcrumb, SubagentEntryContent } from './SubagentView';
import { agentColors } from './tokens';
import { FOOTER_HEIGHT } from './AgentContextPanel';

/** Sub-entries under a history entry: the open chat's, or another chat's from its short list (issue #60). */
function HistorySubagents({
    items,
    selectedRunId,
    onSelect,
}: {
    items: SubagentNavItem[];
    selectedRunId?: string;
    onSelect: (runId: string) => void;
}) {
    return (
        <Box
            component="ul"
            data-testid="agent-history-subagents"
            sx={{
                listStyle: 'none',
                m: 0,
                mb: 0.75,
                p: 0,
                pl: 1.5,
                display: 'grid',
                // minmax(0, 1fr): titles ellipsize instead of widening the history column
                gridTemplateColumns: 'minmax(0, 1fr)',
                rowGap: 0.25,
            }}
        >
            {items.map((it) => {
                const active = selectedRunId === it.runId;
                return (
                    <Box
                        component="li"
                        key={it.runId}
                        role="button"
                        tabIndex={0}
                        aria-current={active ? 'true' : undefined}
                        data-testid="agent-subagent-entry"
                        data-run-id={it.runId}
                        onClick={() => onSelect(it.runId)}
                        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(it.runId)}
                        sx={{
                            px: 1,
                            py: 0.6,
                            borderRadius: 1,
                            cursor: 'pointer',
                            fontSize: 12.5,
                            color: active ? 'text.primary' : 'text.secondary',
                            bgcolor: active ? agentColors.subagentTint : undefined,
                            borderLeft: `2px solid ${active ? agentColors.subagent : 'transparent'}`,
                            '&:hover': {
                                bgcolor: active ? agentColors.subagentTint : 'action.hover',
                            },
                        }}
                    >
                        <SubagentEntryContent item={it} />
                    </Box>
                );
            })}
        </Box>
    );
}

/** The history column: the chats (scrolling) and, fixed at its bottom, the entry of the trash (issue #76). */
function History({ onMoveToTrash, onOpenTrash }: { onMoveToTrash: (chat: Chat) => void; onOpenTrash: () => void }) {
    const { chats, selectedChatId, selectChat, trash } = useAgent();
    const sub = useSubagentNav();
    const groups = useChatSubagentGroups(chats);
    const rename = useRenameChat();
    // the search field above the list (issue #122); the column shows every chat, so no limit is needed
    const [query, setQuery] = useState('');
    const result = useMemo(
        () =>
            searchChats(
                chats.map((c) => ({ ...c, title: chatTitle(c) })),
                query,
                { chatId: sub.chatId, selectedChatId, subagents: sub.items, others: groups.known },
                { limit: Infinity },
            ),
        [chats, query, sub.chatId, sub.items, groups.known, selectedChatId],
    );
    // the sub-entries under each chat: the search's matches (open), otherwise the groups the user opened (issue #60)
    const listed = useMemo(
        () =>
            historyGroups(result, {
                openChatId: sub.chatId,
                openChat: { items: sub.items, open: sub.open },
                other: (chatId) => {
                    const chat = chats.find((c) => c.id === chatId);
                    const g = chat ? groups.group(chat) : undefined;
                    return { items: g?.items, open: !!g?.open };
                },
            }),
        [result, sub.chatId, sub.items, sub.open, chats, groups.group],
    );
    // DL5.5 (issue #122): a double click renames only the entry that was already open. The first click of the pair
    // selects (and wakes) the chat, so the selection has to be read at the first press, not at the double click.
    const preselected = useRef(false);
    return (
        <Box sx={{ borderRight: 1, borderColor: 'divider', pr: 2.5, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                <NewChatButton fullWidth sx={{ mb: 2 }} />
                <NewChatError sx={{ mb: 2 }} />
                <TextField
                    size="small"
                    fullWidth
                    placeholder="Search chats"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') setQuery('');
                    }}
                    inputProps={{ 'aria-label': 'Search chats', 'data-testid': 'agent-history-search' }}
                    sx={{ mt: 2, mb: 1.5 }}
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <SearchIcon fontSize="small" />
                            </InputAdornment>
                        ),
                        endAdornment: query ? (
                            <InputAdornment position="end">
                                <Tooltip title="Clear search">
                                    <IconButton
                                        size="small"
                                        edge="end"
                                        aria-label="Clear search"
                                        data-testid="agent-history-search-clear"
                                        onClick={() => setQuery('')}
                                    >
                                        <ClearIcon fontSize="small" />
                                    </IconButton>
                                </Tooltip>
                            </InputAdornment>
                        ) : undefined,
                    }}
                />
                <Typography
                    sx={{
                        fontSize: 11.5,
                        letterSpacing: 1.2,
                        textTransform: 'uppercase',
                        color: 'text.disabled',
                        mb: 1.25,
                    }}
                >
                    History
                </Typography>
                {chats.length === 0 && (
                    <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>No chats yet.</Typography>
                )}
                {chats.length > 0 && result.chats.length === 0 && (
                    <Typography variant="body2" color="text.secondary" sx={{ px: 1.25, py: 2 }}>
                        No chats match
                    </Typography>
                )}
                {result.chats.map((c) => {
                    const on = c.id === selectedChatId;
                    const state = runStateOf(c);
                    const withSubs = c.id === sub.chatId && sub.items.length > 0;
                    // another chat with subagents: its group loads on the first expand, without waking it (issue #60)
                    const other = !withSubs && (c.subagents ?? 0) > 0 ? groups.group(c) : undefined;
                    const group = listed[c.id];
                    const groupOpen = !!group?.open;
                    const editing = rename.state.chatId === c.id;
                    const failure = rename.state.error?.chatId === c.id ? rename.state.error.text : undefined;
                    return (
                        <Fragment key={c.id}>
                            <Box
                                role="button"
                                tabIndex={0}
                                onClick={() => selectChat(c.id)}
                                onMouseDown={(e) => {
                                    if (e.detail <= 1) preselected.current = on;
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') selectChat(c.id);
                                    else if (e.key === 'F2') rename.start(c);
                                }}
                                data-testid="agent-history-entry"
                                data-chat-id={c.id}
                                // two lines at most; the full title on hover
                                title={editing ? undefined : chatTitle(c)}
                                sx={{
                                    px: 1.25,
                                    py: 1.1,
                                    mb: 0.4,
                                    borderRadius: 1,
                                    cursor: 'pointer',
                                    fontSize: 13,
                                    lineHeight: 1.4,
                                    color: on ? 'text.primary' : 'text.secondary',
                                    bgcolor: on ? agentColors.greenTint : undefined,
                                    '&:hover': { bgcolor: on ? agentColors.greenTint : 'action.hover' },
                                    [`&:hover .${ENTRY_MENU_CLASS}, &:focus-within .${ENTRY_MENU_CLASS}`]: { opacity: 1 },
                                }}
                            >
                                {editing ? (
                                    <RenameField
                                        value={rename.state.draft}
                                        onChange={rename.change}
                                        onCommit={() => void rename.commit()}
                                        onCancel={rename.cancel}
                                    />
                                ) : (
                                    <Box sx={{ display: 'flex', alignItems: 'flex-start', columnGap: 0.5 }}>
                                        <Box
                                            data-testid="agent-history-title"
                                            // double-click renames, like the menu (issue #49), but only the open chat (#122)
                                            onDoubleClick={() => {
                                                if (preselected.current) rename.start(c);
                                            }}
                                            sx={{
                                                flex: 1,
                                                minWidth: 0,
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                display: '-webkit-box',
                                                WebkitLineClamp: 2,
                                                WebkitBoxOrient: 'vertical',
                                                // a word longer than the line breaks instead of running out of the list
                                                overflowWrap: 'anywhere',
                                            }}
                                        >
                                            {chatTitle(c)}
                                        </Box>
                                        <HistoryEntryMenu
                                            title={chatTitle(c)}
                                            visible={on}
                                            onRename={() => rename.start(c)}
                                            onTrash={() => onMoveToTrash(c)}
                                        />
                                    </Box>
                                )}
                                <Box
                                    sx={{
                                        fontSize: 11,
                                        color: 'text.disabled',
                                        mt: 0.25,
                                        display: 'flex',
                                        alignItems: 'center',
                                        flexWrap: 'wrap',
                                        columnGap: 1,
                                    }}
                                >
                                    <span>{formatRelativeDay(c.updated_at)}</span>
                                    <RunStateChip state={state} since={runSince(c)} />
                                    {c.pending_approvals > 0 && state !== 'waiting' && (
                                        <span style={{ color: agentColors.amberText }}>{c.pending_approvals} waiting</span>
                                    )}
                                    {(withSubs || other) && (
                                        <Box component="span" sx={{ ml: 'auto' }}>
                                            <GroupToggleButton
                                                open={groupOpen}
                                                count={withSubs ? sub.items.length : c.subagents ?? 0}
                                                onToggle={withSubs ? sub.toggle : () => groups.toggle(c)}
                                            />
                                        </Box>
                                    )}
                                </Box>
                                {failure && (
                                    <Box
                                        role="alert"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            rename.dismiss();
                                        }}
                                        sx={{ fontSize: 11, color: 'error.main', mt: 0.25 }}
                                    >
                                        {failure}
                                    </Box>
                                )}
                            </Box>
                            {groupOpen &&
                                (group && group.subagents.length > 0 ? (
                                    // the open chat's own subagents keep the selection; another chat's open that chat
                                    c.id === sub.chatId ? (
                                        <HistorySubagents
                                            items={group.subagents}
                                            selectedRunId={sub.selected?.runId}
                                            onSelect={sub.select}
                                        />
                                    ) : (
                                        <HistorySubagents
                                            items={group.subagents}
                                            onSelect={(runId) => selectChat(c.id, runId)}
                                        />
                                    )
                                ) : (
                                    <Box sx={{ mb: 0.75 }}>
                                        <GroupNote loading={other?.loading} error={other?.error} indent={1.5} />
                                    </Box>
                                ))}
                        </Fragment>
                    );
                })}
        </Box>
        <TrashEntryButton count={trash?.chats.length} onOpen={onOpenTrash} />
        </Box>
    );
}

/** Head of the open chat: title, run state while something happens, internet switch, context ring and tokens. */
function ChatHeader() {
    const { chats, selectedChatId, compacting, taskLists, planLists } = useAgent();
    const sub = useSubagentNav();
    const chat = chats.find((c) => c.id === selectedChatId);
    if (!chat) return null;
    const state = runStateOf(chat);
    return (
        <Box
            data-testid="agent-chat-header"
            // the controls wrap onto a second line before the title gets narrower than about 200 px (issue #38)
            sx={{
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                columnGap: 2,
                rowGap: 0.75,
                borderBottom: 1,
                borderColor: 'divider',
                pb: 1.25,
            }}
        >
            <Typography
                data-testid="agent-chat-title"
                component="div"
                title={sub.selected ? undefined : chatTitle(chat)}
                sx={{
                    fontSize: 15,
                    fontWeight: 500,
                    minWidth: 0,
                    flex: '1 1 200px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                }}
            >
                {/* a subagent shows as breadcrumb "← chat › subagent" in the title's place (issue #48) */}
                {sub.selected ? (
                    <SubagentBreadcrumb
                        chatTitle={chatTitle(chat)}
                        item={sub.selected}
                        onBack={() => sub.select(undefined)}
                        fontSize={15}
                    />
                ) : (
                    chatTitle(chat)
                )}
            </Typography>
            {/* the controls move together and wrap among themselves only when the column is narrower still */}
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    columnGap: 2,
                    rowGap: 0.75,
                    minWidth: 0,
                }}
            >
                {/* the same chip as in the panel header, only while something happens (issue #35) */}
                <RunStateChip state={state} since={runSince(chat)} framed />
                <InternetToggle chat={chat} />
                <TaskButton tasks={taskLists[chat.id]} />
                <PlanButton plans={planLists[chat.id]} />
                <ContextMeter chat={chat} compacting={compacting[chat.id]} label />
                <ChatTokens chat={chat} />
            </Box>
        </Box>
    );
}


/** Page "Agent" (/ai-agent) with the tabs Chat, Activity and Status; its menus leave the page scroll alone. */
export default function AgentPage() {
    return (
        <AgentMenuTheme>
            <AgentPageContent />
        </AgentMenuTheme>
    );
}

function AgentPageContent() {
    const { status, selectedChatId, selectChat, refreshChats, trash } = useAgent();
    const [params, setParams] = useSearchParams();
    const tab = agentTabOf(params.get('tab'));
    const openChat = (id: string) => {
        selectChat(id);
        setParams({});
    };
    const [refreshKey, setRefreshKey] = useState(0);
    // the trash replaces the history on the chat tab (?view=trash, issue #76); a chat in it is read only on the right
    const trashView = tab === 'chat' && params.get('view') === 'trash';
    const [trashOpenId, setTrashOpenId] = useState<string>();
    const actions = useTrashActions({ onRestored: () => setParams({}) });
    // a chat that leaves the trash (restored, deleted, emptied) closes its read-only view
    useEffect(() => {
        if (trashOpenId && trash && !trash.chats.some((c) => c.id === trashOpenId)) setTrashOpenId(undefined);
    }, [trashOpenId, trash]);
    const openHistory = () => {
        setTrashOpenId(undefined);
        setParams({});
    };
    const trashOpen = trashView && trashOpenId ? trash?.chats.find((c) => c.id === trashOpenId) : undefined;

    const refresh = () => {
        void refreshChats();
        setRefreshKey((k) => k + 1);
    };

    return (
        <Box
            sx={{
                display: 'flex',
                flexDirection: 'column',
                // viewport minus app bar (64), main padding (2 × 24) and footer
                height: tab === 'chat' ? `calc(100vh - 64px - 48px - ${FOOTER_HEIGHT}px)` : undefined,
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="h4" component="h4">
                    Agent
                </Typography>
                {status === 'ready' && (
                    <Tooltip title="Refresh">
                        <Fab color="primary" size="small" aria-label="refresh" onClick={refresh}>
                            <SyncIcon />
                        </Fab>
                    </Tooltip>
                )}
            </Box>
            <Tabs
                value={tab}
                onChange={(_, v: AgentTab) => setParams(v === 'chat' ? {} : { tab: v })}
                sx={{ borderBottom: 1, borderColor: 'divider', mt: 1.5 }}
            >
                <Tab value="chat" label="Chat" />
                <Tab value="activity" label="Activity" />
                <Tab value="status" label="Status" />
            </Tabs>
            {status !== 'ready' ? (
                <SignInNotice />
            ) : tab === 'chat' ? (
                // files dropped anywhere on the chat area (history and chat) go to the open chat
                <AgentDropZone
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: '240px minmax(0, 1fr)',
                        gap: 3.5,
                        flex: 1,
                        minHeight: 0,
                        mt: 2.5,
                    }}
                >
                    {trashView ? (
                        <TrashView
                            trash={trash}
                            openId={trashOpenId}
                            onBack={openHistory}
                            onOpen={setTrashOpenId}
                            onRestore={actions.restore}
                            onDelete={actions.requestDelete}
                            onEmpty={actions.requestEmpty}
                        />
                    ) : (
                        <History
                            onMoveToTrash={actions.requestMove}
                            onOpenTrash={() => setParams({ view: 'trash' })}
                        />
                    )}
                    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                        {trashView ? (
                            trashOpen ? (
                                <ChatView
                                    key={trashOpen.id}
                                    chatId={trashOpen.id}
                                    readOnly
                                    header={
                                        <TrashBanner
                                            onRestore={() => actions.restore(trashOpen.id)}
                                            onDelete={() => actions.requestDelete(trashOpen)}
                                        />
                                    }
                                />
                            ) : (
                                <Typography sx={{ color: 'text.secondary', fontSize: 14 }}>
                                    Choose a chat from the trash to read it.
                                </Typography>
                            )
                        ) : selectedChatId ? (
                            <ChatView
                                key={selectedChatId}
                                chatId={selectedChatId}
                                header={<ChatHeader />}
                            />
                        ) : (
                            <Typography sx={{ color: 'text.secondary', fontSize: 14 }}>
                                Start a new chat to work with the agent, or drop files here to start one with them.
                            </Typography>
                        )}
                    </Box>
                </AgentDropZone>
            ) : tab === 'activity' ? (
                <Box sx={{ mt: 3, pb: 4 }}>
                    <ActivityView refreshKey={refreshKey} />
                </Box>
            ) : (
                <Box sx={{ mt: 3, pb: 4 }}>
                    <StatusView refreshKey={refreshKey} onOpenChat={openChat} />
                </Box>
            )}
            <TrashDialogs dialog={actions.dialog} onCancel={actions.closeDialog} onConfirm={actions.confirm} />
            <TrashSnackbar notice={actions.notice} onClose={actions.dismissNotice} />
        </Box>
    );
}
