// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// One step of a plan as a row (issue #221): a 44 px head with number, state, title and a line beneath it, and a body
// that opens with everything the gateway knows about the step. Reading only: decisions stay in the plan card in the
// chat (`extra` lets the card add its approval and the stop button).

import { ReactNode, useState } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import CodeIcon from '@mui/icons-material/Code';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

import { copyText } from '../../clipboard';
import type { WatchJob } from '../../jobs';
import { LISTED_FILES } from '../../uploads';
import { agentApi } from '../../api';
import { agentNote, outputLink, PHASE_LABEL, stepMain, stepPhase, stepTechnical } from '../../plan';
import type { Plan, PlanStep, StepPhase } from '../../plan';
import {
    argRows,
    askLine,
    clockSeconds,
    doneLine,
    hms,
    requestLine,
    resolvedRequest,
    resourceNoun,
    stepCheck,
    stepMeta,
    stepSubline,
    stepTimes,
    waitingFor,
} from '../../planDetail';
import { AGENT_NOTE_LABEL } from '../../planText';
import { isSearchStep, searchSummaryRows } from '../../stepSearch';
import { redactSecrets } from '../../stepDetail';
import type { AssessCheck } from '../../types';
import EffectChip from '../EffectChip';
import { AgentText, ErrorBlock, PHASE_ICON, PRE_SX, ProposedSummary, SummaryDetails } from '../PlanCard';
import UploadFiles from '../UploadFiles';
import { agentColors, MONO } from '../tokens';
import StepActivity from './StepActivity';
import StepArgsTable from './StepArgsTable';
import StepHistory from './StepHistory';
import StepLive from './StepLive';
import StepSearch from './StepSearch';

/** The text that stands for a step that the plan's approval covers or not. */
export const COVERED_TEXT = "Covered by the plan's approval";

const SR_ONLY = {
    position: 'absolute',
    width: 1,
    height: 1,
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    whiteSpace: 'nowrap',
} as const;

const labelSx = { fontSize: 11.5, fontWeight: 500, color: 'text.secondary', lineHeight: 1.5 } as const;

export type RowVariant = 'detail' | 'compact';

function Field({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
    return (
        <>
            <Typography sx={{ ...labelSx, fontWeight: 400 }}>{label}</Typography>
            <Typography
                component="div"
                sx={{ fontSize: 12, fontFamily: mono ? MONO : undefined, overflowWrap: 'anywhere', minWidth: 0 }}
            >
                {children}
            </Typography>
        </>
    );
}

const SUBLINE_COLOR = { muted: 'text.secondary', red: agentColors.red, amber: agentColors.amberText } as const;

/** The border at the left of a row: the step the plan is on, one that waits for you, one that failed. */
function edge(phase: StepPhase, current: boolean): { borderLeft: string; bgcolor?: string } {
    if (phase === 'failed') return { borderLeft: `3px solid ${agentColors.red}` };
    if (phase === 'approval') return { borderLeft: `3px solid ${agentColors.amber}`, bgcolor: agentColors.amberTint };
    if (current) return { borderLeft: `3px solid ${agentColors.green}`, bgcolor: 'rgba(15,84,50,0.04)' };
    return { borderLeft: '1px solid rgba(0,0,0,0.12)' };
}

export default function PlanStepRow({
    plan,
    step,
    variant,
    open,
    onToggle,
    current,
    job,
    checks,
    pending,
    now,
    working,
    chatId,
    extra,
}: {
    plan: Plan;
    step: PlanStep;
    variant: RowVariant;
    open: boolean;
    onToggle: () => void;
    current: boolean;
    job?: WatchJob;
    checks?: readonly AssessCheck[];
    pending: ReadonlySet<string>;
    now: number;
    working?: boolean;
    chatId: string;
    /** What the card adds to the opened step: the step's approval and the stop button. */
    extra?: ReactNode;
}) {
    const compact = variant === 'compact';
    const phase = stepPhase(plan, step, working);
    const main = stepMain(step);
    const sub = stepSubline(plan, step, phase, job);
    const meta = stepMeta(step, job, now);
    const bodyId = `agent-plan-step-body-${plan.id}-${step.idx}`;
    const [json, setJson] = useState(false);
    const [copied, setCopied] = useState(false);
    const technical = redactSecrets(stepTechnical(step));
    const wait = waitingFor(plan, step, pending, job, working);
    const times = stepTimes(step, job, now);
    const rows = argRows(step, plan);
    const resolved = resolvedRequest(step, plan);
    const check = stepCheck(step, plan, checks);
    const note = agentNote(step);
    const live = phase === 'running' || phase === 'paused';
    const searchStep = isSearchStep(step);
    // before the start the search step shows its summary as a table, so the plain detail lines would say it twice
    const searchTable = searchStep && !step.search_id && searchSummaryRows(step).length > 0;
    const showAttempts = (step.max_attempts ?? 0) > 1 || (step.attempts ?? 0) > 1;
    const outputs = step.outputs ?? [];
    const createdHref = step.created_id
        ? outputLink({ resource: step.created_resource ?? '', id: step.created_id })
        : undefined;
    // The step's result line names the id once; the id is the link, the words around it come from doneLine.
    const doneText = doneLine(step, plan);
    const doneAt = step.created_id ? doneText.lastIndexOf(step.created_id) : -1;
    const doneBefore = doneAt >= 0 ? doneText.slice(0, doneAt) : `${doneText} `;
    const doneAfter = doneAt >= 0 && step.created_id ? doneText.slice(doneAt + step.created_id.length) : '';
    const loadStepFiles = (id: string) => agentApi.planStepUploads(id, plan.id, step.idx).then((r) => r.entries);
    const cols = compact ? '20px 20px minmax(0,1fr) auto 24px' : '24px 20px minmax(0,1fr) auto auto 28px';
    const labelCol = compact ? '96px' : '120px';
    return (
        <Box
            data-testid="agent-plan-step-row"
            data-idx={step.idx}
            data-status={phase}
            data-current={current ? 'true' : 'false'}
            sx={{
                position: 'relative',
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
                mb: 1,
                minWidth: 0,
                overflow: 'hidden',
                ...edge(phase, current),
            }}
        >
            <ButtonBase
                onClick={onToggle}
                aria-expanded={open}
                aria-controls={bodyId}
                data-testid="agent-plan-step-head"
                sx={{
                    display: 'grid',
                    gridTemplateColumns: cols,
                    columnGap: 1,
                    alignItems: 'center',
                    width: '100%',
                    minHeight: 44,
                    px: 1,
                    textAlign: 'left',
                    justifyContent: 'stretch',
                }}
            >
                <Typography component="span" sx={{ fontSize: 12, color: 'text.secondary' }}>
                    {step.idx}
                </Typography>
                <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} title={PHASE_LABEL[phase]}>
                    {PHASE_ICON[phase]}
                    <Box component="span" sx={SR_ONLY}>
                        {PHASE_LABEL[phase]}
                    </Box>
                </Box>
                <Box component="span" sx={{ minWidth: 0, py: 0.5 }}>
                    <Typography
                        component="span"
                        data-testid="agent-plan-step-summary"
                        data-from-gateway={main.fromGateway ? 'true' : 'false'}
                        sx={{
                            display: 'block',
                            fontSize: 13.5,
                            fontWeight: current ? 500 : 400,
                            lineHeight: '20px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            ...(main.fromGateway ? {} : { fontFamily: MONO, fontSize: 12.5 }),
                        }}
                    >
                        {main.head}
                    </Typography>
                    {sub.text && (
                        <Typography
                            component="span"
                            data-testid="agent-plan-step-subline"
                            data-tone={sub.tone}
                            sx={{
                                display: 'block',
                                fontSize: 12,
                                lineHeight: '16px',
                                color: SUBLINE_COLOR[sub.tone],
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {sub.text}
                        </Typography>
                    )}
                </Box>
                {!compact && <EffectChip effect={step.effect} />}
                <Typography
                    component="span"
                    sx={{ fontSize: 12, color: 'text.secondary', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
                >
                    {meta}
                </Typography>
                <ExpandMoreIcon
                    sx={{ fontSize: 20, color: 'text.secondary', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}
                    aria-hidden
                />
            </ButtonBase>
            <Collapse in={open} mountOnEnter>
                <Box
                    id={bodyId}
                    role="region"
                    aria-label={`Step ${step.idx}`}
                    data-testid="agent-plan-step-body"
                    sx={{ px: 2, pb: 2, display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0 }}
                >
                    {main.details.length > 0 && !searchTable && <SummaryDetails details={main.details} />}
                    {step.summary_run && step.summary && (
                        <ProposedSummary summary={step.summary} label="As approved" testId="agent-plan-step-approved" />
                    )}
                    {step.uploads && step.uploads.files > LISTED_FILES && (
                        <UploadFiles
                            data={step.uploads}
                            chatId={plan.chat_id || chatId}
                            approvalId={`${plan.id}:${step.idx}`}
                            layout={compact ? 'panel' : 'page'}
                            load={loadStepFiles}
                        />
                    )}
                    {live && <StepLive plan={plan} step={step} job={job} now={now} working={working} compact={compact} />}
                    <StepHistory job={job} step={step} now={now} />
                    {searchStep && <StepSearch step={step} chatId={plan.chat_id || chatId} labelWidth={compact ? 108 : 132} />}
                    <Box sx={{ display: 'grid', gridTemplateColumns: `${labelCol} minmax(0,1fr)`, columnGap: 1.5, rowGap: 0.5 }}>
                        {wait && <Field label="Waiting for">{wait}</Field>}
                        <Field label="Tool" mono>
                            {step.tool ?? '–'}
                        </Field>
                        <Field label="Request" mono>
                            {requestLine(step)}
                            {resolved && (
                                <Box data-testid="agent-plan-step-resolved" sx={{ color: 'text.secondary' }}>
                                    {`→ ${resolved}`}
                                </Box>
                            )}
                        </Field>
                        <Field label="Approval">{step.covered ? COVERED_TEXT : askLine(step)}</Field>
                        {showAttempts && (
                            <Field label="Attempts">
                                {step.max_attempts ? `${step.attempts ?? 0} of ${step.max_attempts}` : String(step.attempts ?? 0)}
                            </Field>
                        )}
                        {times.started !== undefined && <Field label="Started">{clockSeconds(times.started)}</Field>}
                        {times.finished !== undefined && <Field label="Finished">{clockSeconds(times.finished)}</Field>}
                        {times.durationMs !== undefined && <Field label="Duration">{hms(times.durationMs)}</Field>}
                    </Box>
                    {(rows.length > 0 || technical) && (
                        <Box>
                            <Typography sx={labelSx}>Arguments</Typography>
                            <StepArgsTable rows={rows} />
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                                <Button
                                    size="small"
                                    startIcon={<CodeIcon />}
                                    onClick={() => setJson((v) => !v)}
                                    aria-expanded={json}
                                    data-testid="agent-plan-step-json-toggle"
                                >
                                    {json ? 'Hide JSON' : 'Show JSON'}
                                </Button>
                                {json && (
                                    <Tooltip title={copied ? 'Copied' : 'Copy JSON'}>
                                        <IconButton
                                            size="small"
                                            aria-label="Copy JSON"
                                            onClick={() =>
                                                void copyText(technical).then((ok) => {
                                                    setCopied(ok);
                                                    setTimeout(() => setCopied(false), 1200);
                                                })
                                            }
                                        >
                                            <ContentCopyIcon sx={{ fontSize: 16 }} />
                                        </IconButton>
                                    </Tooltip>
                                )}
                            </Box>
                            {json && (
                                <Box component="pre" data-testid="agent-plan-step-json" sx={{ ...PRE_SX, maxHeight: 240 }}>
                                    {technical}
                                </Box>
                            )}
                        </Box>
                    )}
                    {phase === 'failed' && (
                        <ErrorBlock text={(step.result ?? '').trim() || 'The step failed.'} testId="agent-plan-step-error" />
                    )}
                    {phase === 'done' && (step.result || step.created_id || outputs.length > 0) && (
                        <Box data-testid="agent-plan-step-result">
                            <Typography sx={labelSx}>Result</Typography>
                            {step.result && (
                                <Typography sx={{ fontSize: 12, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
                                    {step.result}
                                </Typography>
                            )}
                            {step.created_id && (
                                <Typography sx={{ fontSize: 12 }}>
                                    {doneBefore}
                                    {createdHref ? (
                                        <Link href={createdHref} underline="always" sx={{ fontSize: 12 }}>
                                            {step.created_id}
                                        </Link>
                                    ) : (
                                        step.created_id
                                    )}
                                    {doneAfter}
                                </Typography>
                            )}
                            {outputs
                                .filter((o) => o.id !== step.created_id)
                                .map((o) => {
                                    const href = outputLink(o);
                                    const label = o.label || `${resourceNoun(o.resource)} ${o.id}`;
                                    return (
                                        <Typography key={`${o.resource}:${o.id}`} sx={{ fontSize: 12 }}>
                                            {href ? (
                                                <Link href={href} underline="always" sx={{ fontSize: 12 }}>
                                                    {label}
                                                </Link>
                                            ) : (
                                                label
                                            )}
                                        </Typography>
                                    );
                                })}
                        </Box>
                    )}
                    {check && (
                        <Box data-testid="agent-plan-step-check">
                            <Typography sx={labelSx}>Checks</Typography>
                            <Typography sx={{ fontSize: 12 }}>{check.line}</Typography>
                            {check.device && <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{check.device}</Typography>}
                        </Box>
                    )}
                    <Box>
                        <Typography sx={labelSx}>Activity</Typography>
                        <StepActivity
                            chatId={plan.chat_id || chatId}
                            planId={plan.id}
                            idx={step.idx}
                            reloadKey={`${step.state}|${step.attempts ?? 0}|${step.done_at ?? ''}`}
                        />
                    </Box>
                    {step.summary_proposed && <ProposedSummary summary={step.summary_proposed} testId="agent-plan-step-proposed" />}
                    {note && <AgentText label={AGENT_NOTE_LABEL} text={note} testId="agent-plan-step-note" />}
                    {extra}
                </Box>
            </Collapse>
        </Box>
    );
}
