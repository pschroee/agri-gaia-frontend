// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import SyncIcon from '@mui/icons-material/Sync';

import { useAgent } from '../AgentContext';
import { formatRelativeDay } from '../format';
import { runSince, runStateOf } from '../runState';
import ActivityView from './ActivityView';
import StatusView from './StatusView';
import ChatView from './ChatView';
import { ChatCost, ContextMeter } from './ContextMeter';
import InternetToggle from './InternetToggle';
import AgentDropZone from './AgentDropZone';
import AgentMenuTheme from './AgentMenuTheme';
import NewChatButton, { NewChatError } from './NewChatButton';
import RunStateChip from './RunStateChip';
import SignInNotice from './SignInNotice';
import { agentColors } from './tokens';
import { FOOTER_HEIGHT } from './AgentContextPanel';

function History() {
    const { chats, selectedChatId, selectChat } = useAgent();
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
                return (
                    <Box
                        key={c.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => selectChat(c.id)}
                        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && selectChat(c.id)}
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
                        }}
                    >
                        <Box
                            sx={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                            }}
                        >
                            {c.title || 'Untitled chat'}
                        </Box>
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
                        </Box>
                    </Box>
                );
            })}
        </Box>
    );
}

/** Head of the open chat: title, run state while something happens, internet switch, context ring, tokens and cost. */
function ChatHeader() {
    const { chats, selectedChatId, compacting } = useAgent();
    const chat = chats.find((c) => c.id === selectedChatId);
    if (!chat) return null;
    const state = runStateOf(chat);
    return (
        <Box
            data-testid="agent-chat-header"
            sx={{ display: 'flex', alignItems: 'center', gap: 2, borderBottom: 1, borderColor: 'divider', pb: 1.25 }}
        >
            <Typography
                sx={{
                    fontSize: 15,
                    fontWeight: 500,
                    minWidth: 0,
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                }}
            >
                {chat.title || 'Untitled chat'}
            </Typography>
            {/* the same chip as in the panel header, only while something happens (issue #35) */}
            <RunStateChip state={state} since={runSince(chat)} framed />
            <InternetToggle chat={chat} />
            <ContextMeter chat={chat} compacting={compacting[chat.id]} label />
            <ChatCost chat={chat} tokens />
        </Box>
    );
}

type PageTab = 'chat' | 'activity' | 'status';

const tabOf = (v: string | null): PageTab => (v === 'activity' || v === 'status' ? v : 'chat');

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
    const tab = tabOf(params.get('tab'));
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
                onChange={(_, v: PageTab) => setParams(v === 'chat' ? {} : { tab: v })}
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
                                placeholder="Reply or describe a new task …"
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
