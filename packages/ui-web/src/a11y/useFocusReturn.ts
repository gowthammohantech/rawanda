import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * For custom overlays (Radix dialogs already do this): while `active` is false the hook tracks
 * the last focused element; when `active` turns false again, focus returns to it.
 * Layout effects are used so tracking stops before an overlay's `autoFocus` runs.
 */
export function useFocusReturn(active: boolean): () => void {
  const previous = useRef<HTMLElement | null>(null);
  const wasActive = useRef(false);

  useLayoutEffect(() => {
    if (active) {
      wasActive.current = true;
      return;
    }
    if (wasActive.current) {
      wasActive.current = false;
      const target = previous.current;
      if (target !== null && target.isConnected) target.focus();
    }
    const current = document.activeElement;
    previous.current = current instanceof HTMLElement ? current : null;
    const track = (event: FocusEvent) => {
      if (event.target instanceof HTMLElement) previous.current = event.target;
    };
    document.addEventListener("focusin", track);
    return () => document.removeEventListener("focusin", track);
  }, [active]);

  return useCallback(() => {
    const target = previous.current;
    if (target !== null && target.isConnected) target.focus();
  }, []);
}
