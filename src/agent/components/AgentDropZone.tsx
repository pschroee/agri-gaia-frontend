// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';
import UploadFileIcon from '@mui/icons-material/UploadFile';

import { useAgentOptional } from '../AgentContext';
import { useFileDrop } from '../useFileDrop';
import { agentColors } from './tokens';

type Target = (files: File[]) => void;

/** Lets the chat input of the open chat take the files dropped anywhere on the surrounding agent area. */
const DropTargetContext = createContext<((target: Target | undefined) => void) | undefined>(undefined);

/**
 * Registers `upload` as the target of the surrounding AgentDropZone (undefined: none right now). Returns
 * whether there is a zone; without one the caller keeps its own drop target.
 */
export function useAgentDropTarget(upload: Target | undefined): boolean {
    const register = useContext(DropTargetContext);
    const latest = useRef(upload);
    latest.current = upload;
    const enabled = !!upload;
    useEffect(() => {
        if (!register || !enabled) return;
        register((files) => latest.current?.(files));
        return () => register(undefined);
    }, [register, enabled]);
    return !!register;
}

/**
 * Drop area over the whole agent area (context panel, chat area of /ai-agent): files dragged anywhere onto it
 * show an overlay "Drop files to upload" and go to the open chat's input, which uploads them like the paperclip
 * (staged as attachments of the next message). Without an open chat, dropped files start a new chat (issue #30),
 * whose input takes them the same way.
 */
export default function AgentDropZone({ children, sx }: { children: ReactNode; sx?: SxProps<Theme> }) {
    const [target, setTarget] = useState<{ fn: Target }>();
    const register = useCallback((fn: Target | undefined) => setTarget(fn ? { fn } : undefined), []);
    const agent = useAgentOptional();
    const startNewChat = agent?.startNewChat;
    const startWith = useMemo<Target | undefined>(
        () => (agent?.status === 'ready' && startNewChat ? (files) => void startNewChat(files) : undefined),
        [agent?.status, startNewChat],
    );
    const { active, handlers } = useFileDrop(target?.fn ?? startWith);
    const value = useMemo(() => register, [register]);
    return (
        <DropTargetContext.Provider value={value}>
            <Box data-testid="agent-drop-area" {...handlers} sx={[{ position: 'relative' }, ...(Array.isArray(sx) ? sx : [sx])]}>
                {children}
                {active && (
                    <Box
                        data-testid="agent-drop-overlay"
                        aria-hidden
                        sx={{
                            position: 'absolute',
                            inset: 6,
                            zIndex: 10,
                            pointerEvents: 'none',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 1,
                            border: `2px dashed ${agentColors.green}`,
                            borderRadius: 2,
                            bgcolor: 'rgba(238, 243, 240, 0.94)',
                            color: agentColors.green,
                            fontSize: 15,
                            fontWeight: 500,
                        }}
                    >
                        <UploadFileIcon sx={{ fontSize: 36 }} />
                        Drop files to upload
                        <Box component="span" sx={{ fontSize: 12.5, fontWeight: 400, color: 'text.secondary' }}>
                            {target ? 'They are attached to your next message' : 'A new chat starts with them'}
                        </Box>
                    </Box>
                )}
            </Box>
        </DropTargetContext.Provider>
    );
}
