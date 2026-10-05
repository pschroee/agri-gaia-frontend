// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { ReactNode } from 'react';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';

import { useChatStream } from '../useChatStream';
import ApprovalCard from './ApprovalCard';
import ChatInput from './ChatInput';
import Conversation from './Conversation';
import DelegationStrip from './DelegationStrip';

type Props = {
    chatId: string;
    /** Narrow layout of the context panel. */
    dense?: boolean;
    placeholder?: string;
    /** Rendered above the delegation strip, outside the scrolling area (e.g. the chat selector). */
    header?: ReactNode;
};

/**
 * One chat: delegation strip with blocked calls on top, the conversation and pending approvals in the
 * middle (scrolls), the input field at the bottom.
 */
export default function ChatView({ chatId, dense = false, placeholder, header }: Props) {
    const stream = useChatStream(chatId);
    const pending = stream.approvals.filter((a) => a.state === 'pending');

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
            <Box
                sx={{
                    flex: 'none',
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr)',
                    gap: 1.25,
                    px: dense ? 1.75 : 0,
                    pt: dense ? 1.5 : 0,
                    pr: dense ? 1.75 : 1,
                    pb: 1.25,
                }}
            >
                {header}
                {stream.chat && <DelegationStrip chat={stream.chat} socketCalls={stream.socketCalls} />}
            </Box>
            <Box
                sx={{
                    flex: 1,
                    minHeight: 0,
                    overflowY: 'auto',
                    px: dense ? 1.75 : 0,
                    pr: dense ? 1.75 : 1,
                    pt: 0.5,
                    pb: 1.5,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1.5,
                }}
            >
                {stream.error && (
                    <Alert severity="warning" sx={{ fontSize: 12.5 }}>
                        {stream.error}
                    </Alert>
                )}
                <Conversation stream={stream} dense={dense} />
                <ApprovalCard approvals={pending} onDecide={stream.decide} />
            </Box>
            <Box
                sx={{
                    flex: 'none',
                    borderTop: 1,
                    borderColor: 'divider',
                    bgcolor: '#fff',
                    px: dense ? 1.75 : 0,
                    pt: dense ? 1.25 : 1.75,
                    pb: dense ? 1.25 : 0,
                }}
            >
                <ChatInput
                    onSend={stream.send}
                    onAbort={stream.abort}
                    running={stream.chat?.running}
                    placeholder={placeholder}
                />
            </Box>
        </Box>
    );
}
