// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Unit tests (npm test). Separate from vite.config.ts so that the build is not affected.
//
// Most tests check pure functions and run in a plain node environment. The component smoke tests (*.test.tsx,
// autonomy E4) render MUI, which needs a DOM: they carry a `// @vitest-environment jsdom` docblock, and the setup
// file gives that DOM the two browser interfaces MUI asks for and jsdom does not have.
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
        environment: 'node',
        setupFiles: ['src/testing/dom.ts'],
        // no file runs another's leaked globals
        isolate: true,
        // The cards render clock times in the local zone, so their expectations only hold in a fixed one; the
        // tests are written against UTC. Without this the suite passes in the image (UTC) and fails on a Mac in
        // CEST — measured on 16.10.2026, eight cases.
        env: { TZ: 'UTC' },
    },
});
