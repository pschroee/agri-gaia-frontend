// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { ReactNode, useCallback, useMemo } from 'react';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';

import { buildTranscript, countEntries, liveParts } from '../transcript';

import { useChatStream } from '../useChatStream';
import { useStickToBottom } from '../useStickToBottom';
import ApprovalCard from './ApprovalCard';
import ChatInput from './ChatInput';
import Conversation from './Conversation';
import DelegationStrip from './DelegationStrip';
import QueueList from './QueueList';

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
 * middle (scrolls), queued messages and the input field at the bottom. The middle follows the end of the
 * transcript while the user is there; after scrolling up, a "Jump to latest" button counts the new entries.
 */
export default function ChatView({ chatId, dense = false, placeholder, header }: Props) {
    const stream = useChatStream(chatId);
    const { messages, approvals, socketCalls, executions, chat, live, thinkingTimes, send } = stream;
    const pending = approvals.filter((a) => a.state === 'pending');
    const items = useMemo(
        () =>
            buildTranscript(messages, { approvals, socketCalls, executions, running: !!chat?.running, thinkingTimes }),
        [messages, approvals, socketCalls, executions, chat?.running, thinkingTimes],
    );
    const liveCount = useMemo(() => {
        const parts = liveParts(live);
        return parts.length ? countEntries([{ kind: 'agent', key: 'live', parts }]) : 0;
    }, [live]);
    const count = countEntries(items) + pending.length + liveCount;
    const { scrollRef, contentRef, stuck, unseen, jumpToLatest } = useStickToBottom(count);
    // After sending, the own message and the answer are what the user wants to see.
    const onSend = useCallback(
        (text: string) => {
            jumpToLatest();
            return send(text);
        },
        [jumpToLatest, send],
    );

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
                {chat && <DelegationStrip chat={chat} socketCalls={stream.socketCalls} />}
            </Box>
            <Box sx={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
                <Box
                    ref={scrollRef}
                    data-testid="agent-transcript"
                    sx={{
                        flex: 1,
                        minHeight: 0,
                        overflowY: 'auto',
                        px: dense ? 1.75 : 0,
                        pr: dense ? 1.75 : 1,
                        pt: 0.5,
                        pb: 1.5,
                    }}
                >
                    <Box ref={contentRef} sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        {stream.error && (
                            <Alert severity="warning" sx={{ fontSize: 12.5 }}>
                                {stream.error}
                            </Alert>
                        )}
                        <Conversation stream={stream} items={items} dense={dense} />
                        <ApprovalCard approvals={pending} onDecide={stream.decide} />
                    </Box>
                </Box>
                {!stuck && (
                    <Button
                        size="small"
                        variant="contained"
                        startIcon={<ArrowDownwardIcon fontSize="small" />}
                        onClick={jumpToLatest}
                        sx={{
                            position: 'absolute',
                            bottom: 12,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            borderRadius: 999,
                            textTransform: 'none',
                            fontSize: 12.5,
                            boxShadow: 3,
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {unseen > 0 ? `Jump to latest · ${unseen} new` : 'Jump to latest'}
                    </Button>
                )}
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
                <QueueList
                    chat={stream.chat}
                    rows={stream.queue}
                    error={stream.queueError}
                    onRemove={stream.unqueue}
                    onSendNow={stream.sendQueueNow}
                />
                <ChatInput
                    onSend={onSend}
                    onAbort={stream.abort}
                    running={stream.chat?.running}
                    placeholder={placeholder}
                />
            </Box>
        </Box>
    );
}
