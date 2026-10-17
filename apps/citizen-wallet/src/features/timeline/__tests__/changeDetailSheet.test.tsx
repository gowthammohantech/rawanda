/**
 * CTZ-06 "what changed" sheet (T-06 citizen view of a correction): opening CTZ-P1's UPDATED row
 * shows the field, Before / After side by side, author + role, time, reason (catalogue key copy)
 * and "Your earlier record is kept. Nothing was deleted."; one `citizen.change.viewed`
 * (+ `result_viewed` access event) per opened change; "View this check" opens the result.
 */
import { CITIZEN_OVERLAY_IDS, DEMO_PERSONAS, PERSONA_IDS } from "@laif/mock-data";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { auditsOf, renderShell } from "../../../test/harness.tsx";
import { resetRouter, routerLog } from "../../../test/router-stub.tsx";
import { TimelineScreen } from "../TimelineScreen.tsx";

vi.mock("expo-router", () => import("../../../test/router-stub.tsx"));

const T = { timeout: 10_000 };
const AMENDED = CITIZEN_OVERLAY_IDS.amendedScreening;
const author = DEMO_PERSONAS.find((p) => p.id === PERSONA_IDS.clinAlpha1)!.displayName;

async function openChange() {
  const view = await renderShell(<TimelineScreen />, {
    before: (s) => void s.session.switchTo(PERSONA_IDS.citizen1),
  });
  const row = await screen.findByTestId(`timeline-item-updated:${AMENDED}:0`, {}, T);
  expect(within(row).getByText("UPDATED")).toBeTruthy();
  expect(within(row).getByText("Fasting before the check")).toBeTruthy();
  fireEvent.click(row);
  const sheet = await screen.findByTestId("change-detail-sheet", {}, T);
  return { view, sheet: within(sheet) };
}

describe("ChangeDetailSheet", () => {
  beforeEach(() => resetRouter(["(app)", "(tabs)", "timeline"]));

  it("shows field, before / after, author, time, reason and that nothing was deleted", async () => {
    const { sheet } = await openChange();
    expect(sheet.getByRole("heading", { name: "What changed" })).toBeTruthy();
    expect(sheet.getByText("Part of your record")).toBeTruthy();
    expect(sheet.getByTestId("change-field").textContent).toBe("Fasting before the check");
    const before = sheet.getByTestId("change-before");
    const after = sheet.getByTestId("change-after");
    expect(before.textContent).toBe("BeforeNot recorded");
    expect(after.textContent).toBe("AfterFasting");
    expect(before.getAttribute("aria-label")).toBe("Before: Not recorded");
    expect(after.getAttribute("aria-label")).toBe("After: Fasting");
    expect(sheet.getByTestId("change-provenance").textContent).toBe(
      `Updated by ${author} · 25 Aug 2026 · Reason: reading context was entered wrongly`,
    );
    const details = sheet.getByTestId("change-details").textContent ?? "";
    expect(details).toContain(author);
    expect(details).toContain("25 Aug 2026, 10:00");
    expect(details).toContain("reading context was entered wrongly");
    expect(sheet.getByText("Your earlier record is kept. Nothing was deleted.")).toBeTruthy();
  });

  it("records one citizen.change.viewed (result_viewed access event) per opened change", async () => {
    const { view } = await openChange();
    await waitFor(async () => {
      const audits = (await auditsOf(view.store, "citizen.change.viewed")) as unknown as {
        entityType: string;
        entityId: string;
      }[];
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({ entityType: "screening", entityId: AMENDED });
    });
    const events = await view.store.getAll<{ action: string; resourceId: string }>("accessEvents");
    expect(events.some((e) => e.action === "result_viewed" && e.resourceId === AMENDED)).toBe(true);
    // Close: the sheet goes away and nothing more is recorded.
    fireEvent.click(screen.getByTestId("change-close"));
    await waitFor(() => expect(screen.queryByTestId("change-detail-sheet")).toBeNull());
    expect(await auditsOf(view.store, "citizen.change.viewed")).toHaveLength(1);
  });

  it("'View this check' closes the sheet and opens the result", async () => {
    await openChange();
    fireEvent.click(screen.getByTestId("change-open-result"));
    expect(routerLog.at(-1)).toMatchObject({
      method: "push",
      href: { pathname: "/health/[observationId]", params: { observationId: AMENDED } },
    });
    await waitFor(() => expect(screen.queryByTestId("change-detail-sheet")).toBeNull());
  });
});
