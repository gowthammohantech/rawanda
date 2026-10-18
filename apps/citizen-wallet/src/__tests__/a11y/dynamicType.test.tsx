/**
 * CTZ-08/09 dynamic type: app text size Largest (1.5) with the OS font scale at 100 %, 150 % and
 * 200 % on EVERY leaf route — body text carries the app multiplier (`allowFontScaling` never
 * off; the OS scale applies on top natively), no text is single-line truncated (ellipsis /
 * nowrap) or clipped by a fixed height, and tab labels may wrap to two lines.
 */
import { PERSONA_IDS } from "@laif/mock-data";
import { typeScale } from "@laif/ui-native";
import { walkAllRoutes } from "@laif/test-utils/native";
import { screen } from "@testing-library/react";
import { PixelRatio } from "react-native";
import { afterEach, describe, expect, it, vi } from "vitest";

import TabsLayout from "../../../app/(app)/(tabs)/_layout.tsx";
import { TAB_ITEM_MIN_HEIGHT } from "../../navigation/tabs.ts";
import { renderShell } from "../../test/harness.tsx";
import { routesFor } from "../../test/routes.tsx";
import { renderRoute } from "../../test/walk.tsx";

vi.mock("expo-router", () => import("../../test/router-stub.tsx"));

const LARGEST = 1.5;

function clippedTexts(root: HTMLElement): string[] {
  const out: string[] = [];
  for (const el of Array.from(root.querySelectorAll<HTMLElement>("[dir], div, span"))) {
    const text = el.textContent?.trim() ?? "";
    if (text === "" || el.children.length > 0) continue;
    const style = getComputedStyle(el);
    const singleLine = style.whiteSpace === "nowrap" && style.textOverflow === "ellipsis";
    const clamped = style.getPropertyValue("-webkit-line-clamp") === "1";
    const fixedHeight =
      style.height !== "" && style.height !== "auto" && style.overflow === "hidden";
    if (singleLine || clamped || fixedHeight) out.push(text);
  }
  return out;
}

afterEach(() => vi.restoreAllMocks());

describe.each([1, 1.5, 2])("Largest text + OS font scale %s", (fontScale) => {
  it("every route: scaled text, nothing clipped", async () => {
    vi.spyOn(PixelRatio, "getFontScale").mockReturnValue(fontScale);
    await walkAllRoutes(routesFor(PERSONA_IDS.citizen1), async (route) => {
      const view = await renderRoute(route, PERSONA_IDS.citizen1, {
        before: (s) => s.display.getState().set({ textScale: LARGEST }),
      });
      expect(PixelRatio.getFontScale()).toBe(fontScale);
      // The brand mark (role image, fixed logo artwork) is not text content.
      const sizes = Array.from(view.container.querySelectorAll<HTMLElement>("div[dir], span"))
        .filter((el) => el.closest('[role="img"]') === null)
        .map((el) => parseFloat(getComputedStyle(el).fontSize))
        .filter((n) => !Number.isNaN(n));
      expect(sizes).toContain(typeScale.body.fontSize * LARGEST);
      expect(Math.min(...sizes)).toBeGreaterThanOrEqual(typeScale.micro.fontSize * LARGEST - 0.1);
      expect(clippedTexts(view.container)).toEqual([]);
    });
  }, 120_000);
});

describe("tab bar at large text", () => {
  it("tab items keep a 56pt floor and labels may use two lines", async () => {
    await renderShell(<TabsLayout />, {
      before: (s) => {
        s.session.switchTo(PERSONA_IDS.citizen1);
        s.display.getState().set({ textScale: LARGEST });
      },
    });
    const bar = await screen.findByTestId("tab-bar");
    expect(Number(bar.getAttribute("data-min-height"))).toBe(TAB_ITEM_MIN_HEIGHT);
    expect(TAB_ITEM_MIN_HEIGHT).toBeGreaterThanOrEqual(44);
    expect(screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual([
      "My health",
      "Next steps",
      "Reminders",
      "Timeline",
      "More",
    ]);
  });
});
