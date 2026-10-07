// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Attachments as compact tiles, as in the gateway's own UI: images with a thumbnail (click enlarges), other files
// with a type icon; the name is truncated in the middle so the extension stays visible, the full name is in the
// tooltip. Used above the input field (staged, removable), on a sent user message and below the tool calls that
// handed over results. Tiles wrap and never grow past their row, whatever the name.

import type { ReactNode } from 'react';

import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import CloseIcon from '@mui/icons-material/Close';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import FolderZipOutlinedIcon from '@mui/icons-material/FolderZipOutlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import SlideshowOutlinedIcon from '@mui/icons-material/SlideshowOutlined';
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined';

import { artifactUrl } from '../api';
import { FILE_TYPE_LABEL, fileTypeOf, formatBytes, previewKind, splitFileName } from '../files';
import type { FileType } from '../files';
import type { Artifact, ArtifactKind } from '../types';
import ImagePreview from './ImagePreview';

/** Width of a tile; two fit side by side in the 400 px panel, also in a user message (at most 88 % wide there). */
const TILE_WIDTH = 158;
/** Edge of the thumbnail or type icon box. */
const THUMB = 36;

const TYPE_ICON: Record<FileType, { icon: typeof InsertDriveFileOutlinedIcon; color: string }> = {
    image: { icon: ImageOutlinedIcon, color: '#6a1b9a' },
    pdf: { icon: PictureAsPdfOutlinedIcon, color: '#c62828' },
    word: { icon: DescriptionOutlinedIcon, color: '#1565c0' },
    spreadsheet: { icon: TableChartOutlinedIcon, color: '#2e7d32' },
    presentation: { icon: SlideshowOutlinedIcon, color: '#d84315' },
    text: { icon: ArticleOutlinedIcon, color: '#546e7a' },
    archive: { icon: FolderZipOutlinedIcon, color: '#795548' },
    file: { icon: InsertDriveFileOutlinedIcon, color: '#616161' },
};

/** Type icon in the square of a tile. */
export function FileTypeIcon({ type }: { type: FileType }) {
    const { icon: Icon, color } = TYPE_ICON[type];
    return (
        <Box
            data-testid="agent-file-type"
            data-type={type}
            aria-label={FILE_TYPE_LABEL[type]}
            role="img"
            sx={{
                width: THUMB,
                height: THUMB,
                flex: 'none',
                display: 'grid',
                placeItems: 'center',
                borderRadius: 1,
                bgcolor: `${color}14`,
                color,
            }}
        >
            <Icon sx={{ fontSize: 20 }} />
        </Box>
    );
}

/** A file name truncated in the middle: the head shrinks with an ellipsis, the end of the stem and the extension stay. */
export function MiddleName({ name }: { name: string }) {
    const { head, tail } = splitFileName(name);
    return (
        <Box
            component="span"
            data-testid="agent-file-name"
            sx={{ display: 'flex', minWidth: 0, maxWidth: '100%', whiteSpace: 'nowrap', fontSize: 12, lineHeight: 1.4 }}
        >
            <Box component="span" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {head}
            </Box>
            {tail && (
                <Box component="span" sx={{ flex: 'none', maxWidth: '100%', overflow: 'hidden' }}>
                    {tail}
                </Box>
            )}
        </Box>
    );
}

/** One tile: square (thumbnail or type icon), name and size, an action at the right (remove) if any. */
function Tile({
    name,
    size,
    type,
    thumb,
    href,
    action,
    tooltip,
}: {
    name: string;
    size?: number;
    type: FileType;
    /** Thumbnail of a previewable image (else the type icon). */
    thumb?: ReactNode;
    /** Download address: the whole tile is a link (files in the transcript). */
    href?: string;
    action?: ReactNode;
    tooltip: string;
}) {
    const link = !!href;
    return (
        <Box
            component="li"
            data-testid="agent-attachment"
            data-type={type}
            sx={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                width: TILE_WIDTH,
                maxWidth: '100%',
                minWidth: 0,
                height: THUMB + 10,
                pl: '4px',
                pr: action ? 0.25 : 1,
                border: 1,
                borderColor: 'divider',
                borderRadius: 1.5,
                bgcolor: '#fff',
                color: 'text.primary',
                boxSizing: 'border-box',
                ...(link && { '&:hover': { bgcolor: 'action.hover', borderColor: 'primary.main' } }),
            }}
        >
            {thumb ?? <FileTypeIcon type={type} />}
            <Tooltip title={tooltip} componentsProps={{ tooltip: { sx: { overflowWrap: 'anywhere' } } }}>
                <Box
                    {...(link
                        ? { component: 'a', href, download: name, 'aria-label': `Download ${name}` }
                        : { component: 'span' })}
                    sx={{
                        flex: 1,
                        minWidth: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        color: 'inherit',
                        textDecoration: 'none',
                        // the link covers the whole tile; the thumbnail and the action stay clickable above it
                        ...(link && { '&::after': { content: '""', position: 'absolute', inset: 0 } }),
                    }}
                >
                    <MiddleName name={name} />
                    <Box
                        component="span"
                        data-testid="agent-file-size"
                        sx={{ fontSize: 11, lineHeight: 1.4, color: 'text.secondary', whiteSpace: 'nowrap' }}
                    >
                        {size !== undefined ? formatBytes(size) : FILE_TYPE_LABEL[type]}
                    </Box>
                </Box>
            </Tooltip>
            {action}
        </Box>
    );
}

/** Thumbnail of a raster image that enlarges on click; the type icon if it cannot be loaded. */
function Thumb({ src, name }: { src: string; name: string }) {
    return (
        <Box sx={{ width: THUMB, height: THUMB, flex: 'none', position: 'relative', zIndex: 1, lineHeight: 0 }}>
            <ImagePreview
                src={src}
                alt={name}
                label={name}
                filename={name}
                tile={THUMB}
                fallback={<FileTypeIcon type="image" />}
            />
        </Box>
    );
}

const rowSx = {
    listStyle: 'none',
    m: 0,
    p: 0,
    display: 'flex',
    flexWrap: 'wrap',
    gap: 0.75,
    minWidth: 0,
    maxWidth: '100%',
} as const;

type TileFile = { name: string; size?: number; content_type?: string };

/** An artifact as a tile: thumbnail only for raster images whose content type and extension agree (previewKind). */
function ArtifactTile({
    chatId,
    file,
    kind,
    download,
    action,
    where,
}: {
    chatId?: string;
    file: TileFile;
    kind: ArtifactKind;
    /** Files download on click (in the transcript); staged ones do not. */
    download: boolean;
    action?: ReactNode;
    /** Second part of the tooltip, e.g. where the file is in the sandbox. */
    where: string;
}) {
    const url = chatId ? artifactUrl(chatId, file.name, kind) : undefined;
    const image =
        !!url && !!file.content_type && previewKind({ name: file.name, content_type: file.content_type }) === 'image';
    const size = file.size !== undefined ? ` · ${formatBytes(file.size)}` : '';
    return (
        <Tile
            name={file.name}
            size={file.size}
            type={fileTypeOf(file)}
            thumb={image && url ? <Thumb src={url} name={file.name} /> : undefined}
            href={download && !image ? url : undefined}
            action={action}
            tooltip={`${file.name}${size} · ${where}`}
        />
    );
}

/** Attachments of the message being written, above the field: tiles with name and size, removable until sent. */
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
            // at most three rows of tiles; more scroll, so the field and the transcript keep their room
            sx={{ ...rowSx, maxHeight: 3 * 46 + 2 * 6 + 4, overflowY: 'auto', pt: '2px' }}
        >
            {files.map((f) => (
                <ArtifactTile
                    key={f.name}
                    chatId={chatId}
                    file={f}
                    kind="input"
                    download={false}
                    where="goes to /workspace/inputs/"
                    action={
                        <IconButton
                            size="small"
                            aria-label={`Remove attachment ${f.name}`}
                            onClick={() => onRemove(f.name)}
                            sx={{ p: 0.25, flex: 'none', alignSelf: 'flex-start', mt: '2px' }}
                        >
                            <CloseIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                    }
                />
            ))}
        </Box>
    );
}

/**
 * Attachments on a user bubble, as the staged tiles: images enlarge on click, other files download the input.
 * known: the chat's artifacts, for type and size; a name the list does not know yet shows by its extension, never
 * with a thumbnail (its content type is unknown).
 */
export function MessageAttachments({ chatId, files, known }: { chatId?: string; files: string[]; known: Artifact[] }) {
    if (files.length === 0) return null;
    return (
        <Box
            component="ul"
            aria-label="Attachments"
            data-testid="agent-message-attachments"
            sx={{ ...rowSx, justifyContent: 'flex-end', mt: 0.5 }}
        >
            {files.map((name) => (
                <ArtifactTile
                    key={name}
                    chatId={chatId}
                    file={known.find((x) => x.kind === 'input' && x.name === name) ?? { name }}
                    kind="input"
                    download
                    where={`/workspace/inputs/${name}`}
                />
            ))}
        </Box>
    );
}

/** Results the agent handed over in an answer, below its tool calls: same tiles, images enlarge, files download. */
export function ResultAttachments({ chatId, artifacts }: { chatId?: string; artifacts: Artifact[] }) {
    if (artifacts.length === 0 || !chatId) return null;
    return (
        <Box
            component="ul"
            aria-label="Results of the agent"
            data-testid="agent-result-attachments"
            sx={{ ...rowSx, mb: 1 }}
        >
            {artifacts.map((a) => (
                <ArtifactTile
                    key={`${a.kind}/${a.name}`}
                    chatId={chatId}
                    file={a}
                    kind={a.kind}
                    download
                    where="result of the agent"
                />
            ))}
        </Box>
    );
}
