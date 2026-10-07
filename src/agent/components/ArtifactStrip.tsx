// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { useState } from 'react';

import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import DownloadIcon from '@mui/icons-material/Download';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';

import { artifactUrl } from '../api';
import { artifactSummary, fileTypeOf, formatBytes, previewKind, splitArtifacts } from '../files';
import { formatClock } from '../format';
import type { Artifact } from '../types';
import { FileTypeIcon, MiddleName } from './Attachments';
import ImagePreview from './ImagePreview';
import { agentColors, blockSx, MONO } from './tokens';

function ArtifactRow({ chatId, artifact: a }: { chatId: string; artifact: Artifact }) {
    const url = artifactUrl(chatId, a.name, a.kind);
    const image = previewKind(a) === 'image';
    return (
        <Box
            component="li"
            data-testid="agent-artifact"
            data-kind={a.kind}
            sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5, minWidth: 0 }}
        >
            {image ? (
                <Box sx={{ width: 36, height: 36, flex: 'none', lineHeight: 0 }}>
                    <ImagePreview
                        src={url}
                        alt={a.name}
                        label={a.name}
                        filename={a.name}
                        tile={36}
                        fallback={<FileTypeIcon type="image" />}
                    />
                </Box>
            ) : (
                <FileTypeIcon type={fileTypeOf(a)} />
            )}
            <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box title={a.name} sx={{ fontFamily: MONO }}>
                    <MiddleName name={a.name} />
                </Box>
                <Typography noWrap sx={{ fontSize: 11, color: 'text.secondary' }}>
                    {formatBytes(a.size)} · {a.content_type.split(';')[0] || 'file'} · {formatClock(a.created_at)}
                </Typography>
            </Box>
            <Tooltip title={`Download ${a.name}`}>
                <IconButton
                    size="small"
                    component="a"
                    href={url}
                    download={a.name}
                    aria-label={`Download ${a.name}`}
                    sx={{ flex: 'none' }}
                >
                    <DownloadIcon sx={{ fontSize: 18 }} />
                </IconButton>
            </Tooltip>
        </Box>
    );
}

function Group({ title, chatId, list }: { title: string; chatId: string; list: Artifact[] }) {
    if (list.length === 0) return null;
    return (
        <Box sx={{ mt: 0.5 }}>
            <Typography
                sx={{ fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: 'text.disabled', mb: 0.25 }}
            >
                {title} ({list.length})
            </Typography>
            <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                {list.map((a) => (
                    <ArtifactRow key={`${a.kind}/${a.name}`} chatId={chatId} artifact={a} />
                ))}
            </Box>
        </Box>
    );
}

/**
 * Files of the chat as a strip on top of the chat: collapsed one line with the counts, opened the agent's results
 * and the user's uploads, each with download (images as thumbnails that enlarge). Opening loads the list again.
 */
export default function ArtifactStrip({
    chatId,
    artifacts,
    onOpen,
}: {
    chatId: string;
    artifacts: Artifact[];
    /** The strip was opened (to load the list again). */
    onOpen?: () => void;
}) {
    const [open, setOpen] = useState(false);
    if (artifacts.length === 0) return null;
    const { outputs, inputs } = splitArtifacts(artifacts);
    const toggle = () => {
        if (!open) onOpen?.();
        setOpen(!open);
    };
    return (
        <Box data-testid="agent-artifacts" sx={{ ...blockSx, overflow: 'hidden' }}>
            <ButtonBase
                onClick={toggle}
                aria-expanded={open}
                sx={{
                    display: 'flex',
                    width: '100%',
                    justifyContent: 'flex-start',
                    alignItems: 'center',
                    gap: 1,
                    px: 1.5,
                    py: 0.9,
                    textAlign: 'left',
                }}
            >
                <FolderOutlinedIcon sx={{ fontSize: 16, color: agentColors.green }} />
                <Typography sx={{ fontSize: 13, fontWeight: 500, flex: 'none' }}>Files</Typography>
                <Typography noWrap sx={{ fontSize: 12.5, color: 'text.secondary', minWidth: 0 }}>
                    {artifactSummary(artifacts)}
                </Typography>
                <ExpandMoreIcon
                    sx={{
                        ml: 'auto',
                        fontSize: 18,
                        color: 'text.secondary',
                        transform: open ? 'rotate(180deg)' : 'none',
                        transition: 'transform 150ms',
                    }}
                />
            </ButtonBase>
            <Collapse in={open} unmountOnExit>
                <Box sx={{ px: 1.5, pb: 1, maxHeight: 260, overflowY: 'auto' }}>
                    <Group title="Results from the agent" chatId={chatId} list={outputs} />
                    <Group title="Your uploads" chatId={chatId} list={inputs} />
                </Box>
            </Collapse>
        </Box>
    );
}
