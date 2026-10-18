/**
 * CTZ-08 AC: text size Largest (1.5) with the OS font scale at 200 % — no clipped text on Health,
 * Next steps, Reminders, Timeline, Privacy and Support. Every screen is rendered with the app
 * multiplier and `PixelRatio.getFontScale() = 2`; body text must be scaled (×1.5 on top of the OS
 * scale, `allowFontScaling` never off) and no text may be single-line truncated (ellipsis /
 * nowrap) or clipped by a fixed height — cards wrap instead.
 */
import { PERSONA_IDS } from "@laif/mock-data";
import { typeScale } from "@laif/ui-native";
import { screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { PixelRatio } from "react-native";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HealthListScreen } from "../features/health/HealthListScreen.tsx";
import { NextStepsListScreen } from "../features/next-steps/NextStepsListScreen.tsx";
import { PrivacyHomeScreen } from "../features/privacy/PrivacyHomeScreen.tsx";
import { RemindersScreen } from "../features/reminders/RemindersScreen.tsx";
import { SupportScreen } from "../features/support/SupportScreen.tsx";
import { TimelineScreen } from "../features/timeline/TimelineScreen.tsx";
import { renderShell } from "../test/harness.tsx";
import { resetRouter } from "../test/router-stub.tsx";

vi.mock("expo-router", () => import("../test/router-stub.tsx"));

const T = { timeout: 10_000 };
const LARGEST = 1.5;

const SCREENS: [string, ReactElement, string][] = [
  ["Health", <HealthListScreen key="h" />, "results-list"],
  ["Next steps", <NextStepsListScreen key="n" />, "section-upcoming"],
  ["Reminders", <RemindersScreen key="r" />, "reminder-toggle-card"],
  ["Timeline", <TimelineScreen key="t" />, "timeline-filters"],
  ["Privacy", <PrivacyHomeScreen key="p" />, "privacy-latest-access"],
  ["Support", <SupportScreen key="s" />, "support-callback"],
];

function clippedTexts(root: HTMLElement): string[] {
  const out: string[] = [];
  for (const el of Array.from(root.querySelectorAll<HTMLElement>("[dir], div, span"))) {
    const text = el.textContent?.trim() ?? "";
    if (text === "" || el.children.length > 0) continue;
    const style = getComputedStyle(el);
    const singleLine = style.whiteSpace === "nowrap" && style.textOverflow === "ellipsis";
    const fixedHeight =
      style.height !== "" && style.height !== "auto" && style.overflow === "hidden";
    if (singleLine || fixedHeight) out.push(text);
  }
  return out;
}

describe("Largest text + OS 200 % (fontScale = 2)", () => {
  beforeEach(() => {
    resetRouter(["(app)", "(tabs)", "health"]);
    vi.spyOn(PixelRatio, "getFontScale").mockReturnValue(2);
  });
  afterEach(() => vi.restoreAllMocks());

  it.each(SCREENS)("%s: scaled text, nothing clipped", async (_name, ui, ready) => {
    const view = await renderShell(ui, {
      before: (s) => {
        s.session.switchTo(PERSONA_IDS.citizen1);
        s.display.getState().set({ textScale: LARGEST });
      },
    });
    await screen.findAllByTestId(ready, {}, T);
    await waitFor(() => expect(view.container.textContent ?? "").not.toMatch(/Loading/u));
    expect(PixelRatio.getFontScale()).toBe(2);

    // Body-size text carries the app multiplier (the OS scale is applied on top natively).
    // The brand mark (role image, fixed logo artwork) is not text content.
    const sizes = Array.from(view.container.querySelectorAll<HTMLElement>("div[dir], span"))
      .filter((el) => el.closest('[role="img"]') === null)
      .map((el) => parseFloat(getComputedStyle(el).fontSize))
      .filter((n) => !Number.isNaN(n));
    expect(sizes).toContain(typeScale.body.fontSize * LARGEST);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(typeScale.micro.fontSize * LARGEST - 0.1);

    expect(clippedTexts(view.container)).toEqual([]);
  });
});
