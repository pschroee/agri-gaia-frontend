// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { useEffect, useMemo, useRef, useState } from 'react';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { useAgent } from '../AgentContext';
import { AgentApiError, agentApi } from '../api';
import { DEFAULT_DELEGATION_HOURS, DELEGATION_TEMPLATES, delegationFrom } from '../delegationTemplates';
import { variantLabel } from '../format';
import { browserLanguage } from '../language';
import { allowedLevels, effortAfterCreate, effortLabel, hasLevelChoice, levelsByModel, priceHint } from '../modelChoice';
import type { Chat, Model, Variant, VariantId } from '../types';
import { blockSx } from './tokens';

type Props = { open: boolean; onClose: () => void; initialMessage?: string };

/**
 * New chat: model and thinking level, variant (MCP, CLI, REST API), delegation template with expiry, title and first
 * message. The gateway takes no thinking level when creating; a chosen one is set right after, before the first
 * message goes out. Levels come from the user's other chats with that model (the model list carries none).
 */
export default function NewChatDialog({ open, onClose, initialMessage }: Props) {
    const { addChat, chats } = useAgent();
    const [models, setModels] = useState<Model[]>([]);
    const [variants, setVariants] = useState<Variant[]>([]);
    const [model, setModel] = useState('');
    /** '' = the model's default. */
    const [effort, setEffort] = useState('');
    const [variant, setVariant] = useState<VariantId | ''>('');
    const [templateId, setTemplateId] = useState('none');
    const [hours, setHours] = useState(DEFAULT_DELEGATION_HOURS);
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>();
    const template = DELEGATION_TEMPLATES.find((t) => t.id === templateId);
    // chat created in an earlier attempt whose first message failed: a retry only sends
    const created = useRef<Chat>();
    const known = useMemo(() => levelsByModel(chats), [chats]);
    const levels = allowedLevels(model, undefined, known);
    const levelChoice = hasLevelChoice(levels);

    // a level the newly chosen model does not report falls back to the default
    useEffect(() => {
        if (effort && !levels.includes(effort)) setEffort('');
    }, [effort, levels]);

    useEffect(() => {
        if (!open) return;
        setError(undefined);
        created.current = undefined;
        setMessage(initialMessage ?? '');
        Promise.all([agentApi.models(), agentApi.variants()])
            .then(([m, v]) => {
                setModels(Array.isArray(m) ? m : []);
                setVariants(Array.isArray(v) ? v : []);
                setModel((cur) => cur || (m.find((x) => x.default) ?? m[0])?.id || '');
                setVariant((cur) => cur || v[0]?.id || '');
            })
            .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    }, [open, initialMessage]);

    const submit = async () => {
        setBusy(true);
        setError(undefined);
        const first = message.trim();
        // with a level to set, the first message waits until the level is in place
        const deferMessage = !!effort && !!first;
        let chat = created.current;
        try {
            if (!chat) {
                chat = await agentApi.createChat({
                    model: model || undefined,
                    variant: variant || undefined,
                    title: title.trim() || undefined,
                    message: deferMessage ? undefined : first || undefined,
                    delegation: delegationFrom(template, hours),
                    language: browserLanguage(),
                });
                created.current = chat;
                addChat(chat);
                const level = effortAfterCreate(effort, chat);
                if (level) {
                    try {
                        chat = await agentApi.setEffort(chat.id, level);
                        created.current = chat;
                        addChat(chat);
                    } catch {
                        // not fatal: the input row shows the level pi actually uses
                    }
                }
            }
            if (deferMessage) await agentApi.sendMessage(chat.id, first);
            created.current = undefined;
            setTitle('');
            setMessage('');
            onClose();
        } catch (e) {
            const text = e instanceof Error ? e.message : String(e);
            if (chat) setError(`The chat was created, but the first message was not sent: ${text}`);
            else if (e instanceof AgentApiError && e.status === 503)
                setError('No free agent slot right now, please wait a moment.');
            else setError(text);
        } finally {
            setBusy(false);
        }
    };

    const selectedVariant = variants.find((v) => v.id === variant);

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
            <DialogTitle>New chat</DialogTitle>
            <DialogContent>
                <Box sx={{ display: 'grid', gap: 2.5, pt: 1 }}>
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 180px', gap: 2 }}>
                        <TextField
                            select
                            label="Model"
                            value={model}
                            onChange={(e) => setModel(e.target.value)}
                            fullWidth
                            disabled={!!created.current}
                            helperText={(() => {
                                const m = models.find((x) => x.id === model);
                                return (m && priceHint(m)) || ' ';
                            })()}
                        >
                            {models.map((m) => (
                                <MenuItem key={m.id} value={m.id}>
                                    {m.name}
                                    <Typography component="span" sx={{ ml: 1, color: 'text.secondary', fontSize: 13 }}>
                                        {m.id}
                                    </Typography>
                                </MenuItem>
                            ))}
                        </TextField>
                        <TextField
                            select
                            label="Thinking level"
                            value={effort}
                            onChange={(e) => setEffort(e.target.value)}
                            fullWidth
                            disabled={!levelChoice || !!created.current}
                            helperText={levelChoice ? ' ' : 'Known once a chat has used this model.'}
                            SelectProps={{ displayEmpty: true }}
                            InputLabelProps={{ shrink: true }}
                        >
                            <MenuItem value="">Model default</MenuItem>
                            {levels.map((l) => (
                                <MenuItem key={l} value={l}>
                                    {effortLabel(l)}
                                </MenuItem>
                            ))}
                        </TextField>
                    </Box>
                    <TextField
                        select
                        label="Connection"
                        value={variant}
                        onChange={(e) => setVariant(e.target.value as VariantId)}
                        fullWidth
                        helperText={
                            selectedVariant && selectedVariant.tools.length > 0
                                ? `Tools: ${selectedVariant.tools.join(', ')}`
                                : 'How the agent talks to the platform.'
                        }
                    >
                        {variants.map((v) => (
                            <MenuItem key={v.id} value={v.id}>
                                {variantLabel(v)}
                            </MenuItem>
                        ))}
                    </TextField>
                    <Box sx={{ ...blockSx, p: 2, display: 'grid', gap: 1.5 }}>
                        <Typography sx={{ fontSize: 14, fontWeight: 500 }}>Rights of the agent (delegation)</Typography>
                        <TextField
                            select
                            size="small"
                            label="Template"
                            value={templateId}
                            onChange={(e) => setTemplateId(e.target.value)}
                            fullWidth
                        >
                            {DELEGATION_TEMPLATES.map((t) => (
                                <MenuItem key={t.id} value={t.id}>
                                    {t.label}
                                </MenuItem>
                            ))}
                        </TextField>
                        {template && (
                            <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>
                                {template.description}
                            </Typography>
                        )}
                        {template?.rules && (
                            <TextField
                                size="small"
                                type="number"
                                label="Valid for (hours)"
                                value={hours}
                                onChange={(e) => setHours(Math.min(72, Math.max(1, Number(e.target.value) || 1)))}
                                inputProps={{ min: 1, max: 72 }}
                                helperText="Calls outside the rules are blocked."
                                sx={{ maxWidth: 220 }}
                            />
                        )}
                    </Box>
                    <TextField
                        label="Title (optional)"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        fullWidth
                    />
                    <TextField
                        label="First message (optional)"
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        fullWidth
                        multiline
                        minRows={3}
                    />
                    {error && <Alert severity="error">{error}</Alert>}
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="contained" disabled={busy} onClick={() => void submit()}>
                    {busy ? 'Creating …' : created.current ? 'Send first message' : 'Create chat'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
