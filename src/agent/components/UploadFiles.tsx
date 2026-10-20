// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The files of an upload approval (gateway issue #164): the summary first — number, size, folders, file types, the
// annotation file and the hash over the list of every file — and the list of all files collapsed below it. The list
// is fetched when the user opens it and drawn only then, so 2 000 files cost nothing until someone wants to read them.

import { useEffect, useState } from 'react';

import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

import { agentApi } from '../api';
import { formatBytes } from '../files';
import { shortSha } from '../notebook';
import { folderLabel, manifestHash, relativePath, type UploadEntry, type UploadManifest } from '../uploads';
import { MONO } from './tokens';

const CELL = { py: 0.25, px: 0.75, fontSize: 12, borderColor: 'divider' } as const;

/** A SHA-256 in short form; the whole value stands in the tooltip. */
function Sha({ sha, label }: { sha: string; label?: string }) {
    return (
        <Tooltip title={sha} placement="top">
            <Box
                component="span"
                sx={{ fontFamily: MONO, fontSize: 11.5, color: 'text.secondary', whiteSpace: 'nowrap' }}
            >
                {label ? `${label} ` : ''}
                {shortSha(sha)}
            </Box>
        </Tooltip>
    );
}

const fetchEntries = (chatId: string, approvalId: string) =>
    agentApi.approvalUploads(chatId, approvalId).then((r) => r.entries);

type Loaded = { entries: UploadEntry[]; verified?: boolean };

/**
 * `load` fetches the list of every file; the default asks the gateway. A test hands in its own.
 */
export default function UploadFiles({
    data,
    chatId,
    approvalId,
    layout = 'panel',
    load = fetchEntries,
}: {
    data: UploadManifest;
    chatId: string;
    approvalId: string;
    layout?: 'panel' | 'page';
    load?: (chatId: string, approvalId: string) => Promise<UploadEntry[]>;
}) {
    const [open, setOpen] = useState(false);
    const [loaded, setLoaded] = useState<Loaded | undefined>();
    const [error, setError] = useState<string | undefined>();
    const single = data.files === 1;

    useEffect(() => {
        if (!open && !single) return;
        if (loaded || error) return;
        let alive = true;
        load(chatId, approvalId)
            .then(async (entries) => {
                const hash = await manifestHash(entries).catch(() => undefined);
                if (alive)
                    setLoaded({ entries, verified: hash === undefined ? undefined : hash === data.manifest_sha256 });
            })
            .catch((e: unknown) => {
                if (alive) setError(e instanceof Error ? e.message : 'The list could not be loaded');
            });
        return () => {
            alive = false;
        };
    }, [open, single, loaded, error, load, chatId, approvalId, data.manifest_sha256]);

    if (single) {
        // one file: no summary and no list, one line with the path, the size and the hash
        const e = loaded?.entries[0] ?? data.annotation;
        return (
            <Box data-testid="agent-upload-files" sx={{ mt: 0.75, minWidth: 0 }}>
                <Typography sx={{ fontFamily: MONO, fontSize: 12, overflowWrap: 'anywhere' }}>
                    {e?.path ?? `1 file · ${formatBytes(data.bytes)}`}
                </Typography>
                <Typography sx={{ fontSize: 11.5, color: 'text.secondary' }}>
                    {formatBytes(e?.bytes ?? data.bytes)}
                    {e && (
                        <>
                            {' · '}
                            <Sha sha={e.sha256} label="SHA-256" />
                        </>
                    )}
                </Typography>
            </Box>
        );
    }

    return (
        <Box data-testid="agent-upload-files" data-layout={layout} sx={{ mt: 0.75, minWidth: 0 }}>
            <Typography sx={{ fontSize: 12.5, fontWeight: 500 }}>
                {data.files} files · {formatBytes(data.bytes)}
            </Typography>
            <Typography sx={{ fontSize: 11.5, color: 'text.secondary' }}>
                <Sha sha={data.manifest_sha256} label="Manifest SHA-256" />
                {' — covers the path, size and SHA-256 of every file'}
            </Typography>
            {data.folders.length > 0 && (
                <Box data-testid="agent-upload-folders" sx={{ mt: 0.75, maxHeight: 220, overflow: 'auto' }}>
                    <Table size="small" sx={{ tableLayout: 'fixed' }}>
                        <TableHead>
                            <TableRow>
                                <TableCell sx={CELL}>Folder</TableCell>
                                <TableCell sx={{ ...CELL, width: 56 }} align="right">
                                    Files
                                </TableCell>
                                <TableCell sx={{ ...CELL, width: 72 }} align="right">
                                    Size
                                </TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {data.folders.map((f) => (
                                <TableRow key={f.path}>
                                    <TableCell sx={{ ...CELL, fontFamily: MONO, overflowWrap: 'anywhere' }}>
                                        {folderLabel(f.path)}
                                    </TableCell>
                                    <TableCell sx={CELL} align="right">
                                        {f.files}
                                    </TableCell>
                                    <TableCell sx={CELL} align="right">
                                        {formatBytes(f.bytes)}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    {data.root && (
                        <Typography sx={{ fontSize: 11, color: 'text.secondary', mt: 0.25, overflowWrap: 'anywhere' }}>
                            under <span style={{ fontFamily: MONO }}>{data.root}</span>
                        </Typography>
                    )}
                </Box>
            )}
            {data.extensions.length > 0 && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.75 }}>
                    {data.extensions.map((x) => (
                        <Chip key={x.ext} size="small" variant="outlined" label={`${x.ext} ${x.files}`} />
                    ))}
                </Box>
            )}
            {data.annotation && (
                <Typography sx={{ fontSize: 11.5, mt: 0.75, overflowWrap: 'anywhere' }}>
                    Annotation file: <span style={{ fontFamily: MONO }}>{data.annotation.path}</span>
                    {' · '}
                    {formatBytes(data.annotation.bytes)}
                    {' · '}
                    <Sha sha={data.annotation.sha256} label="SHA-256" />
                </Typography>
            )}
            <Accordion
                disableGutters
                elevation={0}
                square
                expanded={open}
                onChange={(_, v) => setOpen(v)}
                TransitionProps={{ unmountOnExit: true }}
                sx={{ mt: 0.75, border: 1, borderColor: 'divider', '&:before': { display: 'none' } }}
            >
                <AccordionSummary
                    expandIcon={<ExpandMoreIcon />}
                    sx={{ minHeight: 36, '& .MuiAccordionSummary-content': { my: 0.5 } }}
                >
                    <Typography sx={{ fontSize: 12.5 }}>Show all {data.files} files</Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ p: 0 }}>
                    {error && (
                        <Typography role="alert" sx={{ fontSize: 12, color: 'error.main', p: 1 }}>
                            {error}
                        </Typography>
                    )}
                    {!error && !loaded && (
                        <Typography sx={{ fontSize: 12, color: 'text.secondary', p: 1 }}>Loading the list…</Typography>
                    )}
                    {loaded && (
                        <>
                            {(loaded.verified === false || loaded.entries.length !== data.files) && (
                                <Typography role="alert" sx={{ fontSize: 12, color: 'error.main', p: 1 }}>
                                    This list does not match the manifest hash above. Do not approve.
                                </Typography>
                            )}
                            <Box data-testid="agent-upload-list" sx={{ maxHeight: 320, overflow: 'auto' }}>
                                {loaded.entries.map((e, i) => (
                                    <Box
                                        key={i}
                                        data-testid="agent-upload-row"
                                        sx={{
                                            display: 'flex',
                                            gap: 1,
                                            alignItems: 'baseline',
                                            px: 1,
                                            py: 0.25,
                                            minWidth: 0,
                                        }}
                                    >
                                        <Typography
                                            sx={{
                                                fontFamily: MONO,
                                                fontSize: 11.5,
                                                flex: 1,
                                                minWidth: 0,
                                                overflowWrap: 'anywhere',
                                            }}
                                        >
                                            {relativePath(data.root, e.path)}
                                        </Typography>
                                        <Typography
                                            sx={{ fontSize: 11.5, color: 'text.secondary', whiteSpace: 'nowrap' }}
                                        >
                                            {formatBytes(e.bytes)}
                                        </Typography>
                                        <Sha sha={e.sha256} />
                                    </Box>
                                ))}
                            </Box>
                        </>
                    )}
                </AccordionDetails>
            </Accordion>
        </Box>
    );
}
