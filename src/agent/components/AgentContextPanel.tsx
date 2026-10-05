// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { useState } from 'react';
import { useLocation } from 'react-router-dom';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Toolbar from '@mui/material/Toolbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CloseIcon from '@mui/icons-material/Close';

import { useAgent } from '../AgentContext';
import { sectionOf } from '../format';
import ChatView from './ChatView';
import NewChatDialog from './NewChatDialog';
import SignInNotice from './SignInNotice';
import { agentColors } from './tokens';

export const AGENT_PANEL_WIDTH = 400;
/** Height of the fixed platform footer. */
export const FOOTER_HEIGHT = 30;

function ChatSelector({ onNew }: { onNew: () => void }) {
    const { chats, selectedChatId, selectChat } = useAgent();
    return (
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Select
                size="small"
                value={selectedChatId && chats.some((c) => c.id === selectedChatId) ? selectedChatId : ''}
                onChange={(e) => selectChat(String(e.target.value))}
                displayEmpty
                sx={{ flex: 1, minWidth: 0, bgcolor: '#fff', fontSize: 13, '& .MuiSelect-select': { py: 0.75 } }}
                inputProps={{ 'aria-label': 'Chat' }}
            >
                {chats.length === 0 && (
                    <MenuItem value="" disabled>
                        No chats yet
                    </MenuItem>
                )}
                {chats.slice(0, 20).map((c) => (
                    <MenuItem key={c.id} value={c.id} sx={{ fontSize: 13 }}>
                        <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {c.title || 'Untitled chat'}
                        </Box>
                        {c.pending_approvals > 0 && (
                            <Box component="span" sx={{ ml: 1, color: agentColors.amberText, fontSize: 12 }}>
                                · {c.pending_approvals} waiting
                            </Box>
                        )}
                    </MenuItem>
                ))}
            </Select>
            <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={onNew} sx={{ flex: 'none' }}>
                New chat
            </Button>
        </Box>
    );
}

/**
 * Right-hand context panel: the agent next to the current platform page. Persistent drawer; the main
 * content makes room for it (PageContainer).
 */
export default function AgentContextPanel() {
    const { status, panelOpen, setPanelOpen, selectedChatId, chatsLoaded, chats } = useAgent();
    const [newOpen, setNewOpen] = useState(false);
    const section = sectionOf(useLocation().pathname);

    return (
        <Drawer
            variant="persistent"
            anchor="right"
            open={panelOpen}
            sx={{
                '& .MuiDrawer-paper': {
                    width: AGENT_PANEL_WIDTH,
                    boxSizing: 'border-box',
                    pb: `${FOOTER_HEIGHT}px`,
                    bgcolor: agentColors.panelBg,
                },
            }}
        >
            <Toolbar />
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.25,
                    px: 2,
                    py: 1.25,
                    bgcolor: '#fff',
                    borderBottom: 1,
                    borderColor: 'divider',
                }}
            >
                <AutoAwesomeIcon sx={{ fontSize: 20, color: agentColors.green }} />
                <Typography sx={{ fontSize: 16, fontWeight: 500, color: agentColors.green }}>Agent</Typography>
                {section && (
                    <Box
                        sx={{
                            ml: 'auto',
                            fontSize: 12,
                            color: 'text.secondary',
                            border: 1,
                            borderColor: 'divider',
                            borderRadius: 3,
                            px: 1.25,
                            py: '2px',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        Context: {section}
                    </Box>
                )}
                <Tooltip title="Close">
                    <IconButton
                        size="small"
                        onClick={() => setPanelOpen(false)}
                        sx={{ ml: section ? 0 : 'auto' }}
                        aria-label="Close agent panel"
                    >
                        <CloseIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
            </Box>
            {status !== 'ready' ? (
                <SignInNotice />
            ) : (
                <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                    {selectedChatId ? (
                        <ChatView
                            key={selectedChatId}
                            chatId={selectedChatId}
                            dense
                            placeholder={section ? `Ask about ${section} …` : undefined}
                            header={<ChatSelector onNew={() => setNewOpen(true)} />}
                        />
                    ) : (
                        <Box sx={{ p: 1.75, display: 'grid', gap: 1.5 }}>
                            <ChatSelector onNew={() => setNewOpen(true)} />
                            {chatsLoaded && chats.length === 0 && (
                                <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
                                    Start a chat to let the agent work with your datasets, models and trainings. You
                                    choose which rights it gets.
                                </Typography>
                            )}
                        </Box>
                    )}
                </Box>
            )}
            <NewChatDialog open={newOpen} onClose={() => setNewOpen(false)} />
        </Drawer>
    );
}
