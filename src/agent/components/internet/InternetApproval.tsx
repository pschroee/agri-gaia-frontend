// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The approval of internet access (design `internet-access`, a1-a16, gateway issue #175): one card per kind (search,
// sites, packages, full) with what is allowed, the agent's note, the limits and ALLOW / REJECT; once decided one line
// that opens again to read the list. Everything shown comes from the gateway (`approval.internet`), the note is the
// agent's own text and marked as such. An approval of an older gateway without `internet` keeps a plain card.

import { useId, useState, type ReactNode } from 'react';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import ListItemButton from '@mui/material/ListItemButton';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import DataUsageIcon from '@mui/icons-material/DataUsage';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import InventoryIcon from '@mui/icons-material/Inventory2';
import LinkIcon from '@mui/icons-material/Link';
import PublicIcon from '@mui/icons-material/Public';
import PublicOffIcon from '@mui/icons-material/PublicOff';
import ScheduleIcon from '@mui/icons-material/Schedule';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import TimerOffIcon from '@mui/icons-material/TimerOff';
import TravelExploreIcon from '@mui/icons-material/TravelExplore';
import UploadIcon from '@mui/icons-material/Upload';

import { boundTo } from '../../callCards';
import { useInternetContext } from '../../InternetContext';
import { AGENT_NOTE_LABEL } from '../../notebook';
import type { InternetApproval as InternetApprovalData, InternetGrant, InternetKind } from '../../internet';
import {
    allowAria,
    allowLabel,
    approvalPackages,
    approvalTitle,
    cardTexts,
    decidedStateText,
    decidedTitle,
    endInfo,
    expiresText,
    KIND_CHIP,
    limitsLine,
    PACKAGE_FOLD,
    packageLabel,
    SHOW_FEWER_TEXT,
    showAllText,
    versionText,
    WARNING_AREA_COLOR,
    WARNING_TEXT_COLOR,
} from '../../internetView';
import type { Approval } from '../../types';
import ApprovalFooter from '../ApprovalFooter';
import { AgentText } from '../PlanCard';
import { agentColors, MONO } from '../tokens';

type Layout = 'panel' | 'page';

const ICON_SX = { fontSize: 18, flex: 'none' } as const;

/** The symbol of a kind; full access in the warning colour. */
export function KindIcon({ kind, size = 18 }: { kind: InternetKind; size?: number }) {
    const sx = { fontSize: size, flex: 'none', ...(kind === 'full' ? { color: WARNING_AREA_COLOR } : { color: agentColors.green }) };
    switch (kind) {
        case 'search':
            return <TravelExploreIcon sx={sx} aria-hidden />;
        case 'domains':
            return <LinkIcon sx={sx} aria-hidden />;
        case 'packages':
            return <InventoryIcon sx={sx} aria-hidden />;
        default:
            return <PublicIcon sx={sx} aria-hidden />;
    }
}

/** Chip of a kind: SEARCH ONLY, SITES, PACKAGES, FULL ACCESS (the last in the warning colour). */
export function KindChip({ kind }: { kind: InternetKind }) {
    return (
        <Chip
            size="small"
            variant="outlined"
            label={KIND_CHIP[kind]}
            sx={
                kind === 'full'
                    ? { color: WARNING_TEXT_COLOR, borderColor: WARNING_AREA_COLOR, bgcolor: '#fff4e5', flex: 'none' }
                    : { flex: 'none' }
            }
        />
    );
}

/** The note the agent gave; "(no reason given)" and an empty text are no note. */
export function agentNote(approval: Pick<Approval, 'name'>, grant?: Pick<InternetGrant, 'reason'>): string | undefined {
    const t = (grant?.reason ?? approval.name ?? '').trim();
    return t && t !== '(no reason given)' ? t : undefined;
}

/** Hosts of a sites grant in monospace, one per line, never folded. */
function HostList({ hosts }: { hosts: string[] }) {
    return (
        <Box
            component="ul"
            data-testid="agent-internet-hosts"
            sx={{ m: 0, p: 0, listStyle: 'none', border: 1, borderColor: 'divider', borderRadius: 1, minWidth: 0 }}
        >
            {hosts.map((h, i) => (
                <Box
                    component="li"
                    key={h}
                    sx={{
                        px: 1,
                        py: 0.5,
                        fontFamily: MONO,
                        fontSize: 12.5,
                        overflowWrap: 'anywhere',
                        borderTop: i ? 1 : 0,
                        borderColor: 'divider',
                    }}
                >
                    {h}
                </Box>
            ))}
        </Box>
    );
}

/** Splits a package label behind `-_./[,` and puts a `<wbr />` there: names wrap at separators, never per letter. */
export function breakableName(label: string): ReactNode {
    const parts = label.match(/[^-_./[,]*[-_./[,]?/g)?.filter((x) => x !== '') ?? [label];
    return parts.map((part, i) => (
        <span key={i}>
            {part}
            {i < parts.length - 1 && <wbr />}
        </span>
    ));
}

/**
 * Packages as a table (ecosystem chip, name with extras, version); longer than PACKAGE_FOLD folds behind "Show all".
 * `width: 1` in `sx` would be 100 %; columns shrink with '1%'. One table, so the columns line up after "Show all".
 */
function PackageTable({ packages }: { packages: string[] }) {
    const list = approvalPackages({ packages });
    const [all, setAll] = useState(false);
    const id = useId();
    const fold = list.length > PACKAGE_FOLD;
    const row = (p: (typeof list)[number], i: number) => (
        <TableRow key={`${p.ecosystem}:${p.name}:${i}`}>
            <TableCell data-testid="agent-internet-package-eco" sx={{ width: '1%', whiteSpace: 'nowrap', pr: 0 }}>
                <Chip size="small" variant="outlined" label={p.ecosystem} sx={{ height: 20, fontFamily: MONO, fontSize: 11 }} />
            </TableCell>
            <TableCell
                data-testid="agent-internet-package-name"
                sx={{ fontFamily: MONO, fontSize: 12.5, overflowWrap: 'break-word', wordBreak: 'normal' }}
            >
                {breakableName(packageLabel(p))}
            </TableCell>
            <TableCell
                data-testid="agent-internet-package-version"
                align="right"
                sx={{ width: '1%', fontFamily: MONO, fontSize: 12, color: 'text.secondary', whiteSpace: 'nowrap' }}
            >
                {versionText(p.version)}
            </TableCell>
        </TableRow>
    );
    return (
        <Box data-testid="agent-internet-packages" sx={{ minWidth: 0 }}>
            <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflowX: 'auto' }}>
                <Table size="small" aria-label="Packages" sx={{ '& td': { py: 0.5, px: 1 } }}>
                    <TableBody>{list.slice(0, fold ? PACKAGE_FOLD : list.length).map(row)}</TableBody>
                    {fold && <TableBody id={id}>{all ? list.slice(PACKAGE_FOLD).map((p, i) => row(p, i + PACKAGE_FOLD)) : null}</TableBody>}
                </Table>
            </Box>
            {fold && (
                <Button
                    size="small"
                    variant="text"
                    onClick={() => setAll((a) => !a)}
                    aria-expanded={all}
                    aria-controls={id}
                    sx={{ mt: 0.25 }}
                >
                    {all ? SHOW_FEWER_TEXT : showAllText(list.length)}
                </Button>
            )}
        </Box>
    );
}

/** "What is allowed": the line of the kind, or the list of sites or packages, then the hints. */
function Allowed({ data }: { data: InternetApprovalData }) {
    const packages = approvalPackages({ packages: data.packages ?? [] });
    const t = cardTexts(data.kind, [...new Set(packages.map((p) => p.ecosystem))]);
    return (
        <Box sx={{ mt: 1, minWidth: 0 }}>
            <Typography variant="overline" component="div" sx={{ fontSize: 11, lineHeight: 1.8, color: 'text.secondary' }}>
                What is allowed
            </Typography>
            {t.allowText && <Typography sx={{ fontSize: 13 }}>{t.allowText}</Typography>}
            {data.kind === 'domains' && <HostList hosts={data.domains ?? []} />}
            {data.kind === 'packages' && <PackageTable packages={data.packages ?? []} />}
            {t.hints.map((h, i) => (
                <Box key={h} sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75, mt: 0.75 }}>
                    {data.kind === 'domains' && i === 0 && (
                        <UploadIcon sx={{ fontSize: 15, mt: '2px', color: 'text.secondary', flex: 'none' }} aria-hidden />
                    )}
                    <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{h}</Typography>
                </Box>
            ))}
            {t.warning && (
                <Alert
                    severity="warning"
                    icon={<PublicIcon sx={{ color: WARNING_AREA_COLOR }} />}
                    sx={{ mt: 1, fontSize: 12.5, color: WARNING_TEXT_COLOR, bgcolor: '#fff4e5', alignItems: 'flex-start' }}
                >
                    {t.warning}
                </Alert>
            )}
        </Box>
    );
}

function IconLine({ icon, children }: { icon: ReactNode; children: ReactNode }) {
    return (
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75, mt: 0.75 }}>
            <Box sx={{ display: 'flex', color: 'text.secondary', mt: '1px', '& svg': { fontSize: 16 } }}>{icon}</Box>
            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{children}</Typography>
        </Box>
    );
}

/** A request of an older gateway (no `internet` data): the reason and ALLOW / REJECT, nothing more to say. */
function LegacyRequest({ approval, onDecide }: { approval: Approval; onDecide: (approve: boolean) => Promise<void> }) {
    const [busy, setBusy] = useState(false);
    const decide = async (a: boolean) => {
        setBusy(true);
        try {
            await onDecide(a);
        } finally {
            setBusy(false);
        }
    };
    const note = agentNote(approval);
    return (
        <Box data-testid="agent-internet-approval" data-approval-id={approval.id} sx={{ px: 1.5, py: 1.25, borderTop: 1, borderColor: 'divider' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <PublicIcon sx={{ ...ICON_SX, color: agentColors.green }} aria-hidden />
                <Typography sx={{ fontSize: 13, fontWeight: 500 }}>The agent asks for internet access</Typography>
            </Box>
            {note && <AgentText label={AGENT_NOTE_LABEL} text={note} testId="agent-internet-note" />}
            <ApprovalFooter
                approveLabel="Allow internet"
                approveProps={{ startIcon: <PublicIcon /> }}
                busy={busy}
                onApprove={() => void decide(true)}
                onReject={() => void decide(false)}
            />
        </Box>
    );
}

/** The pending card of one internet request, in the group "Waiting for your approval". */
export default function InternetApproval({
    approval,
    onDecide,
}: {
    approval: Approval;
    onDecide: (approve: boolean) => Promise<void>;
    layout?: Layout;
}) {
    const [busy, setBusy] = useState(false);
    const data = approval.internet;
    if (!data) return <LegacyRequest approval={approval} onDecide={onDecide} />;
    const decide = async (a: boolean) => {
        setBusy(true);
        try {
            await onDecide(a);
        } finally {
            setBusy(false);
        }
    };
    const note = agentNote(approval);
    const expires = expiresText(data);
    const full = data.kind === 'full';
    return (
        <Box
            role="group"
            aria-label={approvalTitle(data)}
            data-testid="agent-internet-approval"
            data-approval-id={approval.id}
            data-kind={data.kind}
            sx={{ px: 1.5, py: 1.25, borderTop: 1, borderColor: 'divider', minWidth: 0 }}
        >
            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                <KindIcon kind={data.kind} />
                <Typography component="h3" sx={{ fontSize: 13.5, fontWeight: 500, minWidth: 0, overflowWrap: 'anywhere' }}>
                    {approvalTitle(data)}
                </Typography>
                <KindChip kind={data.kind} />
            </Box>
            {note && <AgentText label={AGENT_NOTE_LABEL} text={note} testId="agent-internet-note" />}
            <Allowed data={data} />
            <IconLine icon={<ScheduleIcon />}>{limitsLine(data)}</IconLine>
            {expires && <IconLine icon={<HourglassEmptyIcon />}>{expires}</IconLine>}
            <ApprovalFooter
                approveLabel={allowLabel(data)}
                approveProps={{
                    color: full ? 'warning' : 'primary',
                    startIcon: <KindIconPlain kind={data.kind} />,
                    'aria-label': allowAria(data),
                }}
                busy={busy}
                onApprove={() => void decide(true)}
                onReject={() => void decide(false)}
            />
        </Box>
    );
}

/** The kind's symbol inside a button: it takes the button's colour. */
function KindIconPlain({ kind }: { kind: InternetKind }) {
    switch (kind) {
        case 'search':
            return <TravelExploreIcon />;
        case 'domains':
            return <LinkIcon />;
        case 'packages':
            return <InventoryIcon />;
        default:
            return <PublicIcon />;
    }
}

type Tone = { icon: ReactNode; color: string };

/** The symbol and colour of a decided line; never the colour alone, the state stands beside it in words. */
export function decidedTone(approval: Pick<Approval, 'state'>, grant?: Pick<InternetGrant, 'state' | 'ended_reason'>): Tone {
    const s = { fontSize: 16, flex: 'none' } as const;
    if (approval.state === 'rejected') return { icon: <CloseIcon sx={{ ...s, color: 'error.main' }} aria-hidden />, color: 'error.main' };
    if (approval.state === 'expired')
        return { icon: <HourglassEmptyIcon sx={{ ...s, color: WARNING_AREA_COLOR }} aria-hidden />, color: WARNING_TEXT_COLOR };
    if (approval.state === 'cancelled')
        return { icon: <TimerOffIcon sx={{ ...s, color: 'text.disabled' }} aria-hidden />, color: 'text.secondary' };
    if (grant?.state === 'ended') {
        const grey = { ...s, color: 'text.disabled' };
        switch (endInfo(grant.ended_reason).icon) {
            case 'TaskAlt':
                return { icon: <TaskAltIcon sx={grey} aria-hidden />, color: 'text.secondary' };
            case 'DataUsage':
                return { icon: <DataUsageIcon sx={grey} aria-hidden />, color: 'text.secondary' };
            case 'PublicOff':
                return { icon: <PublicOffIcon sx={grey} aria-hidden />, color: 'text.secondary' };
            case 'ErrorOutline':
                return { icon: <ErrorOutlineIcon sx={grey} aria-hidden />, color: 'text.secondary' };
            default:
                return { icon: <TimerOffIcon sx={grey} aria-hidden />, color: 'text.secondary' };
        }
    }
    return { icon: <CheckIcon sx={{ ...s, color: agentColors.ok }} aria-hidden />, color: agentColors.ok };
}

/**
 * A decided request as one line (approved with its active time, rejected, no decision in time, ended); it opens to the
 * note, the list and the limits, without buttons. `grant` is the grant the approval started, when there is one.
 */
export function InternetDecided({
    approval,
    grant,
    layout = 'panel',
}: {
    approval: Approval;
    grant?: InternetGrant;
    layout?: Layout;
}) {
    const [open, setOpen] = useState(false);
    const id = useId();
    const data = approval.internet;
    if (!data) return null;
    const { title, summary } = decidedTitle(data);
    const state = decidedStateText(
        approval.state === 'pending' ? { state: 'pending' } : { state: approval.state, decided_at: approval.decided_at },
        grant,
    );
    const tone = decidedTone(approval, grant);
    const note = agentNote(approval, grant);
    return (
        <Box
            role="group"
            data-testid="agent-internet-decided"
            data-approval-id={approval.id}
            data-state={approval.state}
            aria-label={`${title}: ${state}`}
            sx={{ border: 1, borderColor: 'divider', borderLeft: `3px solid ${agentColors.outline}`, borderRadius: 1, minWidth: 0 }}
        >
            <ListItemButton
                dense
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                aria-controls={id}
                sx={{ px: 1.5, gap: 1, minWidth: 0, flexWrap: layout === 'panel' ? 'wrap' : 'nowrap', alignItems: 'center' }}
            >
                {open ? <ExpandLessIcon fontSize="small" sx={{ flex: 'none' }} /> : <ExpandMoreIcon fontSize="small" sx={{ flex: 'none' }} />}
                <KindIcon kind={data.kind} size={16} />
                <Typography sx={{ fontSize: 12.5, fontWeight: 500, flex: 'none' }}>{title}</Typography>
                <KindChip kind={data.kind} />
                <Typography
                    noWrap={layout !== 'panel'}
                    sx={{ fontSize: 12, color: 'text.secondary', minWidth: 0, flex: layout === 'panel' ? '1 1 100%' : '0 1 auto', overflowWrap: 'anywhere' }}
                >
                    {summary}
                </Typography>
                <Box sx={{ ml: layout === 'panel' ? 0 : 'auto', display: 'flex', alignItems: 'center', gap: 0.5, flex: 'none' }}>
                    {tone.icon}
                    <Typography sx={{ fontSize: 12, color: tone.color }}>{state}</Typography>
                </Box>
            </ListItemButton>
            <Collapse in={open} unmountOnExit id={id}>
                <Box sx={{ px: 1.5, pb: 1.25, minWidth: 0 }}>
                    {note && <AgentText label={AGENT_NOTE_LABEL} text={note} testId="agent-internet-note" />}
                    <Allowed data={data} />
                    <IconLine icon={<ScheduleIcon />}>{limitsLine(data)}</IconLine>
                </Box>
            </Collapse>
        </Box>
    );
}

/** The decided requests whose tool call is among `steps`, each as its one line right below the call's group. */
export function InternetDecidedRows({
    steps,
    approvals,
    layout,
}: {
    steps: { id: string; callId?: string }[];
    approvals: Approval[] | undefined;
    layout?: Layout;
}) {
    const net = useInternetContext();
    const list = (approvals ?? []).filter(
        (a) => a.kind === 'internet_access' && !!a.internet && a.state !== 'pending' && steps.some((s) => boundTo(a, s)),
    );
    if (list.length === 0) return null;
    return (
        <>
            {list.map((a) => (
                <InternetDecided key={a.id} approval={a} grant={net?.grants.find((g) => g.approval_id === a.id)} layout={layout} />
            ))}
        </>
    );
}
