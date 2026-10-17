/**
 * HWM-06 submit result in the real shell: offline review → Save (tapped twice) → ONE screening +
 * ONE op and "Saved on this device · Will sync when a connection is available"; going online and
 * running one sync pass switches the SAME screen live to "Synced" with the server event time
 * (polite live region). "View screening" opens the detail.
 */
import type { Patient, Screening } from "@laif/domain";
import { FACILITY_IDS, PERSONA_IDS } from "@laif/mock-data";
import { createMemoryStoreAdapter } from "@laif/repositories";
import { createTestRepository } from "@laif/test-utils";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { invalidateAfterWrite } from "../../../data/queryKeys.ts";
import * as drafts from "../../../data/drafts.ts";
import { useSession } from "../../../session/useSession.ts";
import { routerLog } from "../../../test/router-stub.tsx";
import { renderShell } from "../../../test/shell-harness.tsx";
import { ScreeningReviewScreen } from "../ScreeningReviewScreen.tsx";

vi.mock("expo-router", () => import("../../../test/router-stub.tsx"));

const WORKER = PERSONA_IDS.chwAlpha1A;
const FACILITY = FACILITY_IDS.alpha1;

function SignedIn({ children }: { children: ReactNode }) {
  const { status, signIn } = useSession();
  useEffect(() => {
    if (status === "signed_out") void signIn(WORKER, FACILITY);
  }, [status, signIn]);
  return status === "signed_in" ? <>{children}</> : null;
}

async function offlineStoreWithDraft() {
  const store = createMemoryStoreAdapter();
  const t = await createTestRepository({ appId: "worker", persona: WORKER, store });
  await t.repo.demo.setFaults({ offline: true });
  const patient = (await store.getAll<Patient>("patients")).find((p) => p.facilityId === FACILITY)!;
  const draft = await drafts.create(t.repo, patient.id, t.key());
  await drafts.save(
    t.repo,
    draft,
    { systolic: 158, diastolic: 97, glucoseValue: null, glucoseUnit: null, glucoseContext: null },
    t.key(),
  );
  return { store, draftId: draft.id };
}

beforeEach(() => {
  routerLog.length = 0;
});

describe("SubmitSuccess (HWM-06)", () => {
  it("offline double tap → one screening + op, Saved on this device → live Synced after a pass", async () => {
    const { store, draftId } = await offlineStoreWithDraft();
    const view = await renderShell(
      <SignedIn>
        <ScreeningReviewScreen draftId={draftId} />
      </SignedIn>,
      { store, readyTestId: "review-screen" },
    );
    const save = screen.getByTestId("review-submit");
    fireEvent.click(save);
    fireEvent.click(save);
    await screen.findByTestId("submit-success", {}, { timeout: 8000 });

    expect(screen.getByTestId("submit-success-title").textContent).toBe("Saved on this device");
    expect(screen.getByTestId("submit-success-detail").textContent).toBe(
      "Will sync when a connection is available",
    );
    expect(screen.getByTestId("submit-success-status-pending").getAttribute("aria-live")).toBe(
      "polite",
    );
    const rows = (await store.getAll<Screening>("screenings")).filter((s) => s.id === draftId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).not.toBe("draft");
    const ops = await view.repo().sync.list({ entityId: draftId });
    expect(ops).toHaveLength(1);

    await act(async () => {
      await view.repo().demo.setFaults({ offline: false });
      await view.repo().sync.process({ trigger: "manual_dev" });
      await invalidateAfterWrite(view.services.queryClient);
    });
    await waitFor(
      () => expect(screen.getByTestId("submit-success-title").textContent).toBe("Synced"),
      { timeout: 8000 },
    );
    expect(screen.getByTestId("submit-success-status-synced")).toBeTruthy();
    expect(screen.getByTestId("submit-success-detail").textContent).toMatch(
      /^Received by the simulated server at \d{2}:\d{2}$/u,
    );

    fireEvent.click(screen.getByTestId("success-view"));
    expect(routerLog.at(-1)).toEqual({
      method: "replace",
      href: { pathname: "/screenings/[screeningId]", params: { screeningId: draftId } },
    });
    fireEvent.click(screen.getByTestId("success-back-today"));
    expect(routerLog.at(-1)).toEqual({ method: "replace", href: "/" });
  });
});
