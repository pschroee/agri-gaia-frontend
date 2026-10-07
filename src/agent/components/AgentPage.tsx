// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { Fragment, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import SyncIcon from '@mui/icons-material/Sync';

import { useAgent } from '../AgentContext';
import { chatTitle, formatRelativeDay } from '../format';
import { AgentTab, agentTabOf } from '../panelCarry';
import { runSince, runStateOf } from '../runState';
import { useSubagentNav } from '../useSubagentNav';
import { useRenameChat } from '../useRenameChat';
import ActivityView from './ActivityView';
import StatusView from './StatusView';
import ChatView from './ChatView';
import { ENTRY_MENU_CLASS, HistoryEntryMenu, RenameField } from './HistoryRename';
import { ChatTokens, ContextMeter } from './ContextMeter';
import InternetToggle from './InternetToggle';
import AgentDropZone from './AgentDropZone';
import AgentMenuTheme from './AgentMenuTheme';
import NewChatButton, { NewChatError } from './NewChatButton';
import RunStateChip from './RunStateChip';
import SignInNotice from './SignInNotice';
import { GroupToggleButton, SubagentBreadcrumb, SubagentEntryContent } from './SubagentView';
import { agentColors } from './tokens';
import { FOOTER_HEIGHT } from './AgentContextPanel';

function History() {
    const { chats, selectedChatId, selectChat } = useAgent();
    const sub = useSubagentNav();
    const rename = useRenameChat();
    return (
        <Box sx={{ borderRight: 1, borderColor: 'divider', pr: 2.5, overflowY: 'auto', minHeight: 0 }}>
            <NewChatButton fullWidth sx={{ mb: 2 }} />
            <NewChatError sx={{ mb: 2 }} />
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
            {chats.map((c) => {
                const on = c.id === selectedChatId;
                const state = runStateOf(c);
                const withSubs = on && c.id === sub.chatId && sub.items.length > 0;
                const editing = rename.state.chatId === c.id;
                const failure = rename.state.error?.chatId === c.id ? rename.state.error.text : undefined;
                return (
                    <Fragment key={c.id}>
                        <Box
                            role="button"
                            tabIndex={0}
                            onClick={() => selectChat(c.id)}
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
                                        // double-click renames, like the menu (issue #49)
                                        onDoubleClick={() => rename.start(c)}
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
                                {withSubs && (
                                    <Box component="span" sx={{ ml: 'auto' }}>
                                        <GroupToggleButton
                                            open={sub.open}
                                            count={sub.items.length}
                                            onToggle={sub.toggle}
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
                        {withSubs && sub.open && (
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
                                {sub.items.map((it) => {
                                    const active = sub.selected?.runId === it.runId;
                                    return (
                                        <Box
                                            component="li"
                                            key={it.runId}
                                            role="button"
                                            tabIndex={0}
                                            aria-current={active ? 'true' : undefined}
                                            data-testid="agent-subagent-entry"
                                            data-run-id={it.runId}
                                            onClick={() => sub.select(it.runId)}
                                            onKeyDown={(e) =>
                                                (e.key === 'Enter' || e.key === ' ') && sub.select(it.runId)
                                            }
                                            sx={{
                                                px: 1,
                                                py: 0.6,
                                                borderRadius: 1,
                                                cursor: 'pointer',
                                                fontSize: 12.5,
                                                color: active ? 'text.primary' : 'text.secondary',
                                                bgcolor: active ? agentColors.subagentTint : undefined,
                                                borderLeft: `2px solid ${
                                                    active ? agentColors.subagent : 'transparent'
                                                }`,
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
                        )}
                    </Fragment>
                );
            })}
        </Box>
    );
}

/** Head of the open chat: title, run state while something happens, internet switch, context ring and tokens. */
function ChatHeader() {
    const { chats, selectedChatId, compacting } = useAgent();
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
    const { status, selectedChatId, selectChat, refreshChats } = useAgent();
    const [params, setParams] = useSearchParams();
    const tab = agentTabOf(params.get('tab'));
    const openChat = (id: string) => {
        selectChat(id);
        setParams({});
    };
    const [refreshKey, setRefreshKey] = useState(0);

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
                    <History />
                    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                        {selectedChatId ? (
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
        </Box>
    );
}
