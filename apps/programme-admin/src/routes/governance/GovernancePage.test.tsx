/**
 * GovernancePage (ADM-08 §9): tab router with counts, the Rulesets tab (v1 active, v0 retired,
 * in-scope evaluated counts, demo badge, no thresholds), the facility manager's 403, the access
 * simulator (District Alpha analyst × District Beta → DENIED `OUT_OF_SCOPE_DISTRICT`, audited),
 * its "Try it" flow (real 403 + exactly one `access.denied`, then "Return to …"), and a grant
 * edit taking effect on the edited persona's next navigation.
 */
import type { AccessGrant } from "@laif/contracts";
import {
  ADMIN_GRANT_IDS,
  DEMO_RULESET_RETIRED_VERSION,
  DEMO_RULESET_VERSION,
  DISTRICT_IDS,
  FACILITY_IDS,
  PERSONA_IDS,
} from "@laif/mock-data";
import { readStoreCollection } from "@laif/test-utils";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { findAdminPersona } from "../../auth/personas.ts";
import { auditEvents, bootApp } from "../../test/app.tsx";

const nameOf = (id: string) => findAdminPersona(id)?.displayName ?? id;

describe("GovernancePage", () => {
  it("tabs with counts; the tab lives in the URL", async () => {
    const user = userEvent.setup();
    const { router } = await bootApp({
      path: "/admin/governance",
      signInAs: PERSONA_IDS.leadProgramme,
      waitFor: "governance-page",
    });
    expect(await screen.findByRole("tab", { name: /^Rulesets\s*2$/ })).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /^Roles & access\s*4$/ })).toBeTruthy(),
    );
    await user.click(screen.getByRole("tab", { name: /^Audit log/ }));
    await waitFor(() => expect(router.state.location.search).toContain("tab=audit"));
    expect(await screen.findByTestId("audit-explorer")).toBeTruthy();
    await act(() => router.navigate("/admin/governance?tab=nonsense"));
    expect(await screen.findByTestId("ruleset-history")).toBeTruthy();
  });

  it("Rulesets: v1 active and v0 retired with in-scope counts and the demo badge, no thresholds", async () => {
    const user = userEvent.setup();
    await bootApp({
      path: "/admin/governance?tab=rulesets",
      signInAs: PERSONA_IDS.leadProgramme,
      waitFor: "ruleset-history",
    });
    const v1 = await screen.findByTestId(
      `ruleset-${DEMO_RULESET_VERSION}`,
      {},
      { timeout: 10_000 },
    );
    const v0 = screen.getByTestId(`ruleset-${DEMO_RULESET_RETIRED_VERSION}`);
    expect(within(v1).getByText("Active")).toBeTruthy();
    expect(within(v0).getByText("Retired")).toBeTruthy();
    for (const row of [v1, v0]) {
      expect(within(row).getByText("DEMO_RULE_NOT_CLINICALLY_VALIDATED")).toBeTruthy();
    }
    await user.click(within(v1).getByRole("button"));
    expect(within(v1).getByTestId("ruleset-demo-label").textContent).toBe(
      "Illustrative demo placeholder — requires clinical approval",
    );
    expect(within(v1).getByText("In-scope screenings evaluated")).toBeTruthy();
    expect(within(v1).getByText("DEMO_BP_SYSTOLIC_AT_OR_ABOVE_THRESHOLD")).toBeTruthy();
    // Thresholds are never shown as values.
    expect(v1.textContent).not.toMatch(/\b145\b|\b95\b/);
  });

  it("the facility manager gets the 403 (capability check on the route)", async () => {
    await bootApp({
      path: "/admin/governance",
      signInAs: PERSONA_IDS.fmgrAlpha1,
      waitFor: "forbidden-page",
    });
    expect(screen.queryByTestId("governance-page")).toBeNull();
  });

  it("simulator: Alpha analyst × District Beta → DENIED OUT_OF_SCOPE_DISTRICT; Try it → real 403 + one access.denied; Return", async () => {
    const user = userEvent.setup();
    const { store, services, router } = await bootApp({
      path: "/admin/governance?tab=access",
      signInAs: PERSONA_IDS.leadProgramme,
      waitFor: "access-simulator",
    });
    const sim = screen.getByTestId("access-simulator");
    await user.selectOptions(
      within(sim).getByRole("combobox", { name: "Demo persona" }),
      PERSONA_IDS.analystAlpha,
    );
    await user.selectOptions(
      within(sim).getByRole("combobox", { name: "Resource type" }),
      "district",
    );
    await user.selectOptions(
      within(sim).getByRole("combobox", { name: /^Resource$/ }),
      DISTRICT_IDS.beta,
    );
    await user.click(within(sim).getByRole("button", { name: "Check access" }));
    const result = await within(sim).findByTestId("simulation-result");
    expect(result.getAttribute("data-decision")).toBe("denied");
    expect(within(result).getByTestId("simulation-reason").textContent).toBe(
      "OUT_OF_SCOPE_DISTRICT",
    );
    expect(result.textContent).toContain("Denied: district is outside this persona's scope");
    await waitFor(async () =>
      expect(await auditEvents(store, "admin.access_simulation.run")).toMatchObject([
        {
          actorId: PERSONA_IDS.leadProgramme,
          changeSummary: {
            persona: PERSONA_IDS.analystAlpha,
            decision: "denied",
            reasonCode: "OUT_OF_SCOPE_DISTRICT",
          },
        },
      ]),
    );

    const deniedBefore = (await auditEvents(store, "access.denied")).length;
    await user.click(
      within(sim).getByRole("button", {
        name: `Try as ${nameOf(PERSONA_IDS.analystAlpha)}: open District Beta overview`,
      }),
    );
    await screen.findByTestId("forbidden-page", {}, { timeout: 10_000 });
    expect(router.state.location.search).toBe(`?district=${DISTRICT_IDS.beta}`);
    expect(services.session.getState().session?.personaId).toBe(PERSONA_IDS.analystAlpha);
    await waitFor(async () =>
      expect((await auditEvents(store, "access.denied")).length).toBe(deniedBefore + 1),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    const denied = await auditEvents(store, "access.denied");
    expect(denied).toHaveLength(deniedBefore + 1);
    expect(denied[denied.length - 1]).toMatchObject({
      actorId: PERSONA_IDS.analystAlpha,
      changeSummary: { reason: "SCOPE", requested: { district: DISTRICT_IDS.beta } },
    });

    const banner = screen.getByTestId("simulation-return-banner");
    await user.click(
      within(banner).getByRole("button", {
        name: `Return to ${nameOf(PERSONA_IDS.leadProgramme)}`,
      }),
    );
    await screen.findByTestId("access-simulator", {}, { timeout: 10_000 });
    expect(services.session.getState().session?.personaId).toBe(PERSONA_IDS.leadProgramme);
    expect(screen.queryByTestId("simulation-return-banner")).toBeNull();
  });

  it("a grant edit applies on the persona's next navigation: the removed facility gives 403", async () => {
    const { store, router } = await bootApp({
      path: `/admin/overview?facility=${FACILITY_IDS.alpha1}`,
      signInAs: PERSONA_IDS.analystAlpha,
      waitFor: "overview-page",
    });
    // The programme lead narrows the analyst to Alpha-2 (another session; same store).
    const grant = (await readStoreCollection<AccessGrant>(store, "accessGrants")).find(
      (g) => g.id === ADMIN_GRANT_IDS.analystAlpha,
    )!;
    await store.transaction((tx) =>
      tx.put("accessGrants", { ...grant, facilityIds: [FACILITY_IDS.alpha2], version: 2 }),
    );
    await act(() => router.navigate(`/admin/overview?facility=${FACILITY_IDS.alpha1}&type=bp`));
    await screen.findByTestId("forbidden-page", {}, { timeout: 10_000 });
    expect(await screen.findByText("Your access changed — view refreshed.")).toBeTruthy();
    await act(() => router.navigate(`/admin/overview?facility=${FACILITY_IDS.alpha2}`));
    await screen.findByTestId("overview-page", {}, { timeout: 10_000 });
  });
});
