// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { useLocation, useNavigate } from 'react-router-dom';

import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Toolbar from '@mui/material/Toolbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CloseIcon from '@mui/icons-material/Close';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';

import { useAgent } from '../AgentContext';
import { expandToAgentPage } from '../expand';
import { sectionOf } from '../format';
import { isRunning, runSince, runStateOf, runStateText } from '../runState';
import ChatSelector from './ChatSelector';
import ChatView from './ChatView';
import { ContextMeter } from './ContextMeter';
import RunStateChip from './RunStateChip';
import AgentDropZone from './AgentDropZone';
import SignInNotice from './SignInNotice';
import { agentColors } from './tokens';

export const AGENT_PANEL_WIDTH = 400;
/** Height of the fixed platform footer. */
export const FOOTER_HEIGHT = 30;
/** Height of the panel's header (design: 56 px; 48 here, so the transcript keeps its height, issue #54). */
const PANEL_HEADER_HEIGHT = 48;
/** Round 36 px icon buttons of the header (expand, close). */
const headerButtonSx = { width: 36, height: 36, flex: 'none', color: 'rgba(0, 0, 0, 0.54)' } as const;
/**
 * Right-hand context panel: the agent next to the current platform page. Persistent drawer; the main
 * content makes room for it (PageContainer).
 */
export default function AgentContextPanel() {
    const { status, panelOpen, setPanelOpen, selectedChatId, selectChat, chatsLoaded, chats, compacting } = useAgent();
    const navigate = useNavigate();
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
                    // white as in the design: the selector's floating label sits on it
                    bgcolor: '#fff',
                },
            }}
        >
            <Toolbar />
            {/* files dropped anywhere on the panel go to the open chat (AgentDropZone) */}
            <AgentDropZone sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                {/* header (design): symbol, "Agent", context ring, expand, close */}
                <Box
                    data-testid="agent-panel-header"
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        pl: 2,
                        pr: 1,
                        minHeight: PANEL_HEADER_HEIGHT,
                        boxSizing: 'border-box',
                        bgcolor: '#fff',
                        borderBottom: 1,
                        borderColor: 'divider',
                    }}
                >
                    <AutoAwesomeIcon
                        aria-label="Agent"
                        sx={{ fontSize: 24, color: agentColors.green, flex: 'none' }}
                    />
                    {/* during a run the "Agent" label gives its room to the state chip with the timer */}
                    {!(selectedState && isRunning(selectedState)) && (
                        <Typography
                            sx={{ ml: 1, fontSize: 18, fontWeight: 500, color: agentColors.green, flex: 'none' }}
                        >
                            Agent
                        </Typography>
                    )}
                    {/* the chip is the part of the header that gives way on long runs; the close button always stays */}
                    {/* only while something happens (issue #35): no chip for a ready chat */}
                    {runStateText(selectedState, 'header') && (
                        <Box data-testid="agent-panel-state" sx={{ flex: '0 1 auto', minWidth: 0, display: 'inline-flex' }}>
                            <RunStateChip state={selectedState} since={runSince(selected)} framed />
                        </Box>
                    )}
                    {selected && (
                        <Box sx={{ ml: 'auto', flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                            <Box sx={{ px: '6px', display: 'inline-flex' }}>
                                <ContextMeter chat={selected} compacting={compacting[selected.id]} />
                            </Box>
                            {/* the tokens stay on /ai-agent; here the chat moves to the full page */}
                            <Tooltip title="Open in agent page">
                                <IconButton
                                    onClick={() =>
                                        expandToAgentPage(selected.id, { selectChat, setPanelOpen, navigate })
                                    }
                                    aria-label="Open in agent page"
                                    sx={headerButtonSx}
                                >
                                    <OpenInFullIcon sx={{ fontSize: 20 }} />
                                </IconButton>
                            </Tooltip>
                        </Box>
                    )}
                    {/* with a chat open the room goes to the context; the page goes with every message without a chip */}
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
                            onClick={() => setPanelOpen(false)}
                            sx={{ ...headerButtonSx, ml: section || selected ? 0 : 'auto' }}
                            aria-label="Close agent panel"
                        >
                            <CloseIcon sx={{ fontSize: 20 }} />
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
                                header={<ChatSelector />}
                            />
                        ) : (
                            <Box sx={{ p: 2, display: 'grid', gap: 1.5 }}>
                                <ChatSelector />
                                {chatsLoaded && chats.length === 0 && (
                                    <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
                                        Start a chat to let the agent work with your datasets, models and trainings, or
                                        drop files here to start one with them.
                                    </Typography>
                                )}
                            </Box>
                        )}
                    </Box>
                )}
            </AgentDropZone>
        </Drawer>
    );
}
