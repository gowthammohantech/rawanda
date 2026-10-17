import { expect, type Page } from "@playwright/test";

/** Demo sign-in through the UI (persona card + facility select). */
export async function signIn(page: Page, personaName: string, facilityLabel?: string) {
  await expect(page.getByTestId("public-shell")).toBeVisible();
  await page.getByRole("button", { name: new RegExp(personaName) }).click();
  if (facilityLabel !== undefined) {
    await page
      .getByRole("combobox", { name: /Active facility/ })
      .selectOption({ label: facilityLabel });
  }
  await page.getByRole("button", { name: "Enter the clinical portal" }).click();
  await expect(page.getByTestId("app-shell")).toBeVisible();
}
