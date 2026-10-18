/**
 * CLN-11 responsive matrix (spec §7): every route at 1440 / 1280 / 1024 / 768 (and 390 as a
 * smoke check) — no horizontal page scroll, the navigation mode for the width (full sidebar ≥
 * 1280, icon rail 1024–1279, drawer below with a focus trap and focus return), and full-page
 * screenshots attached to the report. RW at 1024: screenshots + no clipped control labels.
 */
import { expect, test, type Page } from "@playwright/test";

import { ALPHA_1, PERSONA, ROUTE_IDS, resetDemo, signIn, visitRoute } from "./helpers.ts";

const WIDTHS = [1440, 1280, 1024, 768, 390] as const;

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

/** Visible controls whose label is cut off (overflow hidden/clip, wider content, no title). */
async function clippedLabels(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(
      "main button, main [role=tab], main label, main th, aside a, header button",
    )) {
      // Skip hidden and visually-hidden (sr-only, 1 px) elements.
      if (el.offsetParent === null || el.getBoundingClientRect().width <= 2) continue;
      const style = getComputedStyle(el);
      const clips = style.overflow !== "visible" || style.textOverflow === "ellipsis";
      if (clips && el.scrollWidth > el.clientWidth + 1 && !el.title) {
        out.push((el.textContent ?? "").trim().slice(0, 60));
      }
    }
    return out;
  });
}

for (const width of WIDTHS) {
  test(`no horizontal scroll and the right navigation at ${width}px`, async ({ page }, info) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
    await resetDemo(page);
    await signIn(page, PERSONA.clinicianA1, ALPHA_1);
    const overflow: string[] = [];
    for (const id of ROUTE_IDS) {
      await visitRoute(page, id);
      const px = await horizontalOverflow(page);
      if (px > 0) overflow.push(`${id}: +${px}px`);
      await info.attach(`${width}-${id}`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: "image/png",
      });
    }
    expect(overflow).toEqual([]);

    await page.goto("/clinical/queue");
    if (width >= 1280) {
      await expect(page.getByTestId("sidebar-full")).toBeVisible();
      await expect(page.getByTestId("sidebar-rail")).toHaveCount(0);
    } else if (width >= 1024) {
      const rail = page.getByTestId("sidebar-rail");
      await expect(rail).toBeVisible();
      const link = rail.getByRole("link", { name: /^Review queue/ });
      await expect(link).toHaveAttribute("aria-current", "page");
      await link.focus();
      await expect(link.locator("span[aria-hidden=true]").last()).toHaveCSS("opacity", "1");
    } else {
      await expect(page.getByTestId("sidebar-full")).toBeHidden();
      const menu = page.getByRole("button", { name: "Open navigation menu" });
      await menu.click();
      const drawer = page.getByRole("dialog", { name: "Main navigation" });
      await expect(drawer).toBeVisible();
      // Focus stays inside the drawer (Radix focus trap) …
      for (let i = 0; i < 12; i += 1) {
        await page.keyboard.press("Tab");
        expect(await drawer.evaluate((d) => d.contains(document.activeElement))).toBe(true);
      }
      // … and returns to the hamburger on Escape.
      await page.keyboard.press("Escape");
      await expect(drawer).toBeHidden();
      await expect(menu).toBeFocused();
    }
  });
}

test("Kinyarwanda at 1024px: no clipped labels, no horizontal scroll", async ({ page }, info) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1024, height: 900 });
  await resetDemo(page);
  await signIn(page, PERSONA.clinicianA1, ALPHA_1);
  await page.getByRole("button", { name: "Ikinyarwanda" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "rw");
  const clipped: string[] = [];
  const overflow: string[] = [];
  for (const id of ROUTE_IDS) {
    await visitRoute(page, id);
    const px = await horizontalOverflow(page);
    if (px > 0) overflow.push(`${id}: +${px}px`);
    clipped.push(...(await clippedLabels(page)).map((label) => `${id}: ${label}`));
    await info.attach(`rw-1024-${id}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  }
  expect(overflow).toEqual([]);
  expect(clipped).toEqual([]);
});

test("below 1024px the decision evidence collapses into a disclosure; review is one column", async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await resetDemo(page);
  await signIn(page, PERSONA.clinicianA1, ALPHA_1);
  await visitRoute(page, "decision");
  const disclosure = page.getByTestId("decision-evidence-disclosure");
  await expect(disclosure).toBeVisible();
  await expect(disclosure.getByTestId("decision-evidence")).toBeHidden();
  await disclosure.locator("summary").click();
  await expect(disclosure.getByTestId("decision-evidence")).toBeVisible();

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByTestId("decision-evidence-disclosure")).toHaveCount(0);
  await expect(page.getByTestId("decision-evidence")).toBeVisible();

  await page.setViewportSize({ width: 1024, height: 900 });
  await visitRoute(page, "review");
  const columns = await page
    .getByTestId("review-layout")
    .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
  expect(columns).toBe(1);
});
