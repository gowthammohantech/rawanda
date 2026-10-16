import { expect } from "vitest";

import { minTouchTarget } from "../tokens.ts";

function px(value: string): number {
  const n = parseFloat(value);
  return Number.isNaN(n) ? 0 : n;
}

/** Computed hit area of a rendered pressable (react-native-web → DOM styles). */
export function hitArea(element: Element): { width: number; height: number } {
  const style = getComputedStyle(element);
  return {
    width: Math.max(px(style.minWidth), px(style.width)),
    height: Math.max(px(style.minHeight), px(style.height)),
  };
}

/** Asserts role + accessible label + ≥ 44 × 44 hit area (FND-10 AC 2). */
export function expectAccessiblePressable(element: HTMLElement, role: string) {
  expect(element.getAttribute("role")).toBe(role);
  const label = element.getAttribute("aria-label") ?? element.textContent ?? "";
  expect(label.trim()).not.toBe("");
  const area = hitArea(element);
  expect(area.width, `width of ${label}`).toBeGreaterThanOrEqual(minTouchTarget);
  expect(area.height, `height of ${label}`).toBeGreaterThanOrEqual(minTouchTarget);
}

export const PRESSABLE_ROLES = ["button", "checkbox", "radio", "switch", "tab", "link"] as const;
