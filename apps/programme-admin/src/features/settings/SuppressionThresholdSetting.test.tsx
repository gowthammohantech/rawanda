/**
 * ADM-09 threshold setting: validation (range, integer, governance floor, justification),
 * programme-lead-only edit (others read-only; a direct repository call → `admin.settings.denied`),
 * audited change that recomputes the Overview (more `<10` cells), and the stale-version conflict.
 */
import { PERSONA_IDS } from "@laif/mock-data";
import { isRepositoryError } from "@laif/repositories";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { auditEvents, bootApp } from "../../test/app.tsx";
import { overviewSuppressedCells } from "./SuppressionThresholdSetting.tsx";

const JUSTIFICATION = "Pilot review asked for a stricter threshold.";
const settingsAs = (personaId: string) =>
  bootApp({ path: "/admin/settings", signInAs: personaId, waitFor: "settings-page" });

describe("SuppressionThresholdSetting (ADM-09)", () => {
  it("validates the range (3–20, whole number) and the justification; nothing is saved", async () => {
    const user = userEvent.setup();
    const { services, store } = await settingsAs(PERSONA_IDS.leadProgramme);
    const input = await screen.findByRole("spinbutton", { name: /New threshold/ });
    const save = screen.getByRole("button", { name: "Save threshold" });

    for (const bad of ["2", "21", "5.5"]) {
      await user.clear(input);
      await user.type(input, bad);
      await user.click(save);
      expect(await screen.findByText("Enter a whole number from 3 to 20")).toBeTruthy();
    }
    await user.clear(input);
    await user.type(input, "10");
    await user.click(save);
    expect(await screen.findByText(/Give a justification of 10 to 300 characters/)).toBeTruthy();
    expect(input.getAttribute("aria-invalid")).toBeNull();
    expect((await services.repo.getAdminSettings()).suppressionThreshold).toBe(5);
    expect(await auditEvents(store, "admin.settings.suppression_threshold_changed")).toHaveLength(
      0,
    );
  });

  it("lead: 5 → 10 is audited, previewed, and the Overview hides more cells", async () => {
    const user = userEvent.setup();
    const { services, store, router } = await settingsAs(PERSONA_IDS.leadProgramme);
    const input = await screen.findByRole("spinbutton", { name: /New threshold/ });
    await user.clear(input);
    await user.type(input, "10");
    expect(
      (await screen.findByText(/At k = 10, \d+ cells in the current Overview would be suppressed/))
        .textContent,
    ).toBeTruthy();
    await user.type(screen.getByRole("textbox", { name: /Justification/ }), JUSTIFICATION);
    await user.click(screen.getByRole("button", { name: "Save threshold" }));
    expect(await screen.findByText("Threshold updated — dashboards recalculated")).toBeTruthy();

    const settings = await services.repo.getAdminSettings();
    expect(settings).toMatchObject({ suppressionThreshold: 10, version: 2 });
    const [event] = await auditEvents(store, "admin.settings.suppression_threshold_changed");
    expect(event).toMatchObject({
      justification: JUSTIFICATION,
      changeSummary: { before: 5, after: 10 },
    });

    // The in-force threshold is applied to the overview (cache key carries k = 10).
    const at10 = services.queryClient
      .getQueryCache()
      .findAll({ queryKey: ["admin", "scoped"] })
      .map((q) => q.queryKey)
      .filter((key) => key.includes("overview"));
    expect(at10.some((key) => key.at(-1) === 10)).toBe(true);
    await router.navigate("/admin/overview");
    const strip = await screen.findByTestId("kpi-strip", {}, { timeout: 10_000 });
    expect(strip).toBeTruthy();
    await waitFor(() => expect(screen.getAllByText("<10").length).toBeGreaterThan(0));
    expect(screen.queryAllByText("<5")).toHaveLength(0);
  });

  it("a district analyst sees the value read-only; a direct call is denied and audited", async () => {
    const { services, store } = await settingsAs(PERSONA_IDS.analystAlpha);
    const card = await screen.findByTestId("threshold-readonly");
    expect(within(card).getByText(/Set by programme lead/)).toBeTruthy();
    expect(within(card).getByText("k = 5")).toBeTruthy();
    expect(screen.queryByRole("spinbutton", { name: /New threshold/ })).toBeNull();

    const error = await services.repo
      .updateAdminSettings(
        { expectedVersion: 1, suppressionThreshold: 10, justification: JUSTIFICATION },
        crypto.randomUUID(),
      )
      .catch((e: unknown) => e);
    expect(isRepositoryError(error) && error.code).toBe("FORBIDDEN");
    await waitFor(async () =>
      expect(await auditEvents(store, "admin.settings.denied")).toHaveLength(1),
    );
    expect((await services.repo.getAdminSettings()).suppressionThreshold).toBe(5);
  });

  it("conflict on the next write → ConflictNotice; re-apply on latest saves once", async () => {
    const user = userEvent.setup();
    const { services, store } = await settingsAs(PERSONA_IDS.leadProgramme);
    await user.click(
      await screen.findByRole("checkbox", { name: /Conflict on the next threshold change/ }),
    );
    expect(await screen.findByTestId("fault-pill")).toBeTruthy();
    await waitFor(async () =>
      expect((await services.repo.demo.getFaults()).conflictOnce).toHaveLength(1),
    );
    const input = screen.getByRole("spinbutton", { name: /New threshold/ });
    await user.clear(input);
    await user.type(input, "8");
    await user.type(screen.getByRole("textbox", { name: /Justification/ }), JUSTIFICATION);
    await user.click(screen.getByRole("button", { name: "Save threshold" }));
    expect(await screen.findByText("The threshold was changed by someone else")).toBeTruthy();
    expect((await services.repo.getAdminSettings()).suppressionThreshold).toBe(5);
    await user.click(screen.getByRole("button", { name: /Re-apply/ }));
    expect(await screen.findByText("Threshold updated — dashboards recalculated")).toBeTruthy();
    expect((await services.repo.getAdminSettings()).suppressionThreshold).toBe(8);
    expect(await auditEvents(store, "conflict.detected")).toHaveLength(1);
    expect(await auditEvents(store, "admin.settings.suppression_threshold_changed")).toHaveLength(
      1,
    );
    await waitFor(() => expect(screen.queryByTestId("fault-pill")).toBeNull());
  });

  it("overviewSuppressedCells counts every published suppressed cell", () => {
    const cell = (suppressed: boolean) => ({ key: "x", value: suppressed ? null : 9, suppressed });
    const count = overviewSuppressedCells({
      totals: { screened: cell(true), flagged: cell(false) },
      peopleScreened: cell(true),
      facilities: [{ cells: { screened: cell(true) } }],
      weekly: [{ weekStart: "w", screened: cell(false), flagged: cell(true) }],
      screeningType: { cells: [cell(true)] },
      needsAttention: {
        overdueReferrals: cell(false),
        overdueFollowUps: cell(true),
        openQualityIssues: cell(false),
        pendingReviewAges: { "0-2": cell(true) },
      },
    } as never);
    expect(count).toBe(7);
  });
});
