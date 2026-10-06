// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { useState } from 'react';

import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Dialog from '@mui/material/Dialog';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
import DownloadIcon from '@mui/icons-material/Download';
import HideImageOutlinedIcon from '@mui/icons-material/HideImageOutlined';

type Props = {
    /** Only addresses the UI may load: the gateway's image or artifact endpoint, or a data: raster image (images.ts). */
    src: string;
    alt?: string;
    /** Path or file name: tooltip, caption of the large view and hint when loading fails. */
    label?: string;
    /** File name for "Download". */
    filename?: string;
    /** Maximum height of the thumbnail in px. */
    maxHeight?: number;
    /** Square tile of this size instead of a free thumbnail (attachments). */
    tile?: number;
};

/** Muted inline note in place of an image (not loaded, not available, not yet available). */
export function ImageNote({ text, title }: { text: string; title?: string }) {
    return (
        <Box
            component="span"
            data-testid="agent-image-note"
            title={title}
            sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.5,
                maxWidth: '100%',
                verticalAlign: 'middle',
                border: 1,
                borderColor: 'divider',
                borderRadius: 0.5,
                bgcolor: 'action.hover',
                color: 'text.secondary',
                fontSize: 12,
                px: 0.75,
                py: '1px',
            }}
        >
            <HideImageOutlinedIcon sx={{ fontSize: 14, flex: 'none' }} />
            <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {text}
            </Box>
        </Box>
    );
}

/** An image as a thumbnail; a click opens the large view with the name and a download link. */
export default function ImagePreview({ src, alt, label, filename, maxHeight = 240, tile }: Props) {
    const [open, setOpen] = useState(false);
    const [failed, setFailed] = useState(false);
    if (failed) return <ImageNote text={`Image not available${label ? ` · ${label}` : ''}`} title={label} />;
    const name = filename ?? label?.split('/').pop() ?? 'image';
    const title = alt || name;
    return (
        <>
            <ButtonBase
                data-testid="agent-image"
                onClick={() => setOpen(true)}
                title={`${label ?? title} – click to enlarge`}
                aria-label={`Enlarge image ${title}`}
                sx={{
                    display: 'inline-block',
                    maxWidth: '100%',
                    verticalAlign: 'top',
                    borderRadius: 1,
                    my: tile ? 0 : 0.5,
                    cursor: 'zoom-in',
                    '&:focus-visible': { outline: 2, outlineColor: 'primary.main' },
                }}
            >
                <Box
                    component="img"
                    src={src}
                    alt={alt ?? ''}
                    loading="lazy"
                    onError={() => setFailed(true)}
                    sx={{
                        display: 'block',
                        maxWidth: '100%',
                        border: 1,
                        borderColor: 'divider',
                        borderRadius: 1,
                        bgcolor: '#fff',
                        ...(tile
                            ? { width: tile, height: tile, objectFit: 'cover' }
                            : { maxHeight, objectFit: 'contain' }),
                    }}
                />
            </ButtonBase>
            <Dialog
                open={open}
                onClose={() => setOpen(false)}
                maxWidth={false}
                PaperProps={{ sx: { m: 2, maxWidth: 'calc(100vw - 32px)' }, 'aria-label': title } as object}
            >
                <Box data-testid="agent-image-dialog" sx={{ p: 1.5, display: 'grid', gap: 1, justifyItems: 'center' }}>
                    <Box
                        component="img"
                        src={src}
                        alt={alt ?? ''}
                        sx={{ display: 'block', maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain' }}
                    />
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%', minWidth: 0 }}>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 500 }}>
                                {title}
                            </Typography>
                            {label && label !== title && (
                                <Typography noWrap sx={{ fontSize: 12, color: 'text.secondary' }}>
                                    {label}
                                </Typography>
                            )}
                        </Box>
                        <Link
                            href={src}
                            download={name}
                            underline="hover"
                            sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: 13, flex: 'none' }}
                        >
                            <DownloadIcon sx={{ fontSize: 16 }} />
                            Download
                        </Link>
                        <IconButton size="small" aria-label="Close image" onClick={() => setOpen(false)}>
                            <CloseIcon fontSize="small" />
                        </IconButton>
                    </Box>
                </Box>
            </Dialog>
        </>
    );
}
