// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { useEffect, useState } from 'react';

import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Toolbar from '@mui/material/Toolbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewOutlinedIcon from '@mui/icons-material/OpenInNewOutlined';

import { agentUrl } from '../../api';

export const AgentPanelWidth = 420;
export const agentEnabled = import.meta.env.VITE_AGENT_ENABLED === 'true';

const STORAGE_KEY = 'agentPanelOpen';

export const loadAgentPanelOpen = (): boolean => {
    try {
        return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
        return false;
    }
};

export const storeAgentPanelOpen = (open: boolean) => {
    try {
        localStorage.setItem(STORAGE_KEY, String(open));
    } catch {
        // storage unavailable, the panel state is then not remembered
    }
};

export default function AgentPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
    // The iframe is mounted on first open and kept afterwards, so the chat keeps its state while hidden.
    const [mounted, setMounted] = useState(open);

    useEffect(() => {
        if (open) setMounted(true);
    }, [open]);

    return (
        <Drawer
            variant="persistent"
            anchor="right"
            open={open}
            sx={{
                // the paper is fixed; PageContainer makes room for it with a right margin on the main content
                [`& .MuiDrawer-paper`]: { width: AgentPanelWidth, boxSizing: 'border-box', pb: '30px' },
            }}
        >
            <Toolbar />
            <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1, borderBottom: 1, borderColor: 'divider' }}>
                <Typography variant="subtitle1" sx={{ flexGrow: 1 }}>
                    AI Agent
                </Typography>
                <Tooltip title="Open in new tab">
                    <IconButton size="small" component="a" href={agentUrl()} target="_blank" rel="noopener noreferrer">
                        <OpenInNewOutlinedIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
                <Tooltip title="Close">
                    <IconButton size="small" onClick={onClose}>
                        <CloseIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
            </Box>
            <Box sx={{ flexGrow: 1, minHeight: 0 }}>
                {mounted && (
                    <iframe
                        src={agentUrl(true)}
                        title="AI Agent"
                        allow="clipboard-write"
                        style={{ border: 0, width: '100%', height: '100%', display: 'block' }}
                    />
                )}
            </Box>
        </Drawer>
    );
}
