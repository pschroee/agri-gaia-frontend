// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Opens the plan dialog (issue #221) for a run a plan started: "Plan step 4" in a row of the overview and "Show plan"
// in the head of a detail (gateway issue #227). The plans of the chat are read when the link is used; the dialog is
// only used through its props.

import type { ReactNode } from 'react';
import { useCallback, useState } from 'react';

import { agentApi } from '../../api';
import type { Plan } from '../../plan';
import PlanDialog from '../plan/PlanDialog';

type Shown = { chatId: string; planId: string; chatTitle?: string; plans: Plan[] };

export function usePlanDialog(onOpenChat: (chatId: string) => void): {
    openPlan: (chatId: string, planId: string, chatTitle?: string) => void;
    dialog: ReactNode;
} {
    const [shown, setShown] = useState<Shown>();
    const openPlan = useCallback((chatId: string, planId: string, chatTitle?: string) => {
        agentApi
            .plans(chatId)
            .then((plans) => setShown({ chatId, planId, chatTitle, plans }))
            .catch(() => setShown({ chatId, planId, chatTitle, plans: [] }));
    }, []);
    const dialog = shown ? (
        <PlanDialog
            open
            onClose={() => setShown(undefined)}
            chatId={shown.chatId}
            plans={shown.plans}
            planId={shown.planId}
            chatTitle={shown.chatTitle}
            onOpenChat={() => onOpenChat(shown.chatId)}
        />
    ) : null;
    return { openPlan, dialog };
}
