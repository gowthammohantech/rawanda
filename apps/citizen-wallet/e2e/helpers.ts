import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Expo web keeps every tab's stack mounted (inactive tabs / covered stack screens are
 * `aria-hidden`): only the element OUTSIDE hidden subtrees and visible counts.
 */
export function tid(page: Page, testId: string): Locator {
  return page.locator(active(`[data-testid="${testId}"]`)).first();
}

/** CSS selector restricted to the active (not aria-hidden) screen. */
export function active(selector: string): string {
  return `${selector}:not([aria-hidden="true"] *) >> visible=true`;
}

export const BANNER_EN = "DEMONSTRATION — SYNTHETIC PATIENT DATA — NOT FOR CLINICAL USE";

/** Welcome → Continue → persona card (demo persona, not a real sign-in). */
export async function choosePersona(page: Page, personaId: string): Promise<void> {
  await page.goto("/welcome");
  await expect(tid(page, "welcome-screen")).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await tid(page, `persona-card-${personaId}`).click();
}

/** Bottom tab by its label; waits until the tab is selected (the previous one is inert). */
export async function openTab(page: Page, label: string): Promise<void> {
  const tab = page.getByRole("tab", { name: label, exact: true });
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
}

/** More → Demo tools (the More stack may still be on Demo tools from a previous visit). */
export async function openDemoTools(page: Page): Promise<void> {
  await openTab(page, "More");
  const screen = tid(page, "demo-tools-screen");
  const row = tid(page, "more-demo-tools");
  await expect(screen.or(row)).toBeVisible();
  if (!(await screen.isVisible())) await row.click();
  await expect(screen).toBeVisible();
}
