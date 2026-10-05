// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Fab from '@mui/material/Fab';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import SyncIcon from '@mui/icons-material/Sync';

import { useAgent } from '../AgentContext';
import { formatRelativeDay } from '../format';
import { runSince, runStateOf } from '../runState';
import ActivityView from './ActivityView';
import ChatView from './ChatView';
import { ChatCost, ContextMeter } from './ContextMeter';
import InternetToggle from './InternetToggle';
import NewChatDialog from './NewChatDialog';
import RunStateChip from './RunStateChip';
import SignInNotice from './SignInNotice';
import { agentColors } from './tokens';
import { FOOTER_HEIGHT } from './AgentContextPanel';

function History({ onNew }: { onNew: () => void }) {
    const { chats, selectedChatId, selectChat } = useAgent();
    return (
        <Box sx={{ borderRight: 1, borderColor: 'divider', pr: 2.5, overflowY: 'auto', minHeight: 0 }}>
            <Button fullWidth variant="outlined" startIcon={<AddIcon />} onClick={onNew} sx={{ mb: 2 }}>
                New chat
            </Button>
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
                            {state && <RunStateChip state={state} since={runSince(c)} short />}
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

/** Head of the open chat: title, internet switch, context ring, tokens and cost. */
function ChatHeader() {
    const { chats, selectedChatId, compacting } = useAgent();
    const chat = chats.find((c) => c.id === selectedChatId);
    if (!chat) return null;
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
            <InternetToggle chat={chat} />
            <ContextMeter chat={chat} compacting={compacting[chat.id]} label />
            <ChatCost chat={chat} tokens />
        </Box>
    );
}

/** Page "Agent" (/ai-agent) with the tabs Chat and Activity. */
export default function AgentPage() {
    const { status, selectedChatId, refreshChats } = useAgent();
    const [params, setParams] = useSearchParams();
    const tab = params.get('tab') === 'activity' ? 'activity' : 'chat';
    const [newOpen, setNewOpen] = useState(false);
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
                onChange={(_, v) => setParams(v === 'activity' ? { tab: 'activity' } : {})}
                sx={{ borderBottom: 1, borderColor: 'divider', mt: 1.5 }}
            >
                <Tab value="chat" label="Chat" />
                <Tab value="activity" label="Activity" />
            </Tabs>
            {status !== 'ready' ? (
                <SignInNotice />
            ) : tab === 'chat' ? (
                <Box
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: '240px minmax(0, 1fr)',
                        gap: 3.5,
                        flex: 1,
                        minHeight: 0,
                        mt: 2.5,
                    }}
                >
                    <History onNew={() => setNewOpen(true)} />
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
                                Start a new chat to work with the agent.
                            </Typography>
                        )}
                    </Box>
                </Box>
            ) : (
                <Box sx={{ mt: 3, pb: 4 }}>
                    <ActivityView refreshKey={refreshKey} />
                </Box>
            )}
            <NewChatDialog open={newOpen} onClose={() => setNewOpen(false)} />
        </Box>
    );
}
