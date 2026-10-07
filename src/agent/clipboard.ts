// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Copy button under an answer (issue #54): writes the answer's Markdown to the clipboard.

type ClipboardLike = { writeText: (text: string) => Promise<void> };
type DocumentLike = Pick<Document, 'createElement' | 'execCommand'> & { body: Pick<HTMLElement, 'appendChild'> };

/**
 * Writes text to the clipboard: the asynchronous Clipboard API where the page may use it (secure context), else the
 * old way through a hidden text field and `execCommand('copy')`. Resolves true when one of them worked.
 */
export async function copyText(
    text: string,
    env: { clipboard?: ClipboardLike; document?: DocumentLike } = {
        clipboard: typeof navigator !== 'undefined' ? navigator.clipboard : undefined,
        document: typeof document !== 'undefined' ? document : undefined,
    },
): Promise<boolean> {
    if (env.clipboard?.writeText) {
        try {
            await env.clipboard.writeText(text);
            return true;
        } catch {
            // denied or not focused: try the old way
        }
    }
    const doc = env.document;
    if (!doc) return false;
    const area = doc.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    doc.body.appendChild(area);
    try {
        area.select();
        return doc.execCommand('copy');
    } catch {
        return false;
    } finally {
        area.remove();
    }
}
