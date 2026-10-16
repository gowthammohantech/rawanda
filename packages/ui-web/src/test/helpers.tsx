/**
 * Test helpers: render with providers (from @laif/test-utils/web) and run axe via vitest-axe.
 * Isolated component renders disable axe's `region` rule (a lone component is not inside a
 * page landmark); the AppShell test and the gallery-style axe test keep it on.
 */
import type { Language } from "@laif/i18n";
import { renderWithProviders } from "@laif/test-utils/web";
import type { ReactElement } from "react";
import { expect } from "vitest";
import { configureAxe } from "vitest-axe";

import { ToastProvider } from "../components/Toast.tsx";

export const axe = configureAxe({ rules: { region: { enabled: false } } });
export const axePage = configureAxe({});

export function renderUi(
  ui: ReactElement,
  options: { language?: Language; route?: string; withToasts?: boolean } = {},
) {
  const { withToasts = false, ...rest } = options;
  return renderWithProviders(withToasts ? <ToastProvider>{ui}</ToastProvider> : ui, rest);
}

/** Runs axe on `node` (defaults to the whole body so Radix portals are included). */
export async function expectNoAxeViolations(node: Element = document.body, page = false) {
  const results = await (page ? axePage : axe)(node);
  expect(results).toHaveNoViolations();
}
