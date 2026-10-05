// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Preferred language of the browser for POST /agent/api/chats (field `language`). The agent answers in the
// language of the user's latest message and falls back to this only when the message shows none. Checked
// with the gateway's rule (BCP 47, letters, digits, hyphens, at most 35 characters) so an odd browser value
// never makes chat creation fail.

const BCP47 = /^[A-Za-z]+(-[A-Za-z0-9]+)*$/;

/** navigator.language if present and valid, otherwise undefined (the gateway then has no preference). */
export function browserLanguage(): string | undefined {
    const tag = typeof navigator !== 'undefined' ? navigator.language?.trim() : undefined;
    return tag && tag.length <= 35 && BCP47.test(tag) ? tag : undefined;
}
