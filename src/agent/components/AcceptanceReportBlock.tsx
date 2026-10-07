// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { Fragment, ReactNode, useMemo, useState } from 'react';

import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Collapse from '@mui/material/Collapse';
import Link from '@mui/material/Link';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import HighlightOffIcon from '@mui/icons-material/HighlightOff';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';

import {
    acceptanceSummary,
    parseAcceptanceReport,
    prettyJson,
    type AcceptanceReport,
    type CommandResult,
    type CriterionStatus,
} from '../acceptance';
import { agentColors, codeBlockSx, MONO } from './tokens';

type Props = {
    body: string;
    /** The block is still being written (answer streaming, fence not closed). */
    pending?: boolean;
    gap?: number;
};

/** Raw text that wraps instead of scrolling sideways (the panel is 400 px wide). */
const wrappingCodeSx = {
    ...codeBlockSx,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    overflowX: 'visible',
} as const;

type Tone = 'ok' | 'error' | 'muted';
const toneColor = (t: Tone) => (t === 'ok' ? agentColors.ok : t === 'error' ? 'error.main' : 'text.secondary');

function StatusIcon({ tone }: { tone: Tone | 'unknown' }) {
    const sx = { fontSize: 14, mt: '2px', flex: 'none', color: tone === 'unknown' ? 'text.disabled' : toneColor(tone) };
    if (tone === 'ok') return <CheckCircleOutlineIcon sx={sx} />;
    if (tone === 'error') return <HighlightOffIcon sx={sx} />;
    if (tone === 'muted') return <RemoveCircleOutlineIcon sx={sx} />;
    return <HelpOutlineIcon sx={sx} />;
}

const criterionTone = (s: CriterionStatus) =>
    s === 'satisfied' ? 'ok' : s === 'not-satisfied' ? 'error' : s === 'not-applicable' ? 'muted' : 'unknown';
const criterionText = (s: CriterionStatus) =>
    s === 'satisfied' ? 'satisfied' : s === 'not-satisfied' ? 'not satisfied' : s === 'not-applicable' ? 'n/a' : '?';
const commandTone = (r: CommandResult) =>
    r === 'passed' ? 'ok' : r === 'failed' ? 'error' : r === 'not-run' ? 'muted' : 'unknown';
const commandText = (r: CommandResult) => (r === 'not-run' ? 'not run' : r === 'unknown' ? '?' : r);

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <Box sx={{ '& + &': { mt: 1 } }}>
            <Box sx={{ fontWeight: 500, fontSize: 12, color: 'text.secondary', mb: 0.25 }}>{title}</Box>
            {children}
        </Box>
    );
}

function Row({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
    return (
        <Box component="li" sx={{ display: 'flex', gap: 0.75, alignItems: 'flex-start', minWidth: 0 }}>
            {icon}
            <Box sx={{ minWidth: 0, flex: 1 }}>{children}</Box>
        </Box>
    );
}

function Rows({ children, bullets = false }: { children: ReactNode; bullets?: boolean }) {
    return (
        <Box
            component="ul"
            sx={{
                m: 0,
                pl: bullets ? 2 : 0,
                listStyle: bullets ? 'disc' : 'none',
                display: bullets ? 'block' : 'flex',
                flexDirection: 'column',
                gap: 0.25,
            }}
        >
            {children}
        </Box>
    );
}

const Mono = ({ children }: { children: ReactNode }) => (
    <Box component="span" sx={{ fontFamily: MONO, fontSize: '0.92em' }}>
        {children}
    </Box>
);

function TextList({ title, items, mono = false }: { title: string; items: string[]; mono?: boolean }) {
    if (items.length === 0) return null;
    return (
        <Section title={title}>
            <Rows bullets>
                {items.map((it, i) => (
                    <li key={i}>{mono ? <Mono>{it}</Mono> : it}</li>
                ))}
            </Rows>
        </Section>
    );
}

function ReportDetails({ report }: { report: AcceptanceReport }) {
    return (
        <>
            {report.criteria.length > 0 && (
                <Section title="Criteria">
                    <Rows>
                        {report.criteria.map((c, i) => (
                            <Row key={i} icon={<StatusIcon tone={criterionTone(c.status)} />}>
                                <Box component="span" sx={{ fontWeight: 500 }}>
                                    {c.id || `criterion ${i + 1}`}
                                </Box>{' '}
                                <Box
                                    component="span"
                                    sx={{ color: c.status === 'not-satisfied' ? 'error.main' : 'text.secondary' }}
                                >
                                    · {criterionText(c.status)}
                                </Box>
                                {c.evidence && <Box sx={{ color: 'text.secondary' }}>{c.evidence}</Box>}
                            </Row>
                        ))}
                    </Rows>
                </Section>
            )}
            <TextList title="Changed files" items={report.changedFiles} mono />
            <TextList title="Tests added or updated" items={report.tests} mono />
            {report.commands.length > 0 && (
                <Section title="Commands">
                    <Rows>
                        {report.commands.map((c, i) => (
                            <Row key={i} icon={<StatusIcon tone={commandTone(c.result)} />}>
                                <Mono>{c.command || '(no command)'}</Mono>{' '}
                                <Box
                                    component="span"
                                    sx={{ color: c.result === 'failed' ? 'error.main' : 'text.secondary' }}
                                >
                                    · {commandText(c.result)}
                                </Box>
                                {c.summary && <Box sx={{ color: 'text.secondary' }}>{c.summary}</Box>}
                            </Row>
                        ))}
                    </Rows>
                </Section>
            )}
            <TextList title="Validation" items={report.validation} />
            {report.diffSummary && (
                <Section title="Diff summary">
                    <Box>{report.diffSummary}</Box>
                </Section>
            )}
            <TextList title="Review findings" items={report.reviewFindings} />
            <TextList title="Residual risks" items={report.residualRisks} />
            <TextList title="Notes" items={report.notes} />
        </>
    );
}

/**
 * An acceptance report of a subagent (issue #53) as one collapsed line "Acceptance report · 2/2 criteria satisfied ·
 * …"; opened, short wrapping lists and "Show raw JSON". A body that does not parse stays code, but collapsed too.
 */
export default function AcceptanceReportBlock({ body, pending = false, gap = 1 }: Props) {
    const [open, setOpen] = useState(false);
    const [raw, setRaw] = useState(false);
    const report = useMemo(() => (pending ? undefined : parseAcceptanceReport(body)), [body, pending]);
    const parts = report ? acceptanceSummary(report) : [];

    // The pieces wrap between each other, never inside, so the line breaks at a separator in the 400 px panel.
    let pieces: { text: string; error?: boolean }[];
    if (pending) pieces = [{ text: 'being written …' }];
    else if (!report) pieces = [{ text: 'not valid JSON, shown as code' }];
    else pieces = parts.length ? parts : [{ text: 'no details' }];
    const detail = pieces.map((p, i) => (
        <Fragment key={i}>
            {' · '}
            <Box component="span" sx={{ color: p.error ? 'error.main' : undefined, whiteSpace: 'nowrap' }}>
                {p.text}
            </Box>
        </Fragment>
    ));

    return (
        <Box data-testid="agent-acceptance-report" data-open={open} data-valid={!!report} sx={{ mb: gap }}>
            <ButtonBase
                onClick={() => setOpen(!open)}
                aria-expanded={open}
                sx={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 0.5,
                    maxWidth: '100%',
                    py: 0.25,
                    pr: 0.75,
                    borderRadius: 0.5,
                    fontSize: 12,
                    lineHeight: 1.5,
                    textAlign: 'left',
                    color: 'text.secondary',
                    '&:hover': { color: 'text.primary' },
                }}
            >
                <ChevronRightIcon
                    sx={{
                        fontSize: 16,
                        mt: '1px',
                        flex: 'none',
                        transition: 'transform 150ms',
                        transform: open ? 'rotate(90deg)' : 'none',
                    }}
                />
                <FactCheckOutlinedIcon sx={{ fontSize: 15, mt: '2px', flex: 'none' }} />
                <Box component="span" sx={{ minWidth: 0 }}>
                    <Box component="span" sx={{ fontWeight: 500, whiteSpace: 'nowrap' }}>
                        Acceptance report
                    </Box>
                    {detail}
                </Box>
            </ButtonBase>
            <Collapse in={open} unmountOnExit>
                <Box
                    sx={{
                        mt: 0.5,
                        ml: '7px',
                        pl: 1.5,
                        borderLeft: 2,
                        borderColor: 'divider',
                        fontSize: 12.5,
                        lineHeight: 1.55,
                        overflowWrap: 'anywhere',
                        minWidth: 0,
                    }}
                >
                    {report ? (
                        <>
                            <ReportDetails report={report} />
                            <Link
                                component="button"
                                type="button"
                                variant="body2"
                                onClick={() => setRaw(!raw)}
                                aria-expanded={raw}
                                sx={{ mt: 1, fontSize: 12, display: 'block' }}
                            >
                                {raw ? 'Hide raw JSON' : 'Show raw JSON'}
                            </Link>
                            {raw && (
                                <Box component="pre" sx={{ ...wrappingCodeSx, mt: 0.5 }}>
                                    {prettyJson(body)}
                                </Box>
                            )}
                        </>
                    ) : (
                        <Box component="pre" sx={wrappingCodeSx}>
                            {body}
                        </Box>
                    )}
                </Box>
            </Collapse>
        </Box>
    );
}
