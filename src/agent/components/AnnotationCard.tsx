// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// One card of a pre-annotation run or of a result check (issue #112, design
// `prototyp/entwuerfe/annotation-cards/` and `prototyp/entwuerfe/check-card/`). The design draws one component for
// all of them — same head, same building blocks — so this file lays out the `CardView` that `annotation.ts` and
// `assess.ts` build: it decides nothing about the wording or the figures.
//
// The cards are read-only (the user acts through the agent, and every write needs an approval): the only controls
// are "Show more / Show less", "Show all N" and the tooltips. No card asks CVAT or the platform anything; every
// link opens CVAT and only when the gateway named a CVAT base for it.

import { useId, useState } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Collapse from '@mui/material/Collapse';
import Divider from '@mui/material/Divider';
import LinearProgress from '@mui/material/LinearProgress';
import Link from '@mui/material/Link';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import AutoFixHighOutlinedIcon from '@mui/icons-material/AutoFixHighOutlined';
import CheckIcon from '@mui/icons-material/Check';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloseIcon from '@mui/icons-material/Close';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import HistoryIcon from '@mui/icons-material/History';
import HistoryToggleOffIcon from '@mui/icons-material/HistoryToggleOff';
import ImageSearchOutlinedIcon from '@mui/icons-material/ImageSearchOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PhotoLibraryOutlinedIcon from '@mui/icons-material/PhotoLibraryOutlined';
import QueryStatsOutlinedIcon from '@mui/icons-material/QueryStatsOutlined';
import ScheduleIcon from '@mui/icons-material/Schedule';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import UndoIcon from '@mui/icons-material/Undo';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

import { checkCard } from '../assess';
import type { CardView, Cell, CheckItem, HintIcon, ImageRow, KvRow, Seg, Section, TableSection, VerdictView } from '../assess';
import { cardStateOf, jobCard, midTrunc, runCard } from '../annotation';
import type { AnnotationItem } from '../annotation';
import { useNow } from '../useNow';
import ConfusionMatrix from './ConfusionMatrix';
import { MidEllipsisText } from './EllipsisText';
import EffectChip from './EffectChip';
import { ErrorBlock } from './PlanCard';
import { MONO } from './tokens';

/** A table cell's padding and size, as the design fixes them for every table of the cards. */
const CELL = { py: 0.625, px: 1, fontSize: 12, lineHeight: '18px' } as const;

/** The column widths of a table out of its grid template: `minmax(0,1fr)` is the flexible first column. */
function columnWidths(widths: string): (number | undefined)[] {
    return widths
        .trim()
        .split(/\s+/)
        .map((part) => {
            const m = /^(\d+)px$/.exec(part);
            return m ? Number(m[1]) : undefined;
        });
}

/** One value of a key/value row. */
function KvValue({ row }: { row: KvRow }) {
    return (
        <Typography
            variant="body2"
            sx={{ wordBreak: 'break-word', fontFamily: row.mono ? MONO : undefined, textAlign: 'right' }}
        >
            {row.value}
        </Typography>
    );
}

/** The key/value block of a card (design E17): the label takes at most 45 % of the line. */
function KvBlock({ rows, boldLabels, testId = 'agent-annotation-kv' }: { rows: KvRow[]; boldLabels?: string[]; testId?: string }) {
    return (
        <Box
            data-testid={testId}
            sx={{
                display: 'grid',
                gridTemplateColumns: 'fit-content(45%) minmax(0, 1fr)',
                columnGap: 2,
                rowGap: 0.5,
                alignItems: 'baseline',
            }}
        >
            {rows.map((r) => (
                <Box key={`${r.label}|${r.value}`} sx={{ display: 'contents' }}>
                    <Typography
                        variant="body2"
                        sx={{ color: 'text.secondary', fontWeight: boldLabels?.includes(r.label) ? 500 : undefined }}
                    >
                        {r.label}
                    </Typography>
                    <KvValue row={r} />
                </Box>
            ))}
        </Box>
    );
}

/** One table of a card: the head with `<th scope="col">`, the figures right-aligned in tabular digits. */
function TableBlock({ section }: { section: TableSection }) {
    const widths = columnWidths(section.widths);
    const cellSx = (i: number, c: Cell) => ({
        ...CELL,
        pl: i === 0 ? 0 : undefined,
        pr: i === section.columns.length - 1 ? 0 : undefined,
        width: widths[i],
        textAlign: c.align === 'right' ? ('right' as const) : undefined,
        fontWeight: c.bold ? 500 : undefined,
        fontFamily: c.mono ? MONO : undefined,
        fontStyle: c.italic ? 'italic' : undefined,
        color: c.color,
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap' as const,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    });
    return (
        <Box data-testid="agent-annotation-table">
            {section.title && (
                <Typography variant="caption" sx={{ display: 'block', fontWeight: 500, color: 'text.secondary' }}>
                    {section.title}
                </Typography>
            )}
            <Table size="small" sx={{ tableLayout: 'fixed' }}>
                <TableHead>
                    <TableRow>
                        {section.columns.map((c, i) => (
                            <TableCell key={`${c.text || 'col'}-${i}`} component="th" scope="col" sx={cellSx(i, c)}>
                                {c.text}
                            </TableCell>
                        ))}
                    </TableRow>
                </TableHead>
                <TableBody>
                    {section.rows.map((row, ri) => (
                        <TableRow key={ri}>
                            {row.map((c, i) => (
                                <TableCell key={i} sx={cellSx(i, c)}>
                                    {c.text}
                                </TableCell>
                            ))}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </Box>
    );
}

/** The image rows of a check; the panel stacks the label and the bar under the file, the page keeps one line. */
function ImageBlock({ section, layout }: { section: Extract<Section, { kind: 'images' }>; layout: 'panel' | 'page' }) {
    const [open, setOpen] = useState(false);
    return (
        <Box data-testid="agent-annotation-images">
            <Typography variant="caption" sx={{ display: 'block', fontWeight: 500, color: 'text.secondary' }}>
                {section.title}
            </Typography>
            {section.rows.slice(0, 5).map((r) => (
                <ImageLine key={r.file} row={r} layout={layout} />
            ))}
            <Collapse in={open} unmountOnExit>
                {section.rows.slice(5).map((r) => (
                    <ImageLine key={r.file} row={r} layout={layout} />
                ))}
            </Collapse>
            {section.more && (
                <Button
                    size="small"
                    variant="text"
                    data-testid="agent-annotation-images-more"
                    aria-expanded={open}
                    onClick={() => setOpen((v) => !v)}
                    sx={{ mt: 0.5, px: 0.5 }}
                >
                    {open ? 'Show less' : section.more}
                </Button>
            )}
        </Box>
    );
}

/** One image: the shortened file name with a tooltip, the top label, the confidence and the CVAT link. */
function ImageLine({ row, layout }: { row: ImageRow; layout: 'panel' | 'page' }) {
    const tail = midTrunc(row.file).tail;
    const warn = row.threshold !== undefined && row.confidence < row.threshold;
    const bar = Number.isFinite(row.confidence) ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 'none' }}>
            <LinearProgress
                variant="determinate"
                value={Math.round(row.confidence * 100)}
                sx={{
                    width: layout === 'page' ? 56 : 48,
                    height: 4,
                    borderRadius: 1,
                    bgcolor: 'grey.300',
                    '& .MuiLinearProgress-bar': { bgcolor: warn ? 'warning.main' : 'primary.main' },
                }}
            />
            <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                {row.confidence.toFixed(2)}
            </Typography>
        </Box>
    ) : null;
    const link = row.url ? (
        <Link
            href={row.url}
            target="_blank"
            rel="noopener noreferrer"
            variant="caption"
            aria-label={`Open frame ${row.file} in CVAT (opens in a new tab)`}
            sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.25,
                flex: 'none',
                whiteSpace: 'nowrap',
                textDecorationColor: 'rgba(15,84,50,0.4)',
            }}
        >
            Open frame
            <OpenInNewIcon sx={{ fontSize: 13 }} />
        </Link>
    ) : null;
    const file = (
        <MidEllipsisText
            testId="agent-annotation-image-file"
            text={row.file}
            tail={tail}
            sx={{ fontFamily: MONO, fontSize: 12, minWidth: 0 }}
        />
    );
    const label = row.label ? (
        <Typography variant="caption" sx={{ fontFamily: MONO, color: 'text.primary', whiteSpace: 'nowrap' }}>
            {row.label}
        </Typography>
    ) : null;
    return (
        <Box
            data-testid="agent-annotation-image"
            sx={{
                py: 0.625,
                borderBottom: 1,
                borderColor: 'divider',
                fontSize: 12,
                minWidth: 0,
                ...(layout === 'page'
                    ? {
                          display: 'grid',
                          gridTemplateColumns: 'minmax(0,1fr) 96px 112px auto',
                          columnGap: 2,
                          alignItems: 'center',
                      }
                    : { display: 'flex', flexDirection: 'column', gap: 0.25 }),
            }}
        >
            {layout === 'page' ? (
                <>
                    <Box sx={{ minWidth: 0 }}>
                        {file}
                        {row.note && (
                            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
                                {row.note}
                            </Typography>
                        )}
                    </Box>
                    {label}
                    {bar ?? <span />}
                    {link}
                </>
            ) : (
                <>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                            {file}
                            {row.note && (
                                <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
                                    {row.note}
                                </Typography>
                            )}
                        </Box>
                        {link}
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
                        {label}
                        {bar}
                    </Box>
                </>
            )}
        </Box>
    );
}

/** The verdict chip: filled, with its word next to the symbol, so that colour is not the only signal. */
function VerdictChip({ view }: { view: VerdictView }) {
    const icon =
        view.icon === 'usable' ? <CheckCircleIcon /> : view.icon === 'questionable' ? <WarningAmberIcon /> : <HelpOutlineIcon />;
    return (
        <Chip
            data-testid="agent-annotation-verdict"
            data-verdict={view.verdict}
            color={view.color === 'default' ? undefined : view.color}
            icon={icon}
            label={view.label}
            sx={{ flex: 'none' }}
        />
    );
}

/** The hint icons of a card (design L8). */
function HintIconOf({ icon }: { icon: HintIcon }) {
    const sx = { fontSize: 16, flex: 'none', color: 'action.active' } as const;
    if (icon === 'history') return <HistoryIcon sx={sx} />;
    if (icon === 'down') return <ArrowDownwardIcon sx={sx} />;
    if (icon === 'undo') return <UndoIcon sx={sx} />;
    if (icon === 'stats') return <QueryStatsOutlinedIcon sx={sx} />;
    if (icon === 'image') return <ImageSearchOutlinedIcon sx={sx} />;
    return <LightbulbOutlinedIcon sx={sx} />;
}

/** The details of a card behind a link (design L12/L17): the plausibility values of a verification. */
function DetailsBlock({ section }: { section: Extract<Section, { kind: 'details' }> }) {
    const [open, setOpen] = useState(false);
    const id = useId();
    return (
        <Box data-testid="agent-annotation-details">
            <Link
                component="button"
                type="button"
                variant="caption"
                data-testid="agent-annotation-details-toggle"
                aria-expanded={open}
                aria-controls={id}
                onClick={() => setOpen((v) => !v)}
                sx={{ textDecorationColor: 'rgba(15,84,50,0.4)' }}
            >
                {open ? 'Hide details' : section.label}
            </Link>
            <Collapse in={open} unmountOnExit>
                <Box id={id} sx={{ mt: 0.5 }}>
                    <KvBlock rows={section.rows} testId="agent-annotation-details-rows" />
                </Box>
            </Collapse>
        </Box>
    );
}

/** One section of a card, in the shape the design fixes for it. `title` names the card for the aria labels. */
function SectionView({ section, layout, title }: { section: Section; layout: 'panel' | 'page'; title: string }) {
    switch (section.kind) {
        case 'verdict':
            return (
                <Stack direction="row" flexWrap="wrap" alignItems="center" columnGap={1.25} rowGap={0.75}>
                    <VerdictChip view={section.view} />
                    {section.header && (
                        <Typography variant="body2" sx={{ flex: '1 1 300px', minWidth: 0 }}>
                            {section.header}
                        </Typography>
                    )}
                </Stack>
            );
        case 'sample':
            return (
                <Box>
                    <Stack direction="row" flexWrap="wrap" alignItems="center" columnGap={1} rowGap={0.25}>
                        {section.icon === 'send' ? (
                            <SendOutlinedIcon sx={{ fontSize: 20, color: 'action.active' }} />
                        ) : (
                            <PhotoLibraryOutlinedIcon sx={{ fontSize: 20, color: 'action.active' }} />
                        )}
                        {section.tip ? (
                            <Tooltip title={section.tip}>
                                <Typography variant="subtitle1" tabIndex={0} sx={{ fontSize: 14, fontWeight: 500 }}>
                                    {section.text}
                                </Typography>
                            </Tooltip>
                        ) : (
                            <Typography variant="subtitle1" sx={{ fontSize: 14, fontWeight: 500 }}>
                                {section.text}
                            </Typography>
                        )}
                        {section.sub && (
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                {section.sub}
                            </Typography>
                        )}
                    </Stack>
                    {section.captions?.map((caption) => (
                        <Typography
                            key={caption}
                            variant="caption"
                            sx={{ display: 'block', color: 'text.secondary', mt: 0.25 }}
                        >
                            {caption}
                        </Typography>
                    ))}
                </Box>
            );
        case 'mode': {
            const line = (
                <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }} tabIndex={section.reason ? 0 : undefined}>
                    {section.icon === 'image' ? (
                        <ImageSearchOutlinedIcon sx={{ fontSize: 16, color: 'action.active' }} />
                    ) : (
                        <QueryStatsOutlinedIcon sx={{ fontSize: 16, color: 'action.active' }} />
                    )}
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        {section.text}
                    </Typography>
                    {section.reason && <InfoOutlinedIcon sx={{ fontSize: 14, color: 'disabled' }} />}
                </Stack>
            );
            return section.reason ? (
                <Tooltip title={section.reason} placement="bottom-start">
                    {line}
                </Tooltip>
            ) : (
                line
            );
        }
        case 'basic':
            return (
                <Box data-testid="agent-annotation-basic">
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        Basic checks
                    </Typography>
                    <List dense disablePadding>
                        {section.items.map((c) => (
                            <ListItem key={c.label} disableGutters disablePadding>
                                <ListItemIcon sx={{ minWidth: 26 }}>
                                    {c.ok ? (
                                        <CheckIcon color="success" fontSize="small" titleAccess="passed" />
                                    ) : (
                                        <CloseIcon color="error" fontSize="small" titleAccess="failed" />
                                    )}
                                </ListItemIcon>
                                <Typography variant="body2">{c.label}</Typography>
                            </ListItem>
                        ))}
                    </List>
                </Box>
            );
        case 'progress':
            return (
                <Box data-testid="agent-annotation-progress">
                    <LinearProgress
                        variant={section.percent === null ? 'indeterminate' : 'determinate'}
                        value={section.percent ?? undefined}
                        aria-label={`${title} progress`}
                        sx={{ borderRadius: 1, height: 4 }}
                    />
                    <Stack direction="row" justifyContent="space-between" columnGap={1} sx={{ mt: 0.5 }}>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            {section.left}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', flex: 'none', fontVariantNumeric: 'tabular-nums' }}>
                            {section.right}
                        </Typography>
                    </Stack>
                </Box>
            );
        case 'steps':
            return (
                <Stack spacing={0.5}>
                    {section.items.map((it) => (
                        <Stack key={it.text} direction="row" alignItems="center" spacing={1} sx={{ fontSize: 12, minWidth: 0 }}>
                            <Box sx={{ width: 16, display: 'flex', justifyContent: 'center', flex: 'none' }}>
                                {it.done ? (
                                    <CheckIcon sx={{ fontSize: 16, color: 'success.main' }} />
                                ) : it.running ? (
                                    <CircularProgress size={14} />
                                ) : null}
                            </Box>
                            <Typography variant="caption" noWrap sx={{ minWidth: 0 }}>
                                {it.text}
                            </Typography>
                            <Box sx={{ flex: 1 }} />
                            {it.right && (
                                <Typography variant="caption" sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                                    {it.right}
                                </Typography>
                            )}
                        </Stack>
                    ))}
                </Stack>
            );
        case 'round':
            return (
                <Stack direction="row" alignItems="center" flexWrap="wrap" columnGap={1.25} rowGap={0.5}>
                    <Typography variant="subtitle2">{section.text}</Typography>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                        {Array.from({ length: section.total }, (_, i) => (
                            <Box
                                key={i}
                                sx={{
                                    width: 6,
                                    height: 6,
                                    borderRadius: '50%',
                                    bgcolor: i < section.done ? 'primary.main' : 'grey.400',
                                }}
                            />
                        ))}
                    </Box>
                </Stack>
            );
        case 'warn':
            return (
                <Stack direction="row" spacing={0.75} alignItems="flex-start">
                    <WarningAmberIcon sx={{ fontSize: 16, color: 'error.main', flex: 'none' }} />
                    <Typography variant="caption">{section.text}</Typography>
                </Stack>
            );
        case 'table':
            return <TableBlock section={section} />;
        case 'confusion':
            return <ConfusionMatrix view={section.view} />;
        case 'kv':
            return <KvBlock rows={section.rows} boldLabels={section.boldLabels} />;
        case 'list':
            return (
                <Box data-testid="agent-annotation-list">
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {section.title}
                    </Typography>
                    <List dense disablePadding sx={{ listStyleType: 'disc', pl: 2.25 }}>
                        {section.items.map((item) => {
                            const id = typeof item === 'string' ? undefined : item.id;
                            const text = typeof item === 'string' ? item : item.text;
                            return (
                                <ListItem key={`${id ?? ''}|${text}`} sx={{ display: 'list-item', p: 0 }}>
                                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                        {id && (
                                            <Box component="code" sx={{ fontFamily: MONO, color: 'text.primary', mr: 0.5 }}>
                                                {id}
                                            </Box>
                                        )}
                                        {text}
                                    </Typography>
                                </ListItem>
                            );
                        })}
                    </List>
                </Box>
            );
        case 'images':
            return <ImageBlock section={section} layout={layout} />;
        case 'details':
            return <DetailsBlock section={section} />;
        case 'note':
            return (
                <Box data-testid="agent-annotation-note">
                    <Divider sx={{ my: 0.5 }} />
                    <Typography variant="caption" sx={{ display: 'block', fontSize: 11, color: 'text.secondary' }}>
                        {section.label}
                    </Typography>
                    <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
                        {section.text}
                    </Typography>
                </Box>
            );
        case 'error':
            return <ErrorBlock text={section.text} />;
        case 'link':
            if (!section.pre && !section.url) return null;
            return (
                <Stack direction="row" flexWrap="wrap" alignItems="center" columnGap={2} rowGap={0.25}>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {section.pre}
                    </Typography>
                    {section.url && (
                        <Link
                            href={section.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            variant="caption"
                            sx={{ display: 'flex', alignItems: 'center', gap: 0.25, textDecorationColor: 'rgba(15,84,50,0.4)' }}
                        >
                            {section.text ?? 'Open in CVAT'}
                            <OpenInNewIcon sx={{ fontSize: 13 }} />
                        </Link>
                    )}
                </Stack>
            );
        case 'hint':
            return (
                <Stack direction="row" spacing={0.75} alignItems="flex-start">
                    <HintIconOf icon={section.icon} />
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {section.text}
                    </Typography>
                </Stack>
            );
        default:
            return null;
    }
}

/** The subtitle of a card: the names in monospace, the rest in the caption's grey, indented under the title. */
function Subtitle({ lines }: { lines: Seg[][] }) {
    return (
        <Box sx={{ pl: '26px', minWidth: 0 }}>
            {lines.map((line, i) => (
                <Typography
                    key={i}
                    variant="caption"
                    data-testid="agent-annotation-subtitle"
                    sx={{ display: 'block', color: 'text.secondary', minWidth: 0 }}
                >
                    {line.map((s, j) =>
                        s.mono ? (
                            <Box
                                key={j}
                                component="code"
                                sx={{ fontFamily: MONO, color: 'text.primary', whiteSpace: 'nowrap' }}
                            >
                                {s.text}
                            </Box>
                        ) : (
                            <span key={j}>{s.text}</span>
                        ),
                    )}
                </Typography>
            ))}
        </Box>
    );
}

/** The icon and the line on the right of the card's head, by state (design *Status*). */
function Status({ view }: { view: CardView }) {
    const { state, status, statusColor } = view;
    const color = statusColor === 'success' ? 'success.main' : statusColor === 'error' ? 'error.main' : 'text.secondary';
    return (
        <Stack direction="row" alignItems="center" spacing={0.625} sx={{ flex: 'none' }} aria-live="polite">
            {state === 'running' && <CircularProgress size={12} thickness={5} />}
            {state === 'queued' && <ScheduleIcon sx={{ fontSize: 14, color: 'action.active' }} />}
            {state === 'finished' && <CheckIcon sx={{ fontSize: 14, color: 'success.main' }} />}
            {state === 'failed' && <CloseIcon sx={{ fontSize: 14, color: 'error.main' }} />}
            {state === 'expired' && <HistoryToggleOffIcon sx={{ fontSize: 14, color: 'action.active' }} />}
            <Typography
                variant="caption"
                data-testid="agent-annotation-status"
                sx={{ fontSize: 11, color, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
            >
                {status}
            </Typography>
        </Stack>
    );
}

/**
 * One card of the transcript. `layout` is the width of the view: the context panel stacks the image rows, the
 * agent page keeps them in one line (design *Verhalten*).
 */
export default function AnnotationCard({ view, layout }: { view: CardView; layout: 'panel' | 'page' }) {
    const Icon = view.icon === 'run' ? AutoFixHighOutlinedIcon : FactCheckOutlinedIcon;
    return (
        <Card
            variant="outlined"
            component="div"
            role="group"
            data-testid="agent-annotation-card"
            data-state={view.state}
            aria-label={`${view.title}${view.kindLabel ?? ''}: ${view.state}`}
            sx={{ minWidth: 0, borderLeft: 3, borderLeftColor: view.accent }}
        >
            <CardHeader
                disableTypography
                sx={{ py: 1.125, px: 1.5, alignItems: 'flex-start' }}
                avatar={<Icon fontSize="small" color="primary" sx={{ mt: '2px' }} />}
                title={
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 0.75, rowGap: 0.25 }}>
                        <Typography variant="subtitle2" sx={{ fontSize: 13, fontWeight: 500 }}>
                            {view.title}
                            {view.kindLabel && <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>{view.kindLabel}</Box>}
                        </Typography>
                        <EffectChip effect={view.effect} />
                        {view.simulated && <Chip size="small" variant="outlined" label="simulated" />}
                        <Box sx={{ flex: 1 }} />
                        <Status view={view} />
                    </Box>
                }
                subheader={<Subtitle lines={view.subtitle} />}
            />
            <Divider />
            <CardContent sx={{ px: 1.5, pt: 1.25, pb: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Stack spacing={1.25}>
                    {view.sections.map((s, i) => (
                        <SectionView key={i} section={s} layout={layout} title={`${view.title}${view.kindLabel ?? ''}`} />
                    ))}
                </Stack>
            </CardContent>
        </Card>
    );
}

/**
 * The annotation cards of one run of tool calls, in the order of the calls: the runs and jobs of
 * pre-annotation and the result checks the agent started here. The clock ticks only while one of them runs,
 * so that a status line stays current without waking the whole answer every second.
 */
export function AnnotationCards({
    items,
    checks,
    base,
    layout,
}: {
    items: AnnotationItem[];
    checks: CheckItem[];
    /** The CVAT base of the chat (`cvat_url` of the annotation route); no link without it. */
    base?: string;
    layout: 'panel' | 'page';
}) {
    const once = (state: string) => state === 'queued' || state === 'running';
    const running = items.some((i) => once(cardStateOf(i))) || checks.some((c) => once(c.check.state));
    const now = useNow(running, 1000);
    return (
        <>
            {items.map((item) => (
                <AnnotationCard
                    key={item.key}
                    view={item.what === 'run' ? runCard(item, base, now) : jobCard(item, base, now)}
                    layout={layout}
                />
            ))}
            {checks.map((item) => (
                <AnnotationCard key={item.key} view={checkCard(item.check, item.watch, now)} layout={layout} />
            ))}
        </>
    );
}
