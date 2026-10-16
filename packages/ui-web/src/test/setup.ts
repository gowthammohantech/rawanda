/**
 * Vitest setup for @laif/ui-web (jsdom): vitest-axe matchers, RTL cleanup and the DOM APIs
 * Radix needs that jsdom lacks.
 */
import { cleanup } from "@testing-library/react";
import { afterEach, expect } from "vitest";
import * as axeMatchers from "vitest-axe/matchers";

expect.extend(axeMatchers);

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

const g = globalThis as unknown as Record<string, unknown>;
g["ResizeObserver"] ??= ResizeObserverStub;
g["DOMRect"] ??= class {
  static fromRect() {
    return { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 };
  }
};

const proto = Element.prototype as unknown as Record<string, unknown>;
proto["hasPointerCapture"] ??= () => false;
proto["setPointerCapture"] ??= () => undefined;
proto["releasePointerCapture"] ??= () => undefined;
proto["scrollIntoView"] ??= () => undefined;

// axe's colour-contrast check probes <canvas>; jsdom has no canvas (contrast is unit-tested
// on the tokens instead, see tokens.contrast.test.ts).
HTMLCanvasElement.prototype.getContext = (() =>
  null) as typeof HTMLCanvasElement.prototype.getContext;

if (typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
