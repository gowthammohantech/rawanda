/**
 * CTZ-02 route guard: signed out → welcome; CTZ-P3 (withdrawn) on a health route — including the
 * deep link `citizen-wallet://health` (= `/health`) — → consent-withdrawn + `access.denied`;
 * withdrawing from More blocks every tab at once, re-granting restores access; a
 * `CONSENT_REQUIRED` error from any query triggers the redirect.
 */
import { PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppGuard } from "../../navigation/AppGuard.tsx";
import { ConsentWithdrawnScreen } from "../../screens/wallet/ConsentWithdrawnScreen.tsx";
import { ManageConsentScreen } from "../../screens/wallet/ManageConsentScreen.tsx";
import { onConsentWithdrawn } from "../../state/events.ts";
import { auditsOf, renderShell } from "../../test/harness.tsx";
import { resetRouter, segments } from "../../test/router-stub.tsx";

vi.mock("expo-router", () => import("../../test/router-stub.tsx"));

const P1 = SEED_ANCHORS.CTZ_P1_APPOINTMENT_INSTRUCTION.patientId;
const P3 = SEED_ANCHORS.CTZ_P3_WITHDRAWN_PATIENT.patientId;
const as = (personaId: string) => ({
  before: (s: { session: { switchTo: (id: string) => unknown } }) =>
    void s.session.switchTo(personaId),
});
const HEALTH_DEEP_LINK = ["(app)", "(tabs)", "health"];

const redirectHref = async () =>
  (await screen.findByTestId("redirect", {}, { timeout: 10_000 })).getAttribute("data-href");

describe("wallet route guard", () => {
  beforeEach(() => resetRouter(HEALTH_DEEP_LINK));

  it("signed out → /welcome", async () => {
    await renderShell(<AppGuard />);
    expect(await redirectHref()).toBe("/welcome");
  });

  it("CTZ-P3 deep link to /health → consent-withdrawn, one access.denied, no health data", async () => {
    const { store } = await renderShell(<AppGuard />, as(PERSONA_IDS.citizenWithdrawn));
    expect(await redirectHref()).toBe("/consent-withdrawn");
    await waitFor(async () => {
      const denied = (await auditsOf(store, "access.denied")) as unknown as {
        entityId: string;
        changeSummary: { guard?: boolean; route?: string };
      }[];
      expect(
        denied.filter((d) => d.changeSummary.guard === true && d.entityId === P3),
      ).toHaveLength(1);
    });
    expect(await auditsOf(store, "citizen.result.viewed")).toHaveLength(0);
  });

  it("CTZ-P3 on the consent-withdrawn screen renders it without any health value", async () => {
    segments.current = ["(app)", "consent-withdrawn"];
    const view = await renderShell(
      <>
        <AppGuard />
        <ConsentWithdrawnScreen />
      </>,
      { ...as(PERSONA_IDS.citizenWithdrawn), readyTestId: "stack" },
    );
    expect(
      screen.getByText(
        "You stopped sharing. Your care team still has your record; this app no longer shows it.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Give consent again" })).toBeTruthy();
    // No result value, count or name reaches the screen.
    const text = view.container.textContent ?? "";
    expect(text).not.toMatch(/mmol|mmHg|glucose|blood pressure|\d+ results?/iu);
  });

  it("CTZ-P5 (not verified) → /verify", async () => {
    await renderShell(<AppGuard />, as(PERSONA_IDS.citizenPending));
    expect(await redirectHref()).toBe("/verify");
  });

  it("withdrawing from More blocks every tab immediately; re-granting restores access", async () => {
    const events: string[] = [];
    const off = onConsentWithdrawn((e) => events.push(e.patientId));
    const view = await renderShell(
      <>
        <AppGuard />
        <ManageConsentScreen />
      </>,
      { ...as(PERSONA_IDS.citizen1), readyTestId: "withdraw" },
    );
    expect(screen.getByTestId("stack")).toBeTruthy();
    fireEvent.click(screen.getByTestId("withdraw"));
    expect(await screen.findByText("Stop sharing your information?")).toBeTruthy();
    const confirm = screen.getAllByRole("button", { name: "Stop sharing" });
    fireEvent.click(confirm[confirm.length - 1]!);
    expect(await redirectHref()).toBe("/consent-withdrawn");
    expect(events).toEqual([P1]);
    expect(await auditsOf(view.store, "citizen.consent.withdrawn")).toHaveLength(1);
    // Clinical rows are not deleted by a withdrawal.
    expect(
      (await view.store.getAll<{ patientId: string }>("screenings")).some(
        (s) => s.patientId === P1,
      ),
    ).toBe(true);
    // Re-granting restores access (the guard renders the tabs stack again).
    await view.repo().recordConsent({ patientId: P1, action: "granted" }, crypto.randomUUID());
    await view.services.queryClient.invalidateQueries();
    expect(await screen.findByTestId("stack")).toBeTruthy();
    off();
  });

  it("every tab is blocked while consent is withdrawn", async () => {
    for (const tab of ["health", "next-steps", "reminders", "timeline", "more"]) {
      resetRouter(["(app)", "(tabs)", tab]);
      const view = await renderShell(<AppGuard />, as(PERSONA_IDS.citizenWithdrawn));
      expect(await redirectHref()).toBe("/consent-withdrawn");
      view.unmount();
    }
  });

  it("re-granting consent restores the tabs", async () => {
    const view = await renderShell(<AppGuard />, as(PERSONA_IDS.citizenWithdrawn));
    expect(await redirectHref()).toBe("/consent-withdrawn");
    await view.repo().recordConsent({ patientId: P3, action: "granted" }, crypto.randomUUID());
    await view.services.queryClient.invalidateQueries();
    expect(await screen.findByTestId("stack")).toBeTruthy();
  });

  it("a CONSENT_REQUIRED error from any query re-checks consent and redirects", async () => {
    const view = await renderShell(<AppGuard />, {
      ...as(PERSONA_IDS.citizen1),
      readyTestId: "stack",
    });
    // Withdrawn elsewhere: the guard's cached consent is still "granted".
    await view.repo().recordConsent({ patientId: P1, action: "withdrawn" }, crypto.randomUUID());
    await view.services.queryClient
      .fetchQuery({
        queryKey: ["ctz", PERSONA_IDS.citizen1, "patient", P1, "observations"],
        queryFn: () => view.repo().listReleasedObservations(P1),
        retry: false,
      })
      .catch(() => undefined);
    expect(await redirectHref()).toBe("/consent-withdrawn");
  });
});
