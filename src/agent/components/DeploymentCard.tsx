// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The state of an edge deployment in the transcript as a small card (edge D-E4, design
// `prototyp/entwuerfe/edge-deployment-card/`). It follows the tool-call group whose result it shows (`Conversation.tsx`)
// and stays current through the job the gateway observes (`useJobs`). Read-only: only the chevron opens the details,
// every change goes through the agent and the user's approval (D4.2).

import { useId, useLayoutEffect, useRef, useState } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';

import CheckIcon from '@mui/icons-material/Check';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import DevicesIcon from '@mui/icons-material/Devices';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import LayersIcon from '@mui/icons-material/Layers';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import ScheduleIcon from '@mui/icons-material/Schedule';
import SettingsEthernetIcon from '@mui/icons-material/SettingsEthernet';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

import {
    deploymentDetails,
    deploymentHint,
    deploymentView,
    lastSeenText,
    midSplit,
    taskLine,
    updatedAt,
    updatedText,
} from '../deploymentCard';
import type { DeploymentCardData, DeploymentDetail, DeploymentStatus, DeploymentView } from '../deploymentCard';
import type { WatchJob } from '../jobs';
import { platformPath } from '../platformLinks';
import { useNow } from '../useNow';
import EllipsisText, { MidEllipsisText } from './EllipsisText';
import { MONO } from './tokens';

/** Below this card width the page layout falls back to the panel's rows (W3); the card measures itself. */
export const PAGE_MIN_WIDTH = 600;

/** The left border per state: what the card says at a glance (design `STATES.*.border`). */
const SIDE: Record<DeploymentView, string> = {
    created: 'primary.main',
    starting: 'primary.main',
    deployed: 'primary.main',
    failed: 'error.main',
    offline: 'warning.main',
    undeployed: 'grey.400',
};

/** The chip keeps the platform's own status; only `deployed` is coloured (L3, decision "offline schlägt deployed"). */
const CHIP: Record<DeploymentStatus, { bgcolor: string; borderColor: string; color: string; dot: string }> = {
    created: {
        bgcolor: 'action.hover',
        borderColor: 'rgba(0, 0, 0, 0.23)',
        color: 'rgba(0, 0, 0, 0.7)',
        dot: 'grey.600',
    },
    deployed: {
        bgcolor: 'rgba(46, 125, 50, 0.08)',
        borderColor: 'rgba(46, 125, 50, 0.5)',
        color: 'success.dark',
        dot: 'success.main',
    },
    undeployed: {
        bgcolor: '#fff',
        borderColor: 'rgba(0, 0, 0, 0.23)',
        color: 'text.secondary',
        dot: 'grey.400',
    },
};

const ROW_ICON = { fontSize: 14, color: 'action.active', flex: 'none' } as const;
const LABEL = { fontSize: 12, lineHeight: '16px', color: 'text.secondary' } as const;
/** The value lines of the card: 13 px body text and 12 px in monospace (W4). */
const VALUE = { fontSize: 13, lineHeight: '20px' } as const;

/** State icon of the head, 16 x 16 px (L13). */
function StateIcon({ view }: { view: DeploymentView }) {
    if (view === 'starting') return <CircularProgress size={14} thickness={5} />;
    if (view === 'deployed') return <CheckIcon sx={{ fontSize: 16, color: 'success.main' }} />;
    if (view === 'failed') return <CloseIcon sx={{ fontSize: 16, color: 'error.main' }} />;
    if (view === 'offline') return <WarningAmberIcon sx={{ fontSize: 16, color: 'warning.main' }} />;
    if (view === 'undeployed') return <RemoveCircleOutlineIcon sx={{ fontSize: 16, color: 'grey.500' }} />;
    return <RadioButtonUncheckedIcon sx={{ fontSize: 16, color: 'grey.500' }} />;
}

/** The device's name, linked to its page on the platform where the deployment is listed (task, see the PR). */
function DeviceName({ name, id, tail }: { name: string; id?: string; tail: string }) {
    const href = id && /^\d+$/.test(id) ? platformPath(`/edge/${id}`) : undefined;
    if (!href) return <MidEllipsisText testId="agent-deployment-device" text={name} tail={tail} sx={VALUE} />;
    return (
        <Link href={href} underline="hover" color="inherit" sx={{ minWidth: 0, display: 'block' }}>
            <MidEllipsisText testId="agent-deployment-device" text={name} tail={tail} sx={VALUE} />
        </Link>
    );
}

/** One value of the details; the task id is shortened in the middle, every value carries the full one as tooltip. */
function DetailValue({ detail }: { detail: DeploymentDetail }) {
    const tail = detail.truncate ? midSplit(detail.value, { min: 6 }).tail : '';
    return (
        <MidEllipsisText
            text={detail.value}
            tail={tail}
            sx={{ ...VALUE, fontFamily: detail.mono ? MONO : undefined }}
        />
    );
}

/**
 * The red block of a failed task message, as the design draws it (L12). It is its own block instead of the code block
 * of `StepDetail`, whose colours belong to the tool call's error output.
 */
function TaskMessage({ text }: { text: string }) {
    return (
        <Box data-testid="agent-deployment-message" sx={{ mt: 1.25 }}>
            <Typography sx={{ fontSize: 12, color: '#c62828' }}>Task message</Typography>
            <Box
                component="pre"
                sx={{
                    mt: 0.5,
                    m: 0,
                    px: '10px',
                    py: 1,
                    bgcolor: '#fdeded',
                    border: '1px solid #f5c2c0',
                    borderRadius: 1,
                    color: '#c62828',
                    fontFamily: MONO,
                    fontSize: 12,
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'anywhere',
                }}
            >
                {text}
            </Box>
        </Box>
    );
}

/**
 * The card of one deployment. `job` is the observation the gateway keeps for it (`jobOfDeployment`); it decides the
 * live state and the progress. `layout` is the view's own distinction between panel and page — on the page the card
 * measures its own width and falls back to the panel's rows when it is narrow (W3).
 */
export default function DeploymentCard({
    data,
    job,
    layout,
}: {
    data: DeploymentCardData;
    job?: WatchJob;
    layout: 'panel' | 'page';
}) {
    const detailId = useId();
    const root = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(0);
    const [open, setOpen] = useState(false);
    const view = deploymentView(data, job);
    const running = view === 'starting';
    const now = useNow(running || !!job, 30000);
    const wide = layout === 'page' && width >= PAGE_MIN_WIDTH;

    useLayoutEffect(() => {
        if (layout !== 'page') return undefined;
        const el = root.current;
        if (!el) return undefined;
        const measure = () => setWidth(Math.round(el.getBoundingClientRect().width));
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, [layout]);

    const task = taskLine(view, data);
    const hint = deploymentHint(view, data);
    const online = data.device?.online;
    const device = data.device?.name ?? '—';
    const image = data.image ?? '';
    const ports = data.ports;
    // in the panel only the first port fits; the others become "+N" (L6)
    const portShort = ports.length ? `${ports[0]}${ports.length > 1 ? ` +${ports.length - 1}` : ''}` : undefined;
    const failedMessage = view === 'failed' ? data.task?.message : undefined;
    const updated = updatedText(updatedAt(data, job), now);
    const deviceState = online === undefined ? undefined : online ? 'online' : 'offline';
    const chip = CHIP[data.status];

    const row = { display: 'flex', alignItems: 'center', gap: 1, minHeight: 18, minWidth: 0 } as const;
    const head = (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minHeight: 24, minWidth: 0 }}>
            <IconButton
                size="small"
                data-testid="agent-deployment-toggle"
                aria-label={open ? 'Hide details' : 'Show details'}
                aria-expanded={open}
                aria-controls={detailId}
                onClick={() => setOpen((v) => !v)}
                sx={{ flex: 'none', width: 22, height: 22, p: 0 }}
            >
                <ChevronRightIcon
                    sx={{
                        fontSize: 18,
                        transition: 'transform 150ms',
                        transform: open ? 'rotate(90deg)' : 'none',
                    }}
                />
            </IconButton>
            <Box sx={{ flex: 'none', width: 16, height: 16, display: 'flex', alignItems: 'center', mr: 0.5 }}>
                <StateIcon view={view} />
            </Box>
            <MidEllipsisText
                testId="agent-deployment-name"
                text={data.name}
                tail={midSplit(data.name, { min: 8, cap: 14 }).tail}
                sx={{ ...VALUE, fontWeight: 500, flex: '0 1 auto' }}
            />
            <Chip
                size="small"
                variant="outlined"
                data-testid="agent-deployment-chip"
                icon={<FiberManualRecordIcon sx={{ fontSize: 8, color: chip.dot }} />}
                label={data.status}
                sx={{
                    flex: 'none',
                    ml: 0.5,
                    height: 20,
                    fontSize: 12,
                    bgcolor: chip.bgcolor,
                    borderColor: chip.borderColor,
                    color: chip.color,
                    '& .MuiChip-icon': { ml: '8px', mr: '4px' },
                    '& .MuiChip-label': { px: '8px' },
                }}
            />
            {wide && updated && (
                <Typography data-testid="agent-deployment-updated" sx={{ ...LABEL, ml: 'auto', pl: 1, flex: 'none' }}>
                    updated {updated}
                </Typography>
            )}
        </Box>
    );

    return (
        <Card
            variant="outlined"
            ref={root}
            role="group"
            data-testid="agent-deployment-card"
            data-view={view}
            aria-label={`Deployment ${data.name}: ${view}`}
            sx={{
                position: 'relative',
                minWidth: 0,
                borderLeft: 3,
                borderLeftColor: SIDE[view],
                ...(wide ? { py: 1.25, pr: 2, pl: 1.5 } : { p: 1, pr: 1.5, pl: 1.5 }),
            }}
        >
            {head}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: '2px', mt: 0.25, pl: '26px', minWidth: 0 }}>
                {wide ? (
                    <Box
                        sx={{
                            display: 'grid',
                            gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1.4fr) minmax(0, 1fr)',
                            columnGap: '24px',
                            ml: '24px',
                            my: '4px',
                            minWidth: 0,
                        }}
                    >
                        <Box sx={{ minWidth: 0 }}>
                            <Typography sx={LABEL}>Edge device</Typography>
                            <Box sx={{ ...row, gap: 0.75 }}>
                                {deviceState && <DeviceDot online={online === true} />}
                                <DeviceName
                                    name={device}
                                    id={data.device?.id}
                                    tail={midSplit(device, { min: 6, cap: 16 }).tail}
                                />
                            </Box>
                            <Typography data-testid="agent-deployment-seen" sx={LABEL}>
                                {deviceState ? `${deviceState} · last seen ` : ''}
                                {lastSeenText(data.device?.lastHeartbeat, now)}
                            </Typography>
                        </Box>
                        <Box sx={{ minWidth: 0 }}>
                            <Typography sx={LABEL}>Image</Typography>
                            <Box sx={row}>
                                <MidEllipsisText
                                    testId="agent-deployment-image"
                                    text={image || '—'}
                                    tail={image ? midSplit(image, { min: 10, cap: 16, boundary: /(?=[:/])/ }).tail : ''}
                                    sx={{ ...VALUE, fontFamily: MONO, fontSize: 12 }}
                                />
                            </Box>
                        </Box>
                        <Box sx={{ minWidth: 0 }}>
                            <Typography sx={LABEL}>Ports</Typography>
                            {ports.length === 0 ? (
                                <Typography sx={{ ...VALUE, fontFamily: MONO, fontSize: 12 }}>—</Typography>
                            ) : (
                                ports.map((p) => (
                                    <Typography
                                        key={p}
                                        data-testid="agent-deployment-port"
                                        title={p}
                                        sx={{
                                            ...VALUE,
                                            fontFamily: MONO,
                                            fontSize: 12,
                                            lineHeight: '20px',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                        }}
                                    >
                                        {p}
                                    </Typography>
                                ))
                            )}
                        </Box>
                    </Box>
                ) : (
                    <>
                        <Box sx={row}>
                            <DevicesIcon sx={ROW_ICON} />
                            <DeviceName
                                name={device}
                                id={data.device?.id}
                                tail={midSplit(device, { min: 6, cap: 16 }).tail}
                            />
                            {deviceState && (
                                <Box
                                    sx={{
                                        flex: 'none',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 0.5,
                                        fontSize: 12,
                                        color: 'text.secondary',
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    <DeviceDot online={online === true} />
                                    <span data-testid="agent-deployment-seen">
                                        {deviceState} · last seen {lastSeenText(data.device?.lastHeartbeat, now)}
                                    </span>
                                </Box>
                            )}
                        </Box>
                        <Box sx={row}>
                            <LayersIcon sx={ROW_ICON} />
                            <MidEllipsisText
                                testId="agent-deployment-image"
                                text={image || '—'}
                                tail={image ? midSplit(image, { min: 10, cap: 16, boundary: /(?=[:/])/ }).tail : ''}
                                sx={{ ...VALUE, fontFamily: MONO, fontSize: 12, flex: '0 1 auto' }}
                            />
                            {portShort && (
                                <>
                                    <SettingsEthernetIcon sx={{ ...ROW_ICON, ml: 0.5 }} />
                                    {/* the ports never shrink: the image in front of them gives way (L6) */}
                                    <Typography
                                        data-testid="agent-deployment-ports"
                                        sx={{
                                            flexShrink: 0,
                                            fontFamily: MONO,
                                            fontSize: 12,
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        {portShort}
                                    </Typography>
                                </>
                            )}
                        </Box>
                    </>
                )}
                <Box sx={row} aria-live="polite">
                    <ScheduleIcon sx={ROW_ICON} />
                    <EllipsisText
                        testId="agent-deployment-task"
                        text={task.text}
                        sx={{
                            flex: 1,
                            fontSize: 13,
                            color: view === 'failed' ? 'error.main' : view === 'created' ? 'text.secondary' : 'text.primary',
                        }}
                    />
                    {task.status && (
                        <Typography
                            sx={{
                                flex: 'none',
                                fontSize: 12,
                                color:
                                    task.status === 'failed'
                                        ? 'error.main'
                                        : task.status === 'completed'
                                        ? 'text.secondary'
                                        : 'primary.main',
                            }}
                        >
                            {task.status}
                        </Typography>
                    )}
                </Box>
                {hint && (
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mt: 0.25, minWidth: 0 }}>
                        {hint.warn ? (
                            <WarningAmberIcon sx={{ fontSize: 16, color: 'warning.main', flex: 'none' }} />
                        ) : (
                            <InfoOutlinedIcon sx={{ fontSize: 16, color: 'action.active', flex: 'none' }} />
                        )}
                        <Typography
                            data-testid="agent-deployment-hint"
                            variant="caption"
                            sx={{
                                fontSize: 12,
                                lineHeight: '16px',
                                color: hint.warn ? 'text.primary' : 'text.secondary',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                            }}
                        >
                            {hint.text}
                        </Typography>
                    </Box>
                )}
            </Box>
            <Collapse in={open} unmountOnExit>
                <Box
                    id={detailId}
                    data-testid="agent-deployment-details"
                    sx={{
                        mt: 1,
                        ml: '33px',
                        pl: 2,
                        borderLeft: 1,
                        borderColor: 'divider',
                        minWidth: 0,
                    }}
                >
                    <Box
                        sx={{
                            display: 'grid',
                            gridTemplateColumns: wide ? 'auto minmax(0,1fr) auto minmax(0,1fr)' : 'auto minmax(0,1fr)',
                            columnGap: 2,
                            rowGap: 0.5,
                            alignItems: 'baseline',
                            minWidth: 0,
                        }}
                    >
                        {deploymentDetails(data, now).map((d) => (
                            <Box key={d.label} sx={{ display: 'contents' }}>
                                <Typography sx={{ fontSize: 12, color: 'text.secondary', whiteSpace: 'nowrap' }}>
                                    {d.label}
                                </Typography>
                                <DetailValue detail={d} />
                            </Box>
                        ))}
                    </Box>
                    {failedMessage && <TaskMessage text={failedMessage} />}
                </Box>
            </Collapse>
            {running && (
                <LinearProgress
                    data-testid="agent-deployment-progress"
                    variant={job?.progress === undefined ? 'indeterminate' : 'determinate'}
                    value={job?.progress}
                    sx={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        bottom: 0,
                        height: 4,
                        borderBottomLeftRadius: 4,
                        borderBottomRightRadius: 4,
                    }}
                />
            )}
        </Card>
    );
}

/** The 8 px dot of the device row: green while it checked in within five minutes, grey otherwise (L7). */
function DeviceDot({ online }: { online: boolean }) {
    return (
        <FiberManualRecordIcon
            sx={{ flex: 'none', fontSize: 8, color: online ? 'success.main' : 'grey.500' }}
            aria-hidden
        />
    );
}
