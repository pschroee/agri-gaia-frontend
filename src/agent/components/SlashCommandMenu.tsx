// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { useEffect, useRef } from 'react';

import Box from '@mui/material/Box';
import ClickAwayListener from '@mui/material/ClickAwayListener';
import Paper from '@mui/material/Paper';
import Popper from '@mui/material/Popper';
import Typography from '@mui/material/Typography';
import CheckIcon from '@mui/icons-material/Check';

import { itemKey, SOURCE_LABEL } from '../commands';
import type { SlashMenu } from '../useSlashCommands';

type Props = {
    menu: SlashMenu;
    /** The input field's box; the list opens above it, as wide as it. */
    anchor: HTMLElement | null;
    /** id of the list, referenced by the input (aria-controls, aria-activedescendant). */
    id: string;
};

export const optionId = (listId: string, i: number) => `${listId}-opt-${i}`;

/**
 * Suggestion list of slash commands right above the input field. Focus stays in the field: arrow keys move, Enter or
 * Tab take the entry, Esc closes (handled by useSlashCommands); the mouse works too.
 */
export default function SlashCommandMenu({ menu, anchor, id }: Props) {
    const listRef = useRef<HTMLUListElement>(null);
    const open = menu.open && !!anchor;

    // keep the highlighted entry visible while moving with the arrow keys
    useEffect(() => {
        if (!open) return;
        const el = listRef.current?.querySelector<HTMLElement>(`#${CSS.escape(optionId(id, menu.active))}`);
        el?.scrollIntoView?.({ block: 'nearest' });
    }, [open, id, menu.active]);

    const head = menu.argsOf
        ? `/${menu.argsOf.name}: choose a value`
        : menu.items.length === 1
        ? '1 command'
        : `${menu.items.length} commands`;

    return (
        <Popper
            open={open}
            anchorEl={anchor}
            placement="top-start"
            modifiers={[{ name: 'offset', options: { offset: [0, 6] } }]}
            sx={{ zIndex: (t) => t.zIndex.modal + 1, width: anchor?.offsetWidth }}
        >
            <ClickAwayListener onClickAway={menu.close}>
                <Paper elevation={6} sx={{ overflow: 'hidden', border: 1, borderColor: 'divider' }}>
                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'baseline',
                            gap: 1,
                            px: 1.5,
                            py: 0.75,
                            borderBottom: 1,
                            borderColor: 'divider',
                            bgcolor: 'grey.50',
                        }}
                    >
                        <Typography sx={{ fontSize: 11.5, fontWeight: 500, color: 'text.secondary', flex: 1 }}>
                            {head}
                        </Typography>
                        <Typography sx={{ fontSize: 11, color: 'text.disabled', whiteSpace: 'nowrap' }}>
                            ↑↓ · Enter/Tab · Esc
                        </Typography>
                    </Box>
                    <Box
                        component="ul"
                        ref={listRef}
                        id={id}
                        role="listbox"
                        aria-label={menu.argsOf ? `Values for /${menu.argsOf.name}` : 'Slash commands'}
                        sx={{ listStyle: 'none', m: 0, p: 0.5, maxHeight: 264, overflowY: 'auto' }}
                    >
                        {menu.items.map((item, i) => {
                            const selected = i === menu.active;
                            const { command, option } = item;
                            return (
                                <Box
                                    component="li"
                                    key={itemKey(item)}
                                    id={optionId(id, i)}
                                    role="option"
                                    aria-selected={selected}
                                    data-command={itemKey(item)}
                                    // keep the focus in the input field
                                    onMouseDown={(e) => e.preventDefault()}
                                    onMouseEnter={() => menu.setActive(i)}
                                    onClick={() => menu.pick(item)}
                                    sx={{
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: 1,
                                        px: 1,
                                        py: 0.625,
                                        borderRadius: 1,
                                        cursor: 'pointer',
                                        bgcolor: selected ? 'action.selected' : undefined,
                                    }}
                                >
                                    <Box sx={{ flex: 1, minWidth: 0 }}>
                                        <Typography
                                            component="div"
                                            sx={{
                                                fontFamily: 'monospace',
                                                fontSize: 12.5,
                                                color: 'text.primary',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                            }}
                                        >
                                            {option ? option.value : `/${command.name}`}
                                            {!option && command.args && (
                                                <Box component="span" sx={{ ml: 0.75, color: 'text.secondary' }}>
                                                    {command.args}
                                                </Box>
                                            )}
                                        </Typography>
                                        {(option ? option.label : command.description) && (
                                            <Typography
                                                sx={{
                                                    fontSize: 11.5,
                                                    color: 'text.secondary',
                                                    lineHeight: 1.35,
                                                    display: '-webkit-box',
                                                    WebkitLineClamp: selected ? 3 : 1,
                                                    WebkitBoxOrient: 'vertical',
                                                    overflow: 'hidden',
                                                }}
                                            >
                                                {option ? option.label : command.description}
                                            </Typography>
                                        )}
                                    </Box>
                                    {option ? (
                                        option.current && (
                                            <Box
                                                sx={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 0.25,
                                                    fontSize: 11,
                                                    color: 'primary.main',
                                                    flex: 'none',
                                                    mt: 0.25,
                                                }}
                                            >
                                                <CheckIcon sx={{ fontSize: 13 }} />
                                                current
                                            </Box>
                                        )
                                    ) : (
                                        <Box
                                            component="span"
                                            sx={{
                                                flex: 'none',
                                                mt: 0.25,
                                                px: 0.75,
                                                borderRadius: 999,
                                                border: 1,
                                                borderColor: 'divider',
                                                fontSize: 10.5,
                                                lineHeight: '16px',
                                                color: 'text.secondary',
                                            }}
                                        >
                                            {SOURCE_LABEL[command.source] ?? command.source}
                                        </Box>
                                    )}
                                </Box>
                            );
                        })}
                    </Box>
                </Paper>
            </ClickAwayListener>
        </Popper>
    );
}
