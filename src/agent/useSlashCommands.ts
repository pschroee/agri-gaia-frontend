// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { KeyboardEvent, useState } from 'react';

import { activeIndex, initialMenu, menuKey, menuOpen, pickedText, slashItems } from './commands';
import type { MenuState, SlashItem } from './commands';
import type { Command } from './types';

export type SlashMenu = {
    open: boolean;
    items: SlashItem[];
    /** Set while values of a command are suggested (/model, /effort). */
    argsOf?: Command;
    active: number;
    setActive: (i: number) => void;
    pick: (item: SlashItem) => void;
    close: () => void;
    /** Key handling of the input field; true if the list consumed the key. */
    onKeyDown: (e: KeyboardEvent) => boolean;
};

/** State of the command list: opens on "/" at the start of the input, filters while typing (logic in commands.ts). */
export function useSlashCommands(commands: Command[], text: string, setText: (t: string) => void): SlashMenu {
    const [state, setState] = useState<MenuState>(initialMenu);
    const { items, argsOf } = slashItems(commands, text);
    const open = menuOpen(state, text, items.length);
    const active = activeIndex(state, text, items.length);

    const pick = (item: SlashItem) => {
        setText(pickedText(item));
        setState((s) => ({ ...s, active: 0, activeFor: '' }));
    };

    const onKeyDown = (e: KeyboardEvent) => {
        const r = menuKey(state, text, items.length, {
            key: e.key,
            shiftKey: e.shiftKey,
            isComposing: e.nativeEvent.isComposing,
        });
        if (!r.handled) return false;
        e.preventDefault();
        // Esc closes the list, not the panel or a dialog around it
        e.stopPropagation();
        setState(r.state);
        if (r.pick !== undefined) pick(items[r.pick]);
        return true;
    };

    return {
        open,
        items,
        argsOf,
        active,
        setActive: (i) => setState((s) => ({ ...s, active: i, activeFor: text })),
        pick,
        close: () => setState((s) => ({ ...s, dismissed: text })),
        onKeyDown,
    };
}
