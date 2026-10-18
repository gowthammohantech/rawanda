/**
 * Native accessibility assertions (CTZ-09 task 3 / 12) for react-native-web renders in Vitest:
 * `expectMinTouchTarget()` (≥ 44 × 44 pt hit area from the computed layout floor, `hitSlop`
 * excluded — react-native-web drops it), `queryPressables()` and `walkAllRoutes()` (render
 * every route of an app with one visitor, collecting failures per route).
 *
 * No React Native import: works on any DOM produced by react-native-web.
 */
import { expect } from "vitest";

/** WCAG 2.5.5 / Apple HIG / Material minimum target (same value as `@laif/ui-native`). */
export const MIN_TOUCH_TARGET = 44;

/** Roles that make an element a pressable for the touch-target audit. */
export const PRESSABLE_ROLES = ["button", "checkbox", "radio", "switch", "tab", "link"] as const;

const px = (value: string): number => {
  const n = parseFloat(value);
  return Number.isNaN(n) ? 0 : n;
};

/** Computed hit area of a rendered pressable (max of `min-*` and explicit size). */
export function hitArea(element: Element): { width: number; height: number } {
  const style = getComputedStyle(element);
  return {
    width: Math.max(px(style.minWidth), px(style.width)),
    height: Math.max(px(style.minHeight), px(style.height)),
  };
}

/** Accessible name as a screen reader would read it (aria-label, else text). */
export function accessibleName(element: Element): string {
  return (element.getAttribute("aria-label") ?? element.textContent ?? "").trim();
}

/**
 * Asserts the element is a ≥ `min` × `min` touch target AND has an accessible name.
 * Failure messages name the element so a screen walk points at the offender.
 */
export function expectMinTouchTarget(element: Element, min: number = MIN_TOUCH_TARGET): void {
  const name = accessibleName(element);
  const where = name === "" ? element.outerHTML.slice(0, 120) : name;
  expect(name, `accessible name of ${where}`).not.toBe("");
  const area = hitArea(element);
  expect(area.width, `touch target width of "${where}"`).toBeGreaterThanOrEqual(min);
  expect(area.height, `touch target height of "${where}"`).toBeGreaterThanOrEqual(min);
}

/** Every element with a pressable role inside `root` (default `document.body`). */
export function queryPressables(root: ParentNode = document.body): HTMLElement[] {
  const selector = PRESSABLE_ROLES.map((role) => `[role="${role}"]`).join(",");
  return Array.from(root.querySelectorAll<HTMLElement>(selector));
}

/** `expectMinTouchTarget` on every pressable in `root`; returns how many were checked. */
export function expectAllTouchTargets(
  root: ParentNode = document.body,
  min: number = MIN_TOUCH_TARGET,
): number {
  const pressables = queryPressables(root);
  for (const element of pressables) expectMinTouchTarget(element, min);
  return pressables.length;
}

export type RouteCase<R> = { route: string } & R;

/**
 * Visits every route in order (`visit` renders + asserts and cleans up after itself) and
 * fails ONCE at the end listing every route that failed, so one broken screen does not hide
 * the others. Returns the visited route names.
 */
export async function walkAllRoutes<R extends { route: string }>(
  routes: readonly R[],
  visit: (route: R) => Promise<void> | void,
): Promise<string[]> {
  const failures: string[] = [];
  const visited: string[] = [];
  for (const route of routes) {
    try {
      await visit(route);
      visited.push(route.route);
    } catch (error) {
      // First line only: testing-library errors append the whole DOM.
      const message = (error instanceof Error ? error.message : String(error)).split("\n")[0];
      failures.push(`${route.route}: ${message?.slice(0, 300) ?? ""}`);
    }
  }
  expect(failures, `routes failing the walk:\n${failures.join("\n")}`).toEqual([]);
  return visited;
}
