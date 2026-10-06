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
import { isRunning, runSince, runStateOf } from '../runState';
import ChatView from './ChatView';
import { ChatCost, ContextMeter } from './ContextMeter';
import InternetToggle from './InternetToggle';
import NewChatDialog from './NewChatDialog';
import RunStateChip from './RunStateChip';
import SignInNotice from './SignInNotice';
import { agentColors } from './tokens';

export const AGENT_PANEL_WIDTH = 400;
/** Height of the fixed platform footer. */
export const FOOTER_HEIGHT = 30;

/** Chat selector with the open chat's internet switch (the globe) and "New chat". */
function ChatSelector({ onNew }: { onNew: () => void }) {
    const { chats, selectedChatId, selectChat } = useAgent();
    const selected = chats.find((c) => c.id === selectedChatId);
    return (
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Select
                size="small"
                value={selectedChatId && chats.some((c) => c.id === selectedChatId) ? selectedChatId : ''}
                onChange={(e) => selectChat(String(e.target.value))}
                displayEmpty
                // the state of the selected chat shows in the panel header
                renderValue={(id) => {
                    const c = chats.find((x) => x.id === id);
                    return c ? c.title || 'Untitled chat' : chats.length ? '' : 'No chats yet';
                }}
                sx={{ flex: 1, minWidth: 0, bgcolor: '#fff', fontSize: 13, '& .MuiSelect-select': { py: 0.75 } }}
                inputProps={{ 'aria-label': 'Chat' }}
            >
                {chats.length === 0 && (
                    <MenuItem value="" disabled>
                        No chats yet
                    </MenuItem>
                )}
                {chats.slice(0, 20).map((c) => {
                    const state = runStateOf(c);
                    return (
                        <MenuItem key={c.id} value={c.id} sx={{ fontSize: 13, gap: 1 }}>
                            <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                                {c.title || 'Untitled chat'}
                            </Box>
                            {state && state !== 'idle' && (
                                <Box component="span" sx={{ ml: 'auto', flex: 'none', display: 'inline-flex' }}>
                                    <RunStateChip state={state} short />
                                </Box>
                            )}
                            {c.pending_approvals > 0 && state !== 'waiting' && (
                                <Box component="span" sx={{ color: agentColors.amberText, fontSize: 12, flex: 'none' }}>
                                    · {c.pending_approvals} waiting
                                </Box>
                            )}
                        </MenuItem>
                    );
                })}
            </Select>
            {selected && <InternetToggle chat={selected} compact />}
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
    const { status, panelOpen, setPanelOpen, selectedChatId, chatsLoaded, chats, compacting } = useAgent();
    const [newOpen, setNewOpen] = useState(false);
    const section = sectionOf(useLocation().pathname);
    // live through updateChat of the open ChatView
    const selected = status === 'ready' ? chats.find((c) => c.id === selectedChatId) : undefined;
    const selectedState = runStateOf(selected);

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
                <AutoAwesomeIcon
                    aria-label="Agent"
                    sx={{ fontSize: 20, color: agentColors.green, flex: 'none' }}
                />
                {/* during a run the "Agent" label gives its room to the state chip with the timer */}
                {!(selectedState && isRunning(selectedState)) && (
                    <Typography sx={{ fontSize: 16, fontWeight: 500, color: agentColors.green, flex: 'none' }}>
                        Agent
                    </Typography>
                )}
                {/* the chip is the part of the header that gives way on long runs; the close button always stays */}
                {selectedState && (
                    <Box data-testid="agent-panel-state" sx={{ flex: '0 1 auto', minWidth: 0, display: 'inline-flex' }}>
                        <RunStateChip state={selectedState} since={runSince(selected)} short framed />
                    </Box>
                )}
                {selected && (
                    <Box sx={{ ml: 'auto', flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                        <ContextMeter chat={selected} compacting={compacting[selected.id]} />
                        <ChatCost chat={selected} />
                    </Box>
                )}
                {/* with a chat open, the input's placeholder names the section and the room goes to context and cost */}
                {section && !selected && (
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
                            // gives way to the run state chip
                            minWidth: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                        }}
                        title={`Context: ${section}`}
                    >
                        {`Context: ${section}`}
                    </Box>
                )}
                <Tooltip title="Close">
                    <IconButton
                        size="small"
                        onClick={() => setPanelOpen(false)}
                        sx={{ ml: section || selected ? 0 : 'auto', flex: 'none' }}
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
