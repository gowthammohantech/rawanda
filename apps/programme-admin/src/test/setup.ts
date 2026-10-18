/** Vitest setup (jsdom): RTL cleanup, IndexedDB shim and the DOM APIs Radix needs. */
import "fake-indexeddb/auto";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

const g = globalThis as unknown as Record<string, unknown>;
g["ResizeObserver"] ??= ResizeObserverStub;

const proto = Element.prototype as unknown as Record<string, unknown>;
proto["hasPointerCapture"] ??= () => false;
proto["setPointerCapture"] ??= () => undefined;
proto["releasePointerCapture"] ??= () => undefined;
proto["scrollIntoView"] ??= () => undefined;

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

// React Router data routers build a `Request` with an AbortSignal on every navigation. Under
// jsdom the signal is jsdom's while `Request` is Node's (undici), which rejects it — drop it.
const NodeRequest = globalThis.Request;
class TestRequest extends NodeRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(input, init === undefined ? undefined : { ...init, signal: null });
  }
}
globalThis.Request = TestRequest;
