/**
 * Route-change focus (ADM-09 task 7): after a navigation to another page (pathname change — not
 * a filter change), focus moves to the page's `h1` inside `<main>` so keyboard and screen-reader
 * users start at the new page title (lazy pages: waits up to ~2 s for the heading). The first
 * render keeps the browser's default focus (the skip link stays the first stop).
 */
import { useEffect, useRef } from "react";
import { useLocation } from "react-router";

import { disarmDraftRestore } from "../lib/drafts.ts";

export function focusPageHeading(root: ParentNode = document): boolean {
  const heading = root.querySelector<HTMLElement>("main h1");
  if (heading === null) return false;
  if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
  heading.focus({ preventScroll: false });
  return true;
}

export function useRouteFocus(): void {
  const { pathname } = useLocation();
  const previous = useRef(pathname);
  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    // ADM-09: restored drafts are offered on the page reached right after a re-login only.
    disarmDraftRestore();
    let frames = 0;
    let handle = 0;
    const attempt = () => {
      if (focusPageHeading() || frames > 120) return;
      frames += 1;
      handle = requestAnimationFrame(attempt);
    };
    attempt();
    return () => cancelAnimationFrame(handle);
  }, [pathname]);
}
