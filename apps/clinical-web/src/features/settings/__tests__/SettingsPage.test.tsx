/**
 * CLN-02 Settings: reset confirm (baseline restored, toast, `demo.reset` with the actor), fault
 * toggles (offline banner + active pill, Server 500 → ErrorState → off + retry recovers,
 * latency), WF-02 simulated actor, language persisted across reset, permission split (every
 * clinical persona has the demo tooling; the language card is always there).
 */
import type { AuditEvent } from "@laif/domain";
import { FACILITY_IDS, PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { routes } from "../../../app/routes.ts";
import { auditEvents, renderApp } from "../../../test/render-app.tsx";

const CLINICIAN = { personaId: PERSONA_IDS.clinAlpha1, facilityId: FACILITY_IDS.alpha1 };
const OFFLINE_BANNER = "Simulated offline — changes cannot be saved";

const openSettings = (signIn = CLINICIAN) => renderApp({ path: routes.settings(), signIn });

async function wf02Version() {
  return (await screen.findByTestId("snapshot-wf02-version")).textContent;
}

describe("SettingsPage", () => {
  it.each([
    [PERSONA_IDS.clinAlpha1, FACILITY_IDS.alpha1],
    [PERSONA_IDS.nurseAlpha2, FACILITY_IDS.alpha2],
    [PERSONA_IDS.coordAlpha, FACILITY_IDS.alpha1],
    [PERSONA_IDS.clinBeta1, FACILITY_IDS.beta1],
  ])(
    "shows every settings card to %s (demo tooling for every role)",
    async (personaId, facilityId) => {
      await openSettings({ personaId, facilityId });
      expect(await screen.findByRole("heading", { level: 1, name: "Settings" })).toBeTruthy();
      for (const title of ["Language", "Reset demo", "Fault simulation", "Scenario actions"]) {
        expect(screen.getByRole("heading", { level: 2, name: title })).toBeTruthy();
      }
    },
  );

  it("simulates the WF-02 worker update, then Reset demo restores the baseline", async () => {
    const user = userEvent.setup();
    const { store } = await openSettings();
    expect(await wf02Version()).toBe("3");
    await user.click(
      screen.getByRole("button", { name: "Simulate worker updating follow-up (WF-02)" }),
    );
    await screen.findByText("Follow-up updated by a simulated worker (version 4)");
    await waitFor(async () => expect(await wf02Version()).toBe("4"));
    const simulated = await auditEvents(store, "demo.concurrent_update_simulated");
    expect(simulated).toHaveLength(1);
    expect(simulated[0]?.actorId).toBe(PERSONA_IDS.chwAlpha1A);
    expect(simulated[0]?.entityId).toBe(SEED_ANCHORS.WF02_FOLLOWUP_CONFLICT.followUpId);

    await user.click(screen.getByRole("button", { name: "Reset demo…" }));
    const dialog = await screen.findByRole("dialog", { name: "Reset the demo to its baseline?" });
    await user.click(within(dialog).getByRole("button", { name: "Reset demo" }));
    await screen.findByText("Demo reset to baseline");
    await waitFor(async () => expect(await wf02Version()).toBe("3"));

    const events = await store.getAll<AuditEvent>("auditEvents");
    const resets = events.filter((e) => e.action === "demo.reset");
    expect(resets).toHaveLength(1);
    expect(resets[0]?.actorId).toBe(PERSONA_IDS.clinAlpha1);
    expect(await auditEvents(store, "demo.concurrent_update_simulated")).toHaveLength(0);
  });

  it("Simulated offline shows the banner and the active pill; turning it off clears both", async () => {
    const user = userEvent.setup();
    const { services, store } = await openSettings();
    await screen.findByTestId("snapshot-pending-reviews");
    await user.click(screen.getByRole("switch", { name: "Simulated offline" }));
    expect(await screen.findByText(OFFLINE_BANNER)).toBeTruthy();
    expect(screen.getByTestId("faults-active-pill").textContent).toContain(
      "Simulated faults active",
    );
    await waitFor(async () => expect((await services.repo.demo.getFaults()).offline).toBe(true));
    expect((await auditEvents(store, "demo.fault_toggled")).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("switch", { name: "Simulated offline" }));
    await waitFor(() => expect(screen.queryByText(OFFLINE_BANNER)).toBeNull());
    expect(screen.queryByTestId("faults-active-pill")).toBeNull();
  });

  it("Server 500 makes a read show ErrorState; off + retry recovers", async () => {
    const user = userEvent.setup();
    await openSettings();
    await screen.findByTestId("snapshot-pending-reviews");
    await user.click(screen.getByRole("switch", { name: "Server 500" }));
    const alert = await screen.findByRole("alert", {}, { timeout: 5000 });
    expect(alert.textContent).toContain("The service could not complete this request");
    expect(alert.textContent).toContain("INTERNAL");

    await user.click(screen.getByRole("switch", { name: "Server 500" }));
    await user.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("snapshot-pending-reviews")).toBeTruthy();
  });

  it("other switches and the latency slider update the FaultConfig", async () => {
    const user = userEvent.setup();
    const { services } = await openSettings();
    await user.click(await screen.findByRole("switch", { name: "Timeout after save" }));
    await user.click(screen.getByRole("switch", { name: "Conflict on next write" }));
    const slider = screen.getByRole("slider", { name: "Simulated latency" });
    fireEvent.change(slider, { target: { value: "1000" } });
    fireEvent.blur(slider);
    await waitFor(async () => {
      const faults = await services.repo.demo.getFaults();
      expect(faults.timeoutRate).toBe(1);
      expect(faults.conflictOnce).toHaveLength(3);
      expect(faults.latencyMs).toEqual([1000, 1000]);
    });
    await user.click(screen.getByRole("button", { name: "Turn all faults off" }));
    await waitFor(async () => {
      const faults = await services.repo.demo.getFaults();
      expect(faults.timeoutRate).toBe(0);
      expect(faults.conflictOnce).toHaveLength(0);
      expect(faults.latencyMs).toEqual([150, 450]);
    });
  });

  it("persists the language and keeps it after a demo reset", async () => {
    const user = userEvent.setup();
    await openSettings();
    await user.click(await screen.findByRole("radio", { name: "Ikinyarwanda" }));
    await waitFor(() => expect(window.localStorage.getItem("laif.clinical.language")).toBe("rw"));
    expect(document.documentElement.lang).toBe("rw");

    const resetButton = await screen.findByRole("button", { name: /Subiza igerageza uko ryari…/ });
    await user.click(resetButton);
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Subiza igerageza uko ryari" }));
    await screen.findByText("Igerageza ryasubijwe uko ryari riri");
    expect(window.localStorage.getItem("laif.clinical.language")).toBe("rw");
  });
});
