// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The plan dialog (issue #221): the plan of a chat in full, opened from the chip in the status row. It reads only;
// decisions and controls (pause, stop job, single approvals) stay in the plan card in the chat, which "Show in chat"
// jumps to. The plans tab (#223) uses the same dialog with `onOpenChat` and `chatTitle`.

import { useEffect, useRef, useState } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Typography from '@mui/material/Typography';
import ChatOutlinedIcon from '@mui/icons-material/ChatOutlined';
import CloseIcon from '@mui/icons-material/Close';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';

import { agentTitle, pendingStepOf, stepCount } from '../../plan';
import type { Plan } from '../../plan';
import { headerPlan, planEntryTitle } from '../../planButton';
import { planLabel } from '../../plan';
import { AGENT_TITLE_LABEL } from '../../planText';
import { planCardInDom, scrollToPlanCard, useShownPlanCards } from '../../planRegistry';
import { AgentText, StateChip } from '../PlanCard';
import { agentColors } from '../tokens';
import PlanStepList from './PlanStepList';
import { PlanHeadBand, usePlanDetailData } from './PlanDetail';

const NO_PENDING: ReadonlySet<string> = new Set();

/** Newest plan first, as the choice lists them. */
const newestFirst = (plans: Plan[]): Plan[] =>
    [...plans].sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0));

/** The line under a step's number when a single approval waits in the chat. */
export const approvalWaitText = (idx: number): string => `Step ${idx} waits for your approval in the chat.`;

export default function PlanDialog({
    open,
    onClose,
    chatId,
    plans,
    planId,
    pending = NO_PENDING,
    onShowInChat,
    onOpenChat,
    chatTitle,
}: {
    open: boolean;
    onClose: () => void;
    chatId: string;
    plans: Plan[];
    /** The plan to show first; else the one the status row shows. */
    planId?: string;
    /** Approvals still pending, by id (a step that waits for one is named in the foot). */
    pending?: ReadonlySet<string>;
    /** Replaces the jump to the card in the chat (the plans tab brings its own). */
    onShowInChat?: (planId: string) => void;
    /** The dialog is not opened from the chat: the button opens the chat instead of showing the card. */
    onOpenChat?: (plan: Plan) => void;
    /** Names the chat of the plan in a third head line. */
    chatTitle?: string;
}) {
    const [chosen, setChosen] = useState<string | undefined>(planId);
    useEffect(() => setChosen(planId), [planId, open]);
    const shown = useShownPlanCards();
    const afterClose = useRef<(() => void) | undefined>(undefined);
    const ordered = newestFirst(plans);
    const plan =
        ordered.find((p) => p.id === chosen) ?? ordered.find((p) => p.id === planId) ?? headerPlan(plans, Date.now(), pending);

    const jump = onShowInChat ?? (plan && (shown.has(plan.id) || (open && planCardInDom(plan.id))) ? scrollToPlanCard : undefined);
    return (
        <Dialog
            open={open && !!plan}
            onClose={onClose}
            fullWidth
            maxWidth="md"
            scroll="paper"
            aria-labelledby="agent-plan-dialog-title"
            data-testid="agent-plan-dialog"
            PaperProps={{ sx: { height: 'min(860px, calc(100vh - 64px))' } }}
            TransitionProps={{
                onExited: () => {
                    const run = afterClose.current;
                    afterClose.current = undefined;
                    run?.();
                },
            }}
        >
            {plan && (
                <PlanDialogBody
                    plan={plan}
                    plans={ordered}
                    chatId={chatId}
                    pending={pending}
                    chatTitle={chatTitle}
                    onChoose={setChosen}
                    onClose={onClose}
                    onOpenChat={onOpenChat}
                    onJump={
                        jump
                            ? () => {
                                  afterClose.current = () => jump(plan.id);
                                  onClose();
                              }
                            : undefined
                    }
                />
            )}
        </Dialog>
    );
}

function PlanDialogBody({
    plan,
    plans,
    chatId,
    pending,
    chatTitle,
    onChoose,
    onClose,
    onOpenChat,
    onJump,
}: {
    plan: Plan;
    plans: Plan[];
    chatId: string;
    pending: ReadonlySet<string>;
    chatTitle?: string;
    onChoose: (id: string) => void;
    onClose: () => void;
    onOpenChat?: (plan: Plan) => void;
    onJump?: () => void;
}) {
    // the jobs and checks are read only while the dialog stands open
    const { jobs, checks } = usePlanDetailData(chatId, true);
    const [, tick] = useState(0);
    useEffect(() => {
        const t = setInterval(() => tick((n) => n + 1), 15000);
        return () => clearInterval(t);
    }, []);
    const title = agentTitle(plan);
    const asking = pendingStepOf(plan, pending);
    return (
        <>
            <DialogTitle component="div" sx={{ px: 3, py: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <FactCheckOutlinedIcon sx={{ fontSize: 22, color: agentColors.green }} aria-hidden />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography id="agent-plan-dialog-title" component="h2" sx={{ fontSize: 16, fontWeight: 600 }}>
                        Plan · {stepCount(plan.steps.length)}
                    </Typography>
                    {title && <AgentText label={AGENT_TITLE_LABEL} text={title} testId="agent-plan-dialog-agent-title" />}
                    {chatTitle && (
                        <Typography data-testid="agent-plan-dialog-chat" sx={{ fontSize: 12.5, color: 'text.secondary', mt: 0.5 }}>
                            {`Chat: ${chatTitle}`}
                        </Typography>
                    )}
                </Box>
                <StateChip plan={plan} layout="page" pending={pending} />
                {plans.length > 1 && (
                    <Select
                        size="small"
                        value={plan.id}
                        onChange={(e) => onChoose(e.target.value)}
                        inputProps={{ 'aria-label': 'Choose plan', 'data-testid': 'agent-plan-dialog-select' }}
                        SelectDisplayProps={{ 'aria-label': 'Choose plan' }}
                        sx={{ minWidth: 260, fontSize: 13 }}
                    >
                        {plans.map((p) => (
                            <MenuItem key={p.id} value={p.id} sx={{ fontSize: 13 }}>
                                {`${planEntryTitle(p)} · ${planLabel(p, Date.now())}`}
                            </MenuItem>
                        ))}
                    </Select>
                )}
                <IconButton aria-label="Close" onClick={onClose} edge="end">
                    <CloseIcon />
                </IconButton>
            </DialogTitle>
            <PlanHeadBand plan={plan} bordered />
            <DialogContent sx={{ px: 3, py: 2 }}>
                <PlanStepList plan={plan} jobs={jobs} checks={checks} pending={pending} variant="detail" chatId={chatId} />
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 1.5, borderTop: 1, borderColor: 'divider' }}>
                {asking && (
                    <Typography
                        data-testid="agent-plan-dialog-asking"
                        sx={{ fontSize: 12.5, color: agentColors.amberText, mr: 'auto' }}
                    >
                        {approvalWaitText(asking.idx)}
                    </Typography>
                )}
                {onOpenChat ? (
                    <Button startIcon={<ChatOutlinedIcon />} onClick={() => onOpenChat(plan)} data-testid="agent-plan-dialog-open-chat">
                        Open chat
                    </Button>
                ) : (
                    onJump && (
                        <Button startIcon={<ChatOutlinedIcon />} onClick={onJump} data-testid="agent-plan-dialog-show">
                            Show in chat
                        </Button>
                    )
                )}
                <Button variant="contained" disableElevation onClick={onClose}>
                    Close
                </Button>
            </DialogActions>
        </>
    );
}
