/**
 * `window.matchMedia` as React state (CLN-11 responsive layouts). Used where a layout must
 * change STRUCTURE, not just styling (icon rail vs full sidebar, the decision page's Evidence
 * disclosure), so the accessibility tree only contains the variant that is visible. False when
 * `matchMedia` is unavailable.
 */
import { useCallback, useSyncExternalStore } from "react";

/** Spec §7 breakpoints (px): md 768 · lg 1024 · xl 1280 · 2xl 1440. */
export const MEDIA = {
  /** 1024–1279: the sidebar collapses to an icon rail. */
  rail: "(min-width: 1024px) and (max-width: 1279.98px)",
  /** Below 1024: single column, drawers full screen, decision evidence in a disclosure. */
  belowLg: "(max-width: 1023.98px)",
} as const;

function mediaList(query: string): MediaQueryList | null {
  return typeof window === "undefined" || typeof window.matchMedia !== "function"
    ? null
    : window.matchMedia(query);
}

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = mediaList(query);
      if (list === null) return () => undefined;
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => mediaList(query)?.matches ?? false,
    () => false,
  );
}
