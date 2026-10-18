/**
 * CTZ-09 task 1 (screen reader): status chips read "Status: …"; readings read with full unit
 * names; timeline rows start with their status; saves, inline errors and toasts are announced
 * (`AccessibilityInfo.announceForAccessibility`); focus moves to the screen title on native.
 */
import { PERSONA_IDS } from "@laif/mock-data";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { AccessibilityInfo } from "react-native";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { focusTitle } from "../../a11y/useTitleFocus.ts";
import { routesFor, ROUTE_CASES } from "../../test/routes.tsx";
import { renderRoute } from "../../test/walk.tsx";

vi.mock("expo-router", () => import("../../test/router-stub.tsx"));

const route = (name: string) => {
  const found = ROUTE_CASES.find((r) => r.route === name);
  if (found === undefined) throw new Error(name);
  return found;
};
const P1 = PERSONA_IDS.citizen1;

let announced: string[];
beforeEach(() => {
  announced = [];
  vi.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation((message) => {
    announced.push(message);
  });
});
afterEach(() => vi.restoreAllMocks());

describe("screen-reader output", () => {
  it("result chips read 'Status: …'; readings use full unit names", async () => {
    await renderRoute(route("(app)/(tabs)/health/index"), P1);
    const chips = screen.getAllByTestId(/^result-chip-/u);
    expect(chips.length).toBeGreaterThan(0);
    for (const chip of chips) expect(chip.getAttribute("aria-label")).toMatch(/^Status: /u);

    await renderRoute(route("(app)/(tabs)/health/[observationId]"), P1);
    const labels = [...document.querySelectorAll("[aria-label]")].map(
      (e) => e.getAttribute("aria-label") ?? "",
    );
    expect(
      labels.some((l) => /^Blood pressure \d+ over \d+ millimetres of mercury$/u.test(l)),
    ).toBe(true);
    expect(labels.some((l) => /^Blood glucose [\d.]+ millimoles per litre$/u.test(l))).toBe(true);
  });

  it("timeline rows start with their status", async () => {
    await renderRoute(route("(app)/(tabs)/timeline/index"), P1);
    const rows = screen.getAllByTestId(/^timeline-item-/u);
    const stated = rows.filter((r) =>
      /^Status: (DONE|WAITING|UPDATED|CANCELLED)\. /u.test(r.getAttribute("aria-label") ?? ""),
    );
    expect(stated.length).toBeGreaterThan(0);
    for (const row of rows)
      expect(row.getAttribute("aria-label")).toMatch(/^(Status: [A-Z]+|NOTE)\. /u);
  });

  it("'I have read this' announces the save", async () => {
    await renderRoute(route("(app)/(tabs)/next-steps/[instructionId]"), P1);
    fireEvent.click(screen.getByTestId("acknowledge"));
    await screen.findByTestId("acknowledged", {}, { timeout: 5000 });
    expect(announced).toContain("Saved. You marked this step as read.");
  });

  it("callback form: the first inline error is announced", async () => {
    await renderRoute(route("(app)/(tabs)/more/support/callback"), P1);
    fireEvent.click(screen.getByTestId("callback-send"));
    await screen.findByTestId("error-topic");
    expect(within(screen.getByTestId("error-topic")).getByRole("alert")).toBeTruthy();
    expect(announced).toContain("Please choose what your question is about.");
  });

  it("toasts are announced (demo tools: simulated care-team confirmation)", async () => {
    await renderRoute(route("(app)/(tabs)/more/demo-tools"), P1);
    fireEvent.click(screen.getByTestId("simulate-confirmation"));
    await waitFor(() =>
      expect(announced.some((m) => m.startsWith("Care-team confirmation simulated (demo)."))).toBe(
        true,
      ),
    );
  });

  it("focus moves to the screen title on native, never on the web target", () => {
    const target = AccessibilityInfo as unknown as { sendAccessibilityEvent?: unknown };
    const original = target.sendAccessibilityEvent;
    const send = vi.fn();
    target.sendAccessibilityEvent = send;
    try {
      const node = {} as never;
      expect(focusTitle(node, "web")).toBe(false);
      expect(focusTitle(null, "ios")).toBe(false);
      expect(focusTitle(node, "android")).toBe(true);
      expect(send).toHaveBeenCalledWith(node, "focus");
    } finally {
      target.sendAccessibilityEvent = original;
    }
  });

  it("wallet routes expose the screen title as a header", async () => {
    for (const r of routesFor(P1)
      .filter((x) => x.persona === "wallet")
      .slice(0, 6)) {
      await renderRoute(r, P1);
      expect(screen.getAllByRole("heading").length, r.route).toBeGreaterThan(0);
    }
  });
});
