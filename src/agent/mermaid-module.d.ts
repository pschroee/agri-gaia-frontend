// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The part of mermaid's API the agent UI uses. mermaidLoad.ts imports the package's ESM entry by its file path
// (the same file as the package's default export), so TypeScript does not load mermaid's own types: they pull in
// @types/d3, which TypeScript 4.9 of this project cannot parse (const type parameters of TypeScript 5).
declare module 'mermaid/dist/mermaid.core.mjs' {
    const mermaid: {
        initialize: (config: import('./mermaid').MermaidConfig) => void;
        render: (id: string, code: string) => Promise<{ svg: string }>;
    };
    export default mermaid;
}
