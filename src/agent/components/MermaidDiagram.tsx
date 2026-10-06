// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { useEffect, useMemo, useState } from 'react';

import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import CloseIcon from '@mui/icons-material/Close';
import CodeIcon from '@mui/icons-material/Code';
import DownloadIcon from '@mui/icons-material/Download';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

import { autoRender, diagramView, isLargeDiagram, mermaidErrorNote, mermaidRenderer, svgDataUrl } from '../mermaid';
import type { MermaidOutcome } from '../mermaid';
import { agentColors, codeBlockSx } from './tokens';

type Props = {
    code: string;
    /** The block is complete (closed, or the answer no longer streams); nothing is rendered before that. */
    ready: boolean;
    /** Position in the message (from 0); from MERMAID_AUTO_MAX on, rendering waits for a click. */
    index?: number;
    /** Bottom margin like the other Markdown blocks. */
    gap?: number;
};

/** Natural width of the sanitized SVG (mermaidLoad sets it from the viewBox). */
function svgWidth(svg: string): number | undefined {
    const w = /<svg[^>]*\swidth="(\d+(?:\.\d+)?)"/.exec(svg)?.[1];
    return w ? Number(w) : undefined;
}

const actionSx = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 0.5,
    borderRadius: 0.5,
    px: 0.5,
    fontSize: 11.5,
    color: 'text.secondary',
    '&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
    '&:focus-visible': { outline: 2, outlineColor: 'primary.main' },
} as const;

/**
 * A Mermaid code block of an answer as a diagram. The library loads only with the first diagram (mermaid.ts); the
 * sanitized SVG is shown as an <img>, so without scripts and without fetching. In the narrow panel it fits the width;
 * a click opens it larger in a dialog, and a toggle shows the code.
 */
export default function MermaidDiagram({ code, ready, index = 0, gap = 1 }: Props) {
    const [result, setResult] = useState<{ code: string; outcome: MermaidOutcome }>();
    const [showSource, setShowSource] = useState(false);
    const [clicked, setClicked] = useState(false);
    const [open, setOpen] = useState(false);
    const large = useMemo(() => isLargeDiagram(code), [code]);
    const deferred = !clicked && !autoRender({ index, large });

    useEffect(() => {
        if (!ready || deferred) return undefined;
        let alive = true;
        void mermaidRenderer.render(code).then((outcome) => {
            if (alive) setResult({ code, outcome });
        });
        return () => {
            alive = false;
        };
    }, [ready, deferred, code]);

    const outcome = result?.code === code ? result.outcome : undefined;
    const view = diagramView({ ready, outcome, showSource, deferred });
    const svg = outcome?.ok ? outcome.svg : undefined;
    const url = useMemo(() => (svg ? svgDataUrl(svg) : undefined), [svg]);
    const width = useMemo(() => (svg ? svgWidth(svg) : undefined), [svg]);

    return (
        <Box data-testid="agent-mermaid" data-view={view} sx={{ mb: gap, minWidth: 0 }}>
            {view === 'diagram' && url ? (
                <ButtonBase
                    data-testid="agent-mermaid-image"
                    onClick={() => setOpen(true)}
                    title="Mermaid diagram – click to enlarge"
                    aria-label="Enlarge Mermaid diagram"
                    sx={{
                        display: 'flex',
                        justifyContent: 'center',
                        width: '100%',
                        border: 1,
                        borderColor: 'divider',
                        borderRadius: 1,
                        bgcolor: '#fff',
                        p: 1,
                        cursor: 'zoom-in',
                        '&:focus-visible': { outline: 2, outlineColor: 'primary.main' },
                    }}
                >
                    <Box
                        component="img"
                        src={url}
                        alt="Mermaid diagram"
                        sx={{ display: 'block', maxWidth: '100%', maxHeight: 520, objectFit: 'contain' }}
                    />
                </ButtonBase>
            ) : (
                <Box component="pre" data-testid="agent-mermaid-source" sx={{ ...codeBlockSx, maxHeight: 384 }}>
                    {code}
                </Box>
            )}
            <Box
                sx={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    columnGap: 1,
                    rowGap: 0.25,
                    mt: 0.5,
                    minWidth: 0,
                    fontSize: 11.5,
                    color: 'text.secondary',
                }}
            >
                {view === 'deferred' && (
                    <ButtonBase
                        data-testid="agent-mermaid-deferred"
                        onClick={() => setClicked(true)}
                        title="Rendering large or many diagrams stalls the browser, so only on click."
                        sx={actionSx}
                    >
                        <AccountTreeOutlinedIcon sx={{ fontSize: 14 }} />
                        {large ? 'Large diagram, click to render' : 'Another diagram, click to render'}
                    </ButtonBase>
                )}
                {view === 'loading' && (
                    <Box
                        component="span"
                        data-testid="agent-mermaid-loading"
                        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
                    >
                        <CircularProgress size={10} thickness={6} /> Rendering diagram …
                    </Box>
                )}
                {view === 'error' && outcome && !outcome.ok && (
                    <Box
                        component="span"
                        data-testid="agent-mermaid-error"
                        title={outcome.error}
                        sx={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 0.5,
                            minWidth: 0,
                            color: agentColors.amberText,
                        }}
                    >
                        <WarningAmberIcon sx={{ fontSize: 14, flex: 'none' }} />
                        <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {mermaidErrorNote(outcome.error)}
                        </Box>
                    </Box>
                )}
                {outcome?.ok && (
                    <ButtonBase
                        data-testid="agent-mermaid-toggle"
                        onClick={() => setShowSource((v) => !v)}
                        aria-pressed={showSource}
                        sx={actionSx}
                    >
                        {showSource ? (
                            <AccountTreeOutlinedIcon sx={{ fontSize: 14 }} />
                        ) : (
                            <CodeIcon sx={{ fontSize: 14 }} />
                        )}
                        {showSource ? 'Diagram' : 'Code'}
                    </ButtonBase>
                )}
                {view === 'diagram' && (
                    <ButtonBase data-testid="agent-mermaid-enlarge" onClick={() => setOpen(true)} sx={actionSx}>
                        <OpenInFullIcon sx={{ fontSize: 13 }} />
                        Enlarge
                    </ButtonBase>
                )}
            </Box>
            {url && (
                <Dialog
                    open={open}
                    onClose={() => setOpen(false)}
                    maxWidth={false}
                    PaperProps={{ sx: { m: 2, maxWidth: 'calc(100vw - 32px)' }, 'aria-label': 'Mermaid diagram' } as object}
                >
                    <Box data-testid="agent-mermaid-dialog" sx={{ p: 1.5, display: 'grid', gap: 1, justifyItems: 'center' }}>
                        <Box
                            component="img"
                            src={url}
                            alt="Mermaid diagram"
                            sx={{
                                display: 'block',
                                // twice the natural size at most, bounded by the window
                                width: width ? `min(${Math.round(width * 2)}px, calc(100vw - 88px))` : 'auto',
                                maxWidth: '100%',
                                maxHeight: 'calc(100vh - 140px)',
                                objectFit: 'contain',
                            }}
                        />
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%', minWidth: 0 }}>
                            <Typography noWrap sx={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 500 }}>
                                Mermaid diagram
                            </Typography>
                            <Link
                                href={url}
                                download="diagram.svg"
                                underline="hover"
                                sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: 13, flex: 'none' }}
                            >
                                <DownloadIcon sx={{ fontSize: 16 }} />
                                SVG
                            </Link>
                            <IconButton size="small" aria-label="Close diagram" onClick={() => setOpen(false)}>
                                <CloseIcon fontSize="small" />
                            </IconButton>
                        </Box>
                    </Box>
                </Dialog>
            )}
        </Box>
    );
}
