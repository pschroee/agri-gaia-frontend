// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Setup for the tests (vitest.config.ts). Most tests run in node and only check pure functions; the component
// smoke tests carry `// @vitest-environment jsdom` and render MUI, which asks for these interfaces. jsdom does
// not implement them, so without this file every render of a MUI component fails on `matchMedia is not a
// function` or on a missing ResizeObserver.

/* eslint-disable @typescript-eslint/no-explicit-any */

export {};

/** A MediaQueryList that always says "no": tests do not depend on a viewport width. */
function mediaQueryList(query: string): MediaQueryList {
    const list = {
        matches: false,
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
    };
    return list as unknown as MediaQueryList;
}

const g = globalThis as any;

if (typeof g.window !== 'undefined') {
    if (typeof g.window.matchMedia !== 'function') {
        g.window.matchMedia = mediaQueryList;
    }
    g.matchMedia = g.matchMedia ?? g.window.matchMedia;

    if (typeof g.ResizeObserver === 'undefined') {
        class ResizeObserverStub {
            observe() {
                /* nothing to observe in a test */
            }
            unobserve() {
                /* nothing to observe in a test */
            }
            disconnect() {
                /* nothing to observe in a test */
            }
        }
        g.ResizeObserver = ResizeObserverStub;
        g.window.ResizeObserver = ResizeObserverStub;
    }

    // Element.animate (Web Animations API) is missing in jsdom; planRegistry uses it for the card's highlight
    if (typeof g.Element !== 'undefined' && typeof g.Element.prototype.animate !== 'function') {
        g.Element.prototype.animate = () => ({ finished: Promise.resolve(), cancel: () => undefined });
    }

    if (typeof g.window.scrollTo !== 'function') {
        g.window.scrollTo = () => undefined;
    }
    if (typeof g.Element !== 'undefined' && typeof g.Element.prototype.scrollIntoView !== 'function') {
        g.Element.prototype.scrollIntoView = () => undefined;
    }
}
