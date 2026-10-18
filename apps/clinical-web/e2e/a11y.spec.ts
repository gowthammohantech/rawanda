/**
 * CLN-11 accessibility + copy sweep (spec §7, §9): every clinical route, in English and in
 * Kinyarwanda, as clinician Alpha-1 from a clean `Reset demo`:
 * - `@axe-core/playwright` (WCAG 2.0/2.1 A + AA rules): 0 serious / critical violations, and
 *   a valid heading order;
 * - DemoBanner + EN/RW switcher visible, the role switcher is labelled demo-only;
 * - landmarks (banner header, navigation, main), skip link, `aria-current="page"` in the nav;
 * - no raw i18n key is rendered (every `clinical:*` key path is checked against the page text);
 * - the DEMO_RULE label is on every flag/rule surface (review detail, decision).
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { ALPHA_1, PERSONA, ROUTE_IDS, resetDemo, signIn, visitRoute } from "./helpers.ts";

const LOCALES = fileURLToPath(new URL("../../../packages/i18n/src/locales/", import.meta.url));

/** Every dotted `clinical:*` key path (≥ 2 segments), e.g. `queue.empty.pending`. */
function clinicalKeyPaths(): string[] {
  const out: string[] = [];
  const walk = (value: unknown, prefix: string) => {
    if (value !== null && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) walk(v, prefix === "" ? k : `${prefix}.${k}`);
    } else if (prefix.includes(".")) out.push(prefix);
  };
  walk(JSON.parse(readFileSync(`${LOCALES}en/clinical.json`, "utf8")), "");
  for (const file of readdirSync(`${LOCALES}en/clinical`)) {
    walk(
      JSON.parse(readFileSync(`${LOCALES}en/clinical/${file}`, "utf8")),
      file.replace(/\.json$/u, ""),
    );
  }
  return out;
}
const KEY_PATHS = clinicalKeyPaths();

async function expectNoRawKeys(page: Page) {
  const text = await page.locator("body").innerText();
  const raw = KEY_PATHS.filter((key) => text.includes(key));
  expect(raw, "raw i18n keys rendered").toEqual([]);
  expect(text).not.toMatch(/\b(clinical|common|validation|domain|shell|demo):[a-z]/u);
}

async function expectShellChrome(page: Page, language: "en" | "rw") {
  await expect(page.getByTestId("demo-banner")).toBeVisible();
  await expect(
    page.getByRole("group", { name: language === "en" ? "Language" : "Ururimi", exact: true }),
  ).toBeVisible();
  await expect(page.locator('a[href="#main"]').first()).toBeAttached();
  await expect(page.locator("main#main")).toHaveCount(1);
  await expect(page.locator("header").first()).toBeVisible();
  await expect(page.getByRole("navigation").first()).toBeVisible();
}

async function axe(page: Page, route: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
    .analyze();
  const blocking = results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${route}: ${v.id} ×${v.nodes.length} (${v.nodes[0]?.html.slice(0, 120) ?? ""})`);
  const headingOrder = results.violations
    .filter((v) => v.id === "heading-order")
    .map((v) => `${route}: ${v.nodes.map((n) => n.html.slice(0, 80)).join(" | ")}`);
  return { blocking, headingOrder };
}

for (const language of ["en", "rw"] as const) {
  test(`axe + copy sweep of every route (${language.toUpperCase()})`, async ({ page }) => {
    test.setTimeout(180_000);
    await resetDemo(page);
    await signIn(page, PERSONA.clinicianA1, ALPHA_1);

    // The role switcher is labelled demo-only (shell).
    await page.getByRole("button", { name: /Switch demo persona/u }).click();
    await expect(page.getByRole("menu")).toContainText("Demo role switch — not authentication");
    await page.keyboard.press("Escape");

    if (language === "rw") {
      await page.getByRole("button", { name: "Ikinyarwanda" }).click();
      await expect(page.locator("html")).toHaveAttribute("lang", "rw");
    }

    const blocking: string[] = [];
    const headingOrder: string[] = [];
    for (const id of ROUTE_IDS) {
      await visitRoute(page, id);
      await expect(page.locator("html")).toHaveAttribute("lang", language);
      await expectShellChrome(page, language);
      await expectNoRawKeys(page);
      if (id !== "patient" && id !== "review" && id !== "decision") {
        await expect(page.locator('aside [aria-current="page"]').first()).toBeVisible();
      }
      if (id === "review" || id === "decision") {
        await expect(page.locator("main")).toContainText("DEMO_RULE_NOT_CLINICALLY_VALIDATED");
      }
      const result = await axe(page, id);
      blocking.push(...result.blocking);
      headingOrder.push(...result.headingOrder);
    }
    expect(blocking).toEqual([]);
    expect(headingOrder).toEqual([]);
  });
}

test("demo sign-in page has no serious axe violations and shows the banner", async ({ page }) => {
  await resetDemo(page);
  await expect(page.getByTestId("demo-banner")).toBeVisible();
  const { blocking, headingOrder } = await axe(page, "login");
  expect(blocking).toEqual([]);
  expect(headingOrder).toEqual([]);
});
