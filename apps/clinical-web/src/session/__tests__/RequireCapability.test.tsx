/**
 * CLN-01 task 7: a coordinator on `/clinical/reviews/x/decision` sees PermissionDenied (route
 * stays in the URL) and exactly one `access.denied` event is recorded — also under StrictMode.
 */
import { FACILITY_IDS, PERSONA_IDS } from "@laif/mock-data";
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { auditEvents, renderApp } from "../../test/render-app.tsx";

describe("RequireCapability", () => {
  it("renders PermissionDenied and records a single access.denied event", async () => {
    const { router, store } = await renderApp({
      path: "/clinical/reviews/x/decision",
      signIn: { personaId: PERSONA_IDS.coordAlpha, facilityId: FACILITY_IDS.alpha1 },
    });
    const denied = await screen.findByTestId("permission-denied");
    expect(denied.dataset["capability"]).toBe("review.decide");
    expect(
      screen.getByRole("heading", { level: 1, name: "Not available for this demo role" }),
    ).toBeTruthy();
    expect(denied.textContent).toContain("Facility coordinator");
    expect(screen.getByRole("link", { name: "Switch persona" }).getAttribute("href")).toBe(
      "/clinical/login?redirect=%2Fclinical%2Freviews%2Fx%2Fdecision",
    );
    expect(router.state.location.pathname).toBe("/clinical/reviews/x/decision");

    await waitFor(async () => expect(await auditEvents(store, "access.denied")).toHaveLength(1));
    // Give any duplicate (StrictMode double effect) a chance to land.
    await new Promise((resolve) => setTimeout(resolve, 50));
    const events = await auditEvents(store, "access.denied");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actorId: PERSONA_IDS.coordAlpha,
      actorRole: "facility_coordinator",
      outcome: "denied",
      facilityId: FACILITY_IDS.alpha1,
      entityId: "/clinical/reviews/x/decision",
      changeSummary: expect.objectContaining({
        resource: "route",
        route: "/clinical/reviews/x/decision",
        capability: "review.decide",
      }) as unknown,
    });
    expect(events[0]?.correlationId).toBeTruthy();
    expect(events[0]?.occurredAt).toMatch(/Z$/u);
  });

  it("renders the screen without an audit event when the capability is held", async () => {
    const { store } = await renderApp({
      path: "/clinical/reviews/x/decision",
      signIn: { personaId: PERSONA_IDS.clinAlpha1, facilityId: FACILITY_IDS.alpha1 },
    });
    expect(await screen.findByRole("heading", { level: 1, name: "Record decision" })).toBeTruthy();
    expect(screen.queryByTestId("permission-denied")).toBeNull();
    expect(await auditEvents(store, "access.denied")).toHaveLength(0);
  });
});
