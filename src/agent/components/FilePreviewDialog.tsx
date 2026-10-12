// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Preview of a file of the chat (issue #74): a click on a file card opens this dialog. Images, PDFs (in an iframe),
// CSV/TSV as a table, text, JSON and Markdown as plain text. Security: HTML and SVG are never rendered, only shown as
// source; text is always inserted as text, never as markup. The gateway decides the kind from the bytes (inline=1).

import { useEffect, useMemo, useState, type ReactNode } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';
import DownloadIcon from '@mui/icons-material/Download';

import { artifactUrl } from '../api';
import { parseDelimited } from '../csv';
import { fileMeta, fileTypeOf } from '../files';
import { inlineUrl, previewOf } from '../filePreview';
import type { ArtifactKind } from '../types';
import { FileTypeIcon } from './Attachments';

/** Longest text read for a preview (bytes); longer files show their beginning. */
const MAX_BYTES = 1024 * 1024;
/** Data rows shown of a table; the first record is the header. */
const MAX_TABLE_ROWS = 500;

/** The file the dialog shows: what the card knows of it, plus its kind in the chat. */
export type PreviewTarget = {
    name: string;
    size?: number;
    content_type?: string;
    preview?: string;
    kind: ArtifactKind;
};

type Loaded =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'error' }
    | { status: 'ready'; text: string; truncated: boolean };

/** Reads at most MAX_BYTES of a file as UTF-8 text. */
async function readText(url: string, signal: AbortSignal): Promise<{ text: string; truncated: boolean }> {
    const res = await fetch(url, { credentials: 'same-origin', signal });
    if (!res.ok || !res.body) throw new Error(`preview ${res.status}`);
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    let truncated = false;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const room = MAX_BYTES - size;
        if (value.length > room) {
            chunks.push(value.subarray(0, room));
            size += room;
            truncated = true;
            await reader.cancel();
            break;
        }
        chunks.push(value);
        size += value.length;
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const c of chunks) {
        bytes.set(c, offset);
        offset += c.length;
    }
    return { text: new TextDecoder('utf-8').decode(bytes), truncated };
}

/** Text of the file for the preview; idle while disabled, loading until the result for this URL arrives. */
function useLoadedText(url: string, enabled: boolean): Loaded {
    const [state, setState] = useState<{ url: string; result: Loaded } | null>(null);
    useEffect(() => {
        if (!enabled) return;
        const ctrl = new AbortController();
        readText(url, ctrl.signal).then(
            (r) => setState({ url, result: { status: 'ready', ...r } }),
            () => {
                if (!ctrl.signal.aborted) setState({ url, result: { status: 'error' } });
            },
        );
        return () => ctrl.abort();
    }, [url, enabled]);
    if (!enabled) return { status: 'idle' };
    return state && state.url === url ? state.result : { status: 'loading' };
}

const captionSx = { color: 'text.secondary', fontSize: 13, mt: 1 } as const;

function Notice({ children }: { children: ReactNode }) {
    return (
        <Typography role="status" sx={{ color: 'text.secondary', py: 3, textAlign: 'center' }}>
            {children}
        </Typography>
    );
}

function ImageBody({ src, name }: { src: string; name: string }) {
    const [broken, setBroken] = useState(false);
    if (broken) return <Notice>Could not load the preview.</Notice>;
    return (
        <Box
            component="img"
            src={src}
            alt={name}
            onError={() => setBroken(true)}
            sx={{ display: 'block', mx: 'auto', maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain' }}
        />
    );
}

function PdfBody({ src, name }: { src: string; name: string }) {
    return (
        <>
            <Box
                component="iframe"
                title={name}
                src={src}
                sx={{ display: 'block', width: '100%', height: '80vh', border: 0 }}
            />
            <Typography sx={captionSx}>If the PDF does not show, use Download.</Typography>
        </>
    );
}

function TableBodyView({ src, name }: { src: string; name: string }) {
    const sep = /\.tsv$/i.test(name) ? '\t' : ',';
    const loaded = useLoadedText(src, true);
    const parsed = useMemo(
        () => (loaded.status === 'ready' ? parseDelimited(loaded.text, sep, MAX_TABLE_ROWS + 1) : null),
        [loaded, sep],
    );
    if (loaded.status === 'loading' || loaded.status === 'idle') return <CircularProgress aria-label="Loading" sx={{ display: 'block', mx: 'auto', my: 3 }} />;
    if (loaded.status === 'error' || !parsed) return <Notice>Could not load the preview.</Notice>;
    const [header = [], ...data] = parsed.rows;
    const columns = Math.max(header.length, ...data.map((r) => r.length));
    const dataTotal = Math.max(parsed.total - 1, 0);
    return (
        <>
            <TableContainer sx={{ maxHeight: '70vh' }}>
                <Table size="small" stickyHeader aria-label={`Table ${name}`}>
                    <TableHead>
                        <TableRow>
                            {Array.from({ length: columns }, (_, i) => (
                                <TableCell key={i} sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                                    {header[i] ?? ''}
                                </TableCell>
                            ))}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {data.map((row, r) => (
                            <TableRow key={r} hover>
                                {Array.from({ length: columns }, (_, i) => (
                                    <TableCell key={i} sx={{ whiteSpace: 'nowrap' }}>
                                        {row[i] ?? ''}
                                    </TableCell>
                                ))}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
            {(dataTotal > data.length || loaded.truncated) && (
                <Typography sx={captionSx}>
                    {dataTotal > data.length
                        ? `Showing ${data.length} of ${dataTotal} rows.`
                        : 'Showing the beginning of the file.'}
                    {loaded.truncated && dataTotal > data.length ? ' Only the first 1 MB was read.' : ''}
                </Typography>
            )}
        </>
    );
}

/** JSON is indented; if it does not parse (or is cut off), the text stays as it is. */
function prettyText(name: string, text: string): string {
    if (!/\.json$/i.test(name)) return text;
    try {
        return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
        return text;
    }
}

function TextBodyView({ src, name }: { src: string; name: string }) {
    const loaded = useLoadedText(src, true);
    if (loaded.status === 'loading' || loaded.status === 'idle') return <CircularProgress aria-label="Loading" sx={{ display: 'block', mx: 'auto', my: 3 }} />;
    if (loaded.status === 'error') return <Notice>Could not load the preview.</Notice>;
    return (
        <>
            {/* Text as text: React escapes it; nothing here is rendered as markup. */}
            <Box
                component="pre"
                data-testid="agent-file-preview-text"
                sx={{
                    m: 0,
                    p: 2,
                    maxHeight: '70vh',
                    overflow: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontFamily: 'monospace',
                    fontSize: 13,
                    bgcolor: 'action.hover',
                    borderRadius: 1,
                }}
            >
                {prettyText(name, loaded.text)}
            </Box>
            {loaded.truncated && <Typography sx={captionSx}>Only the first 1 MB is shown.</Typography>}
        </>
    );
}

/** The dialog for one file; closes with Escape, the cross or a click outside. */
export default function FilePreviewDialog({
    chatId,
    target,
    onClose,
}: {
    chatId: string;
    target: PreviewTarget | null;
    onClose: () => void;
}) {
    const theme = useTheme();
    const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
    const titleId = 'agent-file-preview-title';
    const kind = target ? previewOf(target) : 'none';
    const src = target ? inlineUrl(chatId, target.name, target.kind) : '';
    return (
        <Dialog
            open={target !== null}
            onClose={onClose}
            maxWidth="lg"
            fullWidth
            fullScreen={fullScreen}
            aria-labelledby={titleId}
            data-testid="agent-file-preview"
        >
            {target && (
                <>
                    <DialogTitle id={titleId} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pr: 1 }}>
                        <FileTypeIcon type={fileTypeOf(target)} />
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography noWrap sx={{ fontWeight: 600, fontSize: 16 }} title={target.name}>
                                {target.name}
                            </Typography>
                            <Typography noWrap sx={{ fontSize: 12, color: 'text.secondary' }}>
                                {fileMeta(target)}
                            </Typography>
                        </Box>
                        <Button
                            component="a"
                            href={artifactUrl(chatId, target.name, target.kind)}
                            download={target.name}
                            variant="contained"
                            startIcon={<DownloadIcon />}
                            data-testid="agent-file-preview-download"
                            sx={{ flex: 'none', textTransform: 'none' }}
                        >
                            Download
                        </Button>
                        <IconButton
                            aria-label="Close"
                            onClick={onClose}
                            data-testid="agent-file-preview-close"
                            sx={{ flex: 'none' }}
                        >
                            <CloseIcon />
                        </IconButton>
                    </DialogTitle>
                    <DialogContent dividers>
                        <Box
                            data-testid="agent-file-preview-body"
                            data-preview={kind}
                            key={`${target.kind}/${target.name}`}
                        >
                            {kind === 'image' && <ImageBody src={src} name={target.name} />}
                            {kind === 'pdf' && <PdfBody src={src} name={target.name} />}
                            {kind === 'table' && <TableBodyView src={src} name={target.name} />}
                            {kind === 'text' && <TextBodyView src={src} name={target.name} />}
                            {kind === 'none' && <Notice>No preview for this type.</Notice>}
                        </Box>
                    </DialogContent>
                </>
            )}
        </Dialog>
    );
}
