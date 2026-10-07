// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { ReactNode, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Toolbar from '@mui/material/Toolbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CloseIcon from '@mui/icons-material/Close';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';

import { useAgent } from '../AgentContext';
import { expandToAgentPage } from '../expand';
import { chatTitle, sectionOf } from '../format';
import { isRunning, runSince, runStateOf, runStateText } from '../runState';
import { useSubagentNav } from '../useSubagentNav';
import ChatView from './ChatView';
import { ContextMeter } from './ContextMeter';
import InternetToggle from './InternetToggle';
import NewChatButton, { NewChatError } from './NewChatButton';
import RunStateChip from './RunStateChip';
import AgentDropZone from './AgentDropZone';
import SignInNotice from './SignInNotice';
import { isHovered, isTruncated } from './EllipsisText';
import { GroupToggleButton, SubagentBreadcrumb, SubagentEntryContent } from './SubagentView';
import { agentColors } from './tokens';

export const AGENT_PANEL_WIDTH = 400;
/** Height of the fixed platform footer. */
export const FOOTER_HEIGHT = 30;
/** Values of the chat selector that open a subagent of the open chat. */
const SUB_PREFIX = 'subagent:';

/**
 * The panel's chat row (issue #38): the chat selector takes the remaining room and ellipsizes the title (full title
 * in its tooltip while cut, and in the opened list), then "New chat" as a plus (creates the chat at once) and the open chat's
 * internet switch (the globe). The row never grows past the panel, whatever the title.
 */
function ChatSelector() {
    const { chats, selectedChatId, selectChat } = useAgent();
    const selected = chats.find((c) => c.id === selectedChatId);
    const sub = useSubagentNav();
    const [menuOpen, setMenuOpen] = useState(false);
    const [tipOpen, setTipOpen] = useState(false);
    const selectRef = useRef<HTMLDivElement>(null);
    const chatValue = selectedChatId && chats.some((c) => c.id === selectedChatId) ? selectedChatId : '';
    // a subagent of the open chat is a value of its own (issue #48); its entry is then always listed
    const value = chatValue && sub.selected ? `${SUB_PREFIX}${sub.selected.runId}` : chatValue;
    const items: ReactNode[] = [];
    if (chats.length === 0)
        items.push(
            <MenuItem key="none" value="" disabled>
                No chats yet
            </MenuItem>,
        );
    for (const c of chats.slice(0, 20)) {
        const state = runStateOf(c);
        const withSubs = c.id === sub.chatId && sub.items.length > 0;
        items.push(
            <MenuItem
                key={c.id}
                value={c.id}
                sx={{ fontSize: 13, gap: 1, whiteSpace: 'normal', alignItems: 'flex-start' }}
            >
                <Box component="span" sx={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
                    {chatTitle(c)}
                </Box>
                {runStateText(state, 'list') && (
                    <Box component="span" sx={{ flex: 'none', display: 'inline-flex' }}>
                        <RunStateChip state={state} />
                    </Box>
                )}
                {c.pending_approvals > 0 && state !== 'waiting' && (
                    <Box
                        component="span"
                        sx={{ color: agentColors.amberText, fontSize: 12, flex: 'none', whiteSpace: 'nowrap' }}
                    >
                        · {c.pending_approvals} waiting
                    </Box>
                )}
                {withSubs && <GroupToggleButton open={sub.open} count={sub.items.length} onToggle={sub.toggle} />}
            </MenuItem>,
        );
        if (withSubs && sub.open)
            for (const it of sub.items)
                items.push(
                    <MenuItem
                        key={`${SUB_PREFIX}${it.runId}`}
                        value={`${SUB_PREFIX}${it.runId}`}
                        data-testid="agent-subagent-entry"
                        data-run-id={it.runId}
                        dense
                        sx={{ fontSize: 12.5, pl: 3.5, minHeight: 32 }}
                    >
                        <SubagentEntryContent item={it} />
                    </MenuItem>,
                );
    }
    const onChange = (v: string) => {
        if (v.startsWith(SUB_PREFIX)) sub.select(v.slice(SUB_PREFIX.length));
        else selectChat(v);
    };
    return (
        // minmax(0, 1fr): an auto column would grow to the title's full width and push the buttons out of the panel
        <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1 }}>
            <Box data-testid="agent-chat-picker-row" sx={{ display: 'flex', gap: 1, alignItems: 'center', minWidth: 0 }}>
                <Tooltip
                    // the chat title in full, only when it is cut; with a subagent open the breadcrumb has its own
                    // tooltips, and two at once must not show (issue #52). Hover only: focus alone (the select keeps
                    // it after its menu closes) must not open it, or it stays after a click elsewhere.
                    title={selected && !sub.selected ? chatTitle(selected) : ''}
                    open={tipOpen && !menuOpen && !sub.selected}
                    onOpen={() => {
                        // only while the pointer is on the select itself: hovering the opened menu or its backdrop
                        // bubbles here through the portal and would open it after a click outside
                        const el = selectRef.current;
                        if (
                            !menuOpen &&
                            isHovered(el) &&
                            isTruncated(el?.querySelector<HTMLElement>('.MuiSelect-select'))
                        )
                            setTipOpen(true);
                    }}
                    onClose={() => setTipOpen(false)}
                    disableFocusListener
                    disableInteractive
                    enterDelay={400}
                    enterNextDelay={400}
                >
                    <Select
                        ref={selectRef}
                        size="small"
                        value={value}
                        onChange={(e) => onChange(String(e.target.value))}
                        open={menuOpen}
                        onOpen={() => {
                            setTipOpen(false);
                            setMenuOpen(true);
                        }}
                        onClose={() => {
                            setTipOpen(false);
                            setMenuOpen(false);
                        }}
                        displayEmpty
                        // the state of the selected chat shows in the panel header; a subagent shows as breadcrumb
                        // "← chat › subagent" in the same height
                        renderValue={(id) => {
                            const c = chats.find((x) => x.id === selectedChatId);
                            if (String(id).startsWith(SUB_PREFIX) && c && sub.selected)
                                return (
                                    <SubagentBreadcrumb
                                        chatTitle={chatTitle(c)}
                                        item={sub.selected}
                                        onBack={() => sub.select(undefined)}
                                    />
                                );
                            const chat = chats.find((x) => x.id === id);
                            return chat ? chatTitle(chat) : chats.length ? '' : 'No chats yet';
                        }}
                        sx={{
                            flex: 1,
                            minWidth: 0,
                            bgcolor: '#fff',
                            fontSize: 13,
                            '& .MuiSelect-select': { py: 0.75, minWidth: 0 },
                            ...(sub.selected && {
                                '& .MuiOutlinedInput-notchedOutline': { borderColor: agentColors.subagent },
                            }),
                        }}
                        inputProps={{ 'aria-label': 'Chat' }}
                        // the list opens left-aligned under the selector (MUI centres it), stays inside the panel
                        // (14 px padding on the left, the popover's 16 px window margin on the right) and wraps long
                        // titles in full
                        MenuProps={{
                            anchorOrigin: { vertical: 'bottom', horizontal: 'left' },
                            transformOrigin: { vertical: 'top', horizontal: 'left' },
                            PaperProps: { sx: { maxWidth: AGENT_PANEL_WIDTH - 32 } },
                        }}
                    >
                        {items}
                    </Select>
                </Tooltip>
                <NewChatButton compact />
                {selected && <InternetToggle chat={selected} compact />}
            </Box>
            <NewChatError />
        </Box>
    );
}

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
                    bgcolor: agentColors.panelBg,
                },
            }}
        >
            <Toolbar />
            {/* files dropped anywhere on the panel go to the open chat (AgentDropZone) */}
            <AgentDropZone sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
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
                    {/* only while something happens (issue #35): no chip for a ready chat */}
                    {runStateText(selectedState, 'header') && (
                        <Box data-testid="agent-panel-state" sx={{ flex: '0 1 auto', minWidth: 0, display: 'inline-flex' }}>
                            <RunStateChip state={selectedState} since={runSince(selected)} framed />
                        </Box>
                    )}
                    {selected && (
                        <Box sx={{ ml: 'auto', flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                            <ContextMeter chat={selected} compacting={compacting[selected.id]} />
                            {/* the tokens stay on /ai-agent and under each answer; here the chat moves to the full page */}
                            <Tooltip title="Open in agent page">
                                <IconButton
                                    size="small"
                                    onClick={() =>
                                        expandToAgentPage(selected.id, { selectChat, setPanelOpen, navigate })
                                    }
                                    aria-label="Open in agent page"
                                >
                                    <OpenInFullIcon fontSize="small" />
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
                                header={<ChatSelector />}
                            />
                        ) : (
                            <Box sx={{ p: 1.75, display: 'grid', gap: 1.5 }}>
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
