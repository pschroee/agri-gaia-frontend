// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The files of an upload approval (gateway issue #164): the summary and the folders are drawn at once, the list of
// every file only when the user opens it, and the card shows the component only above ten files.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Approval } from '../types';
import { manifestHash, type UploadEntry, type UploadManifest } from '../uploads';
import ApprovalCard from './ApprovalCard';
import UploadFiles from './UploadFiles';

afterEach(cleanup);

const FOLDERS = ['a', 'b', 'c', 'd', 'e'];

const entriesOf = (n: number): UploadEntry[] =>
    Array.from({ length: n }, (_, i) => ({
        field: 'files',
        path: `/workspace/up/${FOLDERS[i % 5]}/img_${String(i).padStart(4, '0')}.png`,
        bytes: 100 + i,
        sha256: String(i % 10).repeat(64),
    }));

const manifestOf = (entries: UploadEntry[], hash = 'f'.repeat(64)): UploadManifest => ({
    files: entries.length,
    bytes: entries.reduce((n, e) => n + e.bytes, 0),
    root: '/workspace/up',
    folders: FOLDERS.map((f) => ({ path: f, files: entries.length / 5, bytes: 1000 })),
    extensions: [{ ext: '.png', files: entries.length }],
    manifest_sha256: hash,
});

const show = (data: UploadManifest, entries: UploadEntry[]) => {
    const load = vi.fn().mockResolvedValue(entries);
    render(<UploadFiles data={data} chatId="c1" approvalId="a1" load={load} />);
    return load;
};

describe('UploadFiles', () => {
    it('shows the summary at once and keeps the list of 500 files closed and unloaded', () => {
        const entries = entriesOf(500);
        const load = show(manifestOf(entries), entries);
        expect(screen.getByText(/^500 files/)).toBeTruthy();
        expect(screen.getByText('Show all 500 files')).toBeTruthy();
        expect(screen.queryAllByTestId('agent-upload-row')).toHaveLength(0);
        expect(load).not.toHaveBeenCalled();
    });

    it('loads and draws every row when opened, with the full hash in the tooltip text', async () => {
        const entries = entriesOf(500);
        const load = show(manifestOf(entries), entries);
        fireEvent.click(screen.getByText('Show all 500 files'));
        await waitFor(() => expect(screen.getAllByTestId('agent-upload-row')).toHaveLength(500));
        expect(load).toHaveBeenCalledWith('c1', 'a1');
        expect(screen.getAllByTestId('agent-upload-row')[0].textContent).toContain('a/img_0000.png');
    });

    it('warns when the list does not match the manifest hash', async () => {
        const entries = entriesOf(20);
        show(manifestOf(entries, '0'.repeat(64)), entries);
        fireEvent.click(screen.getByText('Show all 20 files'));
        await waitFor(() => expect(screen.getAllByTestId('agent-upload-row')).toHaveLength(20));
        if (await manifestHash(entries)) await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    });

    it('accepts a list that matches the hash', async () => {
        const entries = entriesOf(20);
        const hash = await manifestHash(entries);
        show(manifestOf(entries, hash ?? 'f'.repeat(64)), entries);
        fireEvent.click(screen.getByText('Show all 20 files'));
        await waitFor(() => expect(screen.getAllByTestId('agent-upload-row')).toHaveLength(20));
        if (hash) expect(screen.queryByRole('alert')).toBeNull();
    });

    it('draws 2 000 rows and five folders', async () => {
        const entries = entriesOf(2000);
        show(manifestOf(entries), entries);
        expect(screen.getByTestId('agent-upload-folders').querySelectorAll('tbody tr')).toHaveLength(5);
        fireEvent.click(screen.getByText('Show all 2000 files'));
        await waitFor(() => expect(screen.getAllByTestId('agent-upload-row')).toHaveLength(2000), { timeout: 5000 });
    });

    it('shows one file as one line without a collapsed list', async () => {
        const entries = entriesOf(1);
        const data = { ...manifestOf(entries), folders: [], extensions: [] };
        show(data, entries);
        expect(screen.queryByText(/Show all/)).toBeNull();
        await waitFor(() => expect(screen.getByText('/workspace/up/a/img_0000.png')).toBeTruthy());
    });
});

describe('ApprovalCard with uploads', () => {
    const onDecide = () => Promise.resolve();
    const approval = (uploads?: UploadManifest): Approval =>
        ({
            id: 'a1',
            chat_id: 'c1',
            kind: 'platform_write',
            via: 'cli',
            name: 'POST /datasets (multipart, 500 files)',
            size: 1,
            sha256: '',
            content_type: 'application/json',
            state: 'pending',
            created_at: '2026-10-20T10:00:00.000Z',
            summary: 'Upload a new dataset "d" with 500 files',
            uploads,
        } as Approval);

    it('shows the files only for an approval with many uploads', () => {
        const many = manifestOf(entriesOf(500));
        render(<ApprovalCard approvals={[approval(many)]} onDecide={onDecide} />);
        expect(screen.getByTestId('agent-upload-files')).toBeTruthy();
        cleanup();
        render(<ApprovalCard approvals={[approval(undefined)]} onDecide={onDecide} />);
        expect(screen.queryByTestId('agent-upload-files')).toBeNull();
        cleanup();
        render(<ApprovalCard approvals={[approval(manifestOf(entriesOf(5)))]} onDecide={onDecide} />);
        expect(screen.queryByTestId('agent-upload-files')).toBeNull();
    });
});
