/** Vitest setup (jsdom + react-native-web): RTL cleanup, IndexedDB shim, matchMedia (DOM files only). */
import "fake-indexeddb/auto";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

const hasDom = typeof window !== "undefined";

afterEach(() => {
  if (!hasDom) return; // `@vitest-environment node` files (SQLite integration tests)
  cleanup();
  window.localStorage.clear();
});

if (hasDom && typeof window.matchMedia !== "function") {
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
