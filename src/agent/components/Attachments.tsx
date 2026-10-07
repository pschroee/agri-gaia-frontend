// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Files as cards (issue #54, design "Agent Chat Panel v2"): a 40 px square with the thumbnail of an image or a type
// icon (PDF red, image grey, others by kind), the name truncated in the middle so the extension stays visible, "size ·
// type" and a download button. Used inside the input field (staged, removable, with upload progress), above a user
// message (its attachments) and below the answer that handed results over. Cards never grow past their row.

import type { ReactNode } from 'react';

import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import CloseIcon from '@mui/icons-material/Close';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import DownloadIcon from '@mui/icons-material/Download';
import FolderZipOutlinedIcon from '@mui/icons-material/FolderZipOutlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import SlideshowOutlinedIcon from '@mui/icons-material/SlideshowOutlined';
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined';

import { artifactUrl } from '../api';
import { FILE_TYPE_LABEL, fileMeta, fileTypeOf, previewKind, splitFileName, uploadingText } from '../files';
import type { FileType, UploadInFlight } from '../files';
import type { Artifact, ArtifactKind } from '../types';
import ImagePreview from './ImagePreview';
import { agentColors } from './tokens';

/** Width of a card in the transcript (design: 220 px, at most 85 % of the row). */
export const CARD_WIDTH = 220;
/** Width of a staged card inside the input field (design: 168 px; two fit side by side in the panel). */
export const STAGED_CARD_WIDTH = 168;
/** Edge of the thumbnail or type icon box. */
const THUMB = 40;
const CARD_HEIGHT = 52;

const TYPE_ICON: Record<FileType, { icon: typeof InsertDriveFileOutlinedIcon; color: string; bg: string }> = {
    pdf: { icon: PictureAsPdfOutlinedIcon, color: '#d32f2f', bg: '#fdeded' },
    image: { icon: ImageOutlinedIcon, color: 'rgba(0, 0, 0, 0.54)', bg: '#e0e0e0' },
    word: { icon: DescriptionOutlinedIcon, color: '#1565c0', bg: '#e8f0fb' },
    spreadsheet: { icon: TableChartOutlinedIcon, color: '#2e7d32', bg: '#e8f3e9' },
    presentation: { icon: SlideshowOutlinedIcon, color: '#d84315', bg: '#fbece6' },
    text: { icon: ArticleOutlinedIcon, color: '#546e7a', bg: '#eceff1' },
    archive: { icon: FolderZipOutlinedIcon, color: '#795548', bg: '#efebe9' },
    file: { icon: InsertDriveFileOutlinedIcon, color: 'rgba(0, 0, 0, 0.54)', bg: '#eeeeee' },
};

/** Type icon in the square of a card. */
export function FileTypeIcon({ type }: { type: FileType }) {
    const { icon: Icon, color, bg } = TYPE_ICON[type];
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
                borderRadius: '4px',
                bgcolor: bg,
                color,
            }}
        >
            <Icon sx={{ fontSize: 22 }} />
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
            sx={{ display: 'flex', minWidth: 0, maxWidth: '100%', whiteSpace: 'nowrap', fontSize: 13, lineHeight: 1.3 }}
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

/** One card: square, name and "size · type", then a download button or the remove cross, an upload bar at the bottom. */
function Card({
    name,
    meta,
    type,
    thumb,
    href,
    onRemove,
    progress,
    tooltip,
    width,
    maxWidth = '100%',
}: {
    name: string;
    meta: string;
    type: FileType;
    /** Thumbnail of a previewable image (else the type icon). */
    thumb?: ReactNode;
    /** Download address (files in the transcript). */
    href?: string;
    /** Remove cross in the top right corner (staged files). */
    onRemove?: () => void;
    /** Share uploaded so far, while the file is on its way. */
    progress?: number;
    tooltip: string;
    width: number;
    /** Share of the row a card may take at most (85 % in the transcript, as in the design). */
    maxWidth?: string;
}) {
    return (
        <Box
            component="li"
            data-testid="agent-attachment"
            data-type={type}
            data-uploading={progress !== undefined ? 'true' : undefined}
            sx={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                width,
                maxWidth,
                minWidth: 0,
                height: CARD_HEIGHT,
                p: onRemove ? '6px 28px 6px 6px' : '6px 4px 6px 6px',
                border: '1px solid rgba(0, 0, 0, 0.12)',
                borderRadius: '8px',
                bgcolor: '#fff',
                color: 'text.primary',
                boxSizing: 'border-box',
                overflow: 'hidden',
            }}
        >
            {thumb ?? <FileTypeIcon type={type} />}
            <Tooltip
                title={tooltip}
                componentsProps={{ tooltip: { sx: { overflowWrap: 'anywhere' } } }}
                disableInteractive
            >
                <Box
                    component="span"
                    sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}
                >
                    <MiddleName name={name} />
                    <Box
                        component="span"
                        data-testid="agent-file-size"
                        role={progress !== undefined ? 'status' : undefined}
                        sx={{
                            fontSize: 12,
                            lineHeight: 1.3,
                            color: 'text.secondary',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                        }}
                    >
                        {meta}
                    </Box>
                </Box>
            </Tooltip>
            {href && (
                <Tooltip title="Download" disableInteractive>
                    <IconButton
                        component="a"
                        href={href}
                        download={name}
                        aria-label={`Download ${name}`}
                        data-testid="agent-file-download"
                        sx={{ width: 32, height: 32, flex: 'none', color: 'rgba(0, 0, 0, 0.54)' }}
                    >
                        <DownloadIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                </Tooltip>
            )}
            {onRemove && (
                <IconButton
                    aria-label={`Remove attachment ${name}`}
                    title="Remove"
                    onClick={onRemove}
                    sx={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, p: 0 }}
                >
                    <CloseIcon sx={{ fontSize: 16 }} />
                </IconButton>
            )}
            {progress !== undefined && (
                <Box
                    role="progressbar"
                    aria-label={`Uploading ${name}`}
                    aria-valuenow={Math.round(progress * 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    sx={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, bgcolor: '#c5dccf' }}
                >
                    <Box
                        sx={{
                            height: '100%',
                            width: `${Math.round(progress * 100)}%`,
                            bgcolor: agentColors.green,
                            transition: 'width 0.2s linear',
                        }}
                    />
                </Box>
            )}
        </Box>
    );
}

/** Thumbnail of a raster image that enlarges on click; the type icon if it cannot be loaded. */
function Thumb({ src, name }: { src: string; name: string }) {
    return (
        <Box
            sx={{
                width: THUMB,
                height: THUMB,
                flex: 'none',
                position: 'relative',
                zIndex: 1,
                lineHeight: 0,
                borderRadius: '4px',
                overflow: 'hidden',
            }}
        >
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

type CardFile = { name: string; size?: number; content_type?: string };

/** An artifact as a card: thumbnail only for raster images whose content type and extension agree (previewKind). */
function ArtifactCard({
    chatId,
    file,
    kind,
    download,
    onRemove,
    where,
    width,
    maxWidth,
}: {
    chatId?: string;
    file: CardFile;
    kind: ArtifactKind;
    /** Files in the transcript have a download button; staged ones do not. */
    download: boolean;
    onRemove?: () => void;
    /** Second part of the tooltip, e.g. where the file is in the sandbox. */
    where: string;
    width: number;
    maxWidth?: string;
}) {
    const url = chatId ? artifactUrl(chatId, file.name, kind) : undefined;
    const image =
        !!url && !!file.content_type && previewKind({ name: file.name, content_type: file.content_type }) === 'image';
    const meta = fileMeta(file);
    return (
        <Card
            name={file.name}
            meta={meta}
            type={fileTypeOf(file)}
            thumb={image && url ? <Thumb src={url} name={file.name} /> : undefined}
            href={download ? url : undefined}
            onRemove={onRemove}
            tooltip={`${file.name} · ${meta} · ${where}`}
            width={width}
            maxWidth={maxWidth}
        />
    );
}

const listSx = {
    listStyle: 'none',
    m: 0,
    p: 0,
    display: 'flex',
    gap: '6px',
    minWidth: 0,
    maxWidth: '100%',
} as const;

/**
 * Attachments of the message being written, inside the input field above the text: uploaded files removable until
 * sent, files on their way with "Uploading 71%" and a bar at the bottom.
 */
export function StagedAttachments({
    chatId,
    files,
    uploads = [],
    onRemove,
}: {
    chatId?: string;
    files: Artifact[];
    uploads?: UploadInFlight[];
    onRemove: (name: string) => void;
}) {
    if (files.length === 0 && uploads.length === 0) return null;
    return (
        <Box
            component="ul"
            aria-label="Attachments of this message"
            data-testid="agent-staged-attachments"
            // at most three rows of cards; more scroll, so the field and the transcript keep their room
            sx={{ ...listSx, flexWrap: 'wrap', gap: 1, maxHeight: 3 * CARD_HEIGHT + 2 * 8 + 2, overflowY: 'auto', pb: '6px' }}
        >
            {files.map((f) => (
                <ArtifactCard
                    key={f.name}
                    chatId={chatId}
                    file={f}
                    kind="input"
                    download={false}
                    where="goes to /workspace/inputs/"
                    onRemove={() => onRemove(f.name)}
                    width={STAGED_CARD_WIDTH}
                />
            ))}
            {uploads.map((u) => (
                <Card
                    key={u.id}
                    name={u.name}
                    meta={uploadingText(u.progress)}
                    type={fileTypeOf(u)}
                    progress={u.progress}
                    tooltip={`${u.name} · ${uploadingText(u.progress)}`}
                    width={STAGED_CARD_WIDTH}
                />
            ))}
        </Box>
    );
}

/**
 * Attachments of a sent message, directly above its bubble, right-aligned: images with their thumbnail (click
 * enlarges), every card with a download button. known: the chat's artifacts, for type and size; a name the list does
 * not know yet shows by its extension, never with a thumbnail (its content type is unknown).
 */
export function MessageAttachments({ chatId, files, known }: { chatId?: string; files: string[]; known: Artifact[] }) {
    if (files.length === 0) return null;
    return (
        <Box
            component="ul"
            aria-label="Attachments"
            data-testid="agent-message-attachments"
            sx={{ ...listSx, flexDirection: 'column', alignItems: 'flex-end', alignSelf: 'stretch' }}
        >
            {files.map((name) => (
                <ArtifactCard
                    key={name}
                    chatId={chatId}
                    file={known.find((x) => x.kind === 'input' && x.name === name) ?? { name }}
                    kind="input"
                    download
                    where={`/workspace/inputs/${name}`}
                    width={CARD_WIDTH}
                    maxWidth="85%"
                />
            ))}
        </Box>
    );
}

/** Results the agent handed over, below the answer that produced them: the same cards, left-aligned. */
export function ResultAttachments({ chatId, artifacts }: { chatId?: string; artifacts: Artifact[] }) {
    if (artifacts.length === 0 || !chatId) return null;
    return (
        <Box
            component="ul"
            aria-label="Results of the agent"
            data-testid="agent-result-attachments"
            sx={{ ...listSx, flexDirection: 'column', alignItems: 'flex-start', alignSelf: 'stretch' }}
        >
            {artifacts.map((a) => (
                <ArtifactCard
                    key={`${a.kind}/${a.name}`}
                    chatId={chatId}
                    file={a}
                    kind={a.kind}
                    download
                    where="result of the agent"
                    width={CARD_WIDTH}
                    maxWidth="85%"
                />
            ))}
        </Box>
    );
}
