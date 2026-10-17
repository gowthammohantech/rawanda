/**
 * CTZ-02 consent: the read confirmation is required (translated), Give consent writes exactly
 * one consent record + one `citizen.consent.granted` even on double tap, "Not now" ends the
 * session, and CTZ-P5 (pending) reaches consent for its own record once verified.
 */
import { CITIZEN_OVERLAY_IDS, PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConsentScreen } from "../../screens/onboarding/ConsentScreen.tsx";
import { auditsOf, renderShell } from "../../test/harness.tsx";
import { lastHref, resetRouter } from "../../test/router-stub.tsx";

vi.mock("expo-router", () => import("../../test/router-stub.tsx"));

const P3 = SEED_ANCHORS.CTZ_P3_WITHDRAWN_PATIENT.patientId;
const as = (personaId: string) => ({
  before: (s: { session: { switchTo: (id: string) => unknown } }) =>
    void s.session.switchTo(personaId),
});

describe("consent", () => {
  beforeEach(() => resetRouter());

  it("requires 'I have read this'; double tap grants exactly once", async () => {
    const { store } = await renderShell(<ConsentScreen />, {
      ...as(PERSONA_IDS.citizenWithdrawn),
      readyTestId: "consent-give",
    });
    const recordsBefore = (await store.getAll<{ patientId: string }>("consentRecords")).filter(
      (r) => r.patientId === P3,
    ).length;
    fireEvent.click(screen.getByTestId("consent-give"));
    expect(await screen.findByText("Please confirm you have read this")).toBeTruthy();
    expect(await auditsOf(store, "citizen.consent.granted")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Read the privacy notice" }));
    expect(await screen.findByText("Notice version demo-notice-v0.1")).toBeTruthy();

    fireEvent.click(screen.getByRole("checkbox", { name: "I have read this" }));
    const give = screen.getByTestId("consent-give");
    fireEvent.click(give);
    fireEvent.click(give);
    await waitFor(() => expect(lastHref()).toBe("/health"));
    expect(await screen.findByText("Consent saved")).toBeTruthy();
    const records = (await store.getAll<{ patientId: string }>("consentRecords")).filter(
      (r) => r.patientId === P3,
    );
    expect(records).toHaveLength(recordsBefore + 1);
    expect(await auditsOf(store, "citizen.consent.granted")).toHaveLength(1);
  });

  it("'Not now' returns to the persona list and ends the session", async () => {
    const { services, store } = await renderShell(<ConsentScreen />, {
      ...as(PERSONA_IDS.citizenWithdrawn),
      readyTestId: "consent-give",
    });
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    await waitFor(() => expect(services.session.current()).toBeNull());
    expect(lastHref()).toBe("/persona");
    expect(await auditsOf(store, "session.ended")).toHaveLength(1);
    expect(await auditsOf(store, "citizen.consent.granted")).toHaveLength(0);
  });

  it("consent changed elsewhere → 'Here is the latest' (no second record)", async () => {
    const { repo, store } = await renderShell(<ConsentScreen />, {
      ...as(PERSONA_IDS.citizenWithdrawn),
      readyTestId: "consent-give",
    });
    await repo().recordConsent({ patientId: P3, action: "granted" }, crypto.randomUUID());
    fireEvent.click(screen.getByRole("checkbox", { name: "I have read this" }));
    fireEvent.click(screen.getByTestId("consent-give"));
    expect(
      await screen.findByText("Your consent was changed elsewhere. Here is the latest."),
    ).toBeTruthy();
    expect(await auditsOf(store, "citizen.consent.granted")).toHaveLength(1);
  });

  it("CTZ-P5 after verification: own record linked, consent given once → tabs", async () => {
    const view = await renderShell(<span data-testid="booted" />, {
      ...as(PERSONA_IDS.citizenPending),
      readyTestId: "booted",
    });
    await view.repo().verifyIdentity({ code: "246810" }, crypto.randomUUID());
    view.unmount();
    const { store } = await renderShell(<ConsentScreen />, {
      store: view.store,
      ...as(PERSONA_IDS.citizenPending),
      readyTestId: "consent-give",
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "I have read this" }));
    fireEvent.click(screen.getByTestId("consent-give"));
    fireEvent.click(screen.getByTestId("consent-give"));
    await waitFor(() => expect(lastHref()).toBe("/health"));
    const granted = (await auditsOf(store, "citizen.consent.granted")) as unknown as {
      entityId: string;
    }[];
    expect(granted.filter((e) => e.entityId === CITIZEN_OVERLAY_IDS.pendingPatient)).toHaveLength(
      1,
    );
    const records = (await store.getAll<{ patientId: string }>("consentRecords")).filter(
      (r) => r.patientId === CITIZEN_OVERLAY_IDS.pendingPatient,
    );
    expect(records).toHaveLength(1);
  });
});
