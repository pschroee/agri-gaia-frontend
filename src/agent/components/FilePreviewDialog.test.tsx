// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The file preview renders Markdown by default and switches to the source (issue #264); other text stays as it is.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import FilePreviewDialog from './FilePreviewDialog';

const CARD = '# Model Card\n\nA **small** classifier.\n\n| Metric | Value |\n|---|---|\n| acc | 0.91 |\n';

/** fetch answering with a streamed body, as readText expects. */
function stubFetch(text: string) {
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({
            ok: true,
            status: 200,
            body: new ReadableStream<Uint8Array>({
                start(c) {
                    c.enqueue(new TextEncoder().encode(text));
                    c.close();
                },
            }),
        })),
    );
}

beforeEach(() => stubFetch(CARD));
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

const draw = (name: string) =>
    render(<FilePreviewDialog chatId="c1" target={{ name, kind: 'output', preview: 'text' }} onClose={() => undefined} />);

describe('Markdown in the file preview', () => {
    it('shows the rendered text first, without the markup characters', async () => {
        draw('MODEL_CARD.md');
        const view = await screen.findByTestId('agent-file-preview-markdown');
        expect(view.textContent).toContain('Model Card');
        expect(view.textContent).not.toContain('# ');
        expect(view.textContent).not.toContain('**');
        expect(view.textContent).toContain('0.91');
        expect(screen.queryByTestId('agent-file-preview-text')).toBeNull();
        expect(screen.getByTestId('agent-file-preview-mode')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Rendered' }).getAttribute('aria-pressed')).toBe('true');
    });

    it('switches to the source and back', async () => {
        draw('MODEL_CARD.md');
        await screen.findByTestId('agent-file-preview-markdown');
        fireEvent.click(screen.getByRole('button', { name: 'Source' }));
        const pre = screen.getByTestId('agent-file-preview-text');
        expect(pre.tagName).toBe('PRE');
        expect(pre.textContent).toBe(CARD);
        expect(screen.queryByTestId('agent-file-preview-markdown')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Rendered' }));
        expect(screen.getByTestId('agent-file-preview-markdown')).toBeTruthy();
    });

    it('offers no switch for other text files', async () => {
        stubFetch('plain notes');
        draw('notes.txt');
        const pre = await screen.findByTestId('agent-file-preview-text');
        expect(pre.textContent).toBe('plain notes');
        await waitFor(() => expect(screen.queryByTestId('agent-file-preview-mode')).toBeNull());
        expect(screen.queryByTestId('agent-file-preview-markdown')).toBeNull();
    });
});
