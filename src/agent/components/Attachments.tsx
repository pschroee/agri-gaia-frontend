// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';

import { artifactUrl } from '../api';
import { formatBytes, previewKind } from '../files';
import type { Artifact } from '../types';
import ImagePreview from './ImagePreview';

const chipSx = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 0.5,
    maxWidth: '100%',
    minWidth: 0,
    border: 1,
    borderRadius: 1,
    px: 0.75,
    py: '2px',
    fontSize: 12,
    lineHeight: 1.5,
} as const;

/** Attachments of the message being written, above the field: name and size, removable until sent. */
export function StagedAttachments({
    chatId,
    files,
    onRemove,
}: {
    chatId?: string;
    files: Artifact[];
    onRemove: (name: string) => void;
}) {
    if (files.length === 0) return null;
    return (
        <Box
            component="ul"
            aria-label="Attachments of this message"
            data-testid="agent-staged-attachments"
            sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexWrap: 'wrap', gap: 0.75 }}
        >
            {files.map((f) => (
                <Box
                    component="li"
                    key={f.name}
                    sx={{ ...chipSx, borderColor: 'divider', bgcolor: '#fff', pr: 0.25 }}
                    title={`${f.name} · ${formatBytes(f.size)} · goes to /workspace/inputs/`}
                >
                    {chatId && previewKind(f) === 'image' ? (
                        <Box
                            component="img"
                            src={artifactUrl(chatId, f.name, 'input')}
                            alt=""
                            sx={{ width: 20, height: 20, objectFit: 'cover', borderRadius: 0.5, flex: 'none' }}
                        />
                    ) : (
                        <InsertDriveFileOutlinedIcon sx={{ fontSize: 15, color: 'text.secondary', flex: 'none' }} />
                    )}
                    <Box
                        component="span"
                        sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                        {f.name}
                    </Box>
                    <Box component="span" sx={{ color: 'text.secondary', flex: 'none' }}>
                        {formatBytes(f.size)}
                    </Box>
                    <IconButton
                        size="small"
                        aria-label={`Remove attachment ${f.name}`}
                        onClick={() => onRemove(f.name)}
                        sx={{ p: 0.25 }}
                    >
                        <CloseIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                </Box>
            ))}
        </Box>
    );
}

/**
 * Attachments on a user bubble: images as small tiles (click enlarges), other files as chips that download the
 * input. known: the chat's artifacts, for the type; a name the list does not know yet shows as a plain chip.
 */
export function MessageAttachments({
    chatId,
    files,
    known,
}: {
    chatId?: string;
    files: string[];
    known: Artifact[];
}) {
    if (files.length === 0) return null;
    return (
        <Box
            data-testid="agent-message-attachments"
            sx={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 0.75,
                justifyContent: 'flex-end',
                alignItems: 'flex-start',
                mt: 0.5,
            }}
        >
            {files.map((name) => {
                const a = known.find((x) => x.kind === 'input' && x.name === name);
                const url = chatId ? artifactUrl(chatId, name, 'input') : undefined;
                if (url && a && previewKind(a) === 'image') {
                    return <ImagePreview key={name} src={url} alt={name} label={name} filename={name} tile={64} />;
                }
                const content = (
                    <>
                        <InsertDriveFileOutlinedIcon sx={{ fontSize: 15, flex: 'none' }} />
                        <Box
                            component="span"
                            sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                            {name}
                        </Box>
                        {a && (
                            <Box component="span" sx={{ opacity: 0.8, flex: 'none' }}>
                                {formatBytes(a.size)}
                            </Box>
                        )}
                    </>
                );
                const sx = {
                    ...chipSx,
                    borderColor: 'primary.main',
                    color: 'primary.main',
                    bgcolor: '#fff',
                    textDecoration: 'none',
                };
                return url ? (
                    <Box
                        key={name}
                        component="a"
                        href={url}
                        download={name}
                        title={`Download ${name}`}
                        sx={{ ...sx, '&:hover': { bgcolor: 'action.hover' } }}
                    >
                        {content}
                    </Box>
                ) : (
                    <Box key={name} component="span" sx={sx}>
                        {content}
                    </Box>
                );
            })}
        </Box>
    );
}
