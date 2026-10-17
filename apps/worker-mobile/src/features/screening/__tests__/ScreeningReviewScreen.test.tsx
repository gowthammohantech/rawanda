/**
 * HWM-06 screens in the real shell: the review summary (every value with unit + context,
 * measured-at in Kigali time, ruleset version, flag card with disclaimer), Edit, a stale draft
 * (→ banner → form with the error summary), the submitted-screening detail (SUBMITTED + preview
 * → REVIEW REQUIRED after a sync pass) and the amendment flow (no reason → blocked; with reason
 * → original kept, before / after / author shown, AMENDED pill).
 */
import type { Patient, Screening } from "@laif/domain";
import { FACILITY_IDS, PERSONA_IDS } from "@laif/mock-data";
import { createMemoryStoreAdapter, type StoreAdapter } from "@laif/repositories";
import { createTestRepository, type TestRepository } from "@laif/test-utils";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { invalidateAfterWrite } from "../../../data/queryKeys.ts";
import * as drafts from "../../../data/drafts.ts";
import * as screenings from "../../../data/screenings.ts";
import { useSession } from "../../../session/useSession.ts";
import { routerLog } from "../../../test/router-stub.tsx";
import { renderShell } from "../../../test/shell-harness.tsx";
import { AmendScreeningScreen } from "../AmendScreeningForm.tsx";
import { ScreeningDetailScreen } from "../ScreeningDetailScreen.tsx";
import { ScreeningFormScreen } from "../ScreeningFormScreen.tsx";
import { ScreeningReviewScreen } from "../ScreeningReviewScreen.tsx";

vi.mock("expo-router", () => import("../../../test/router-stub.tsx"));

const WORKER = PERSONA_IDS.chwAlpha1A;
const FACILITY = FACILITY_IDS.alpha1;
const scope = { workerId: WORKER, facilityId: FACILITY };

function SignedIn({ children }: { children: ReactNode }) {
  const { status, signIn } = useSession();
  useEffect(() => {
    if (status === "signed_out") void signIn(WORKER, FACILITY);
  }, [status, signIn]);
  return status === "signed_in" ? <>{children}</> : null;
}

type Setup = { store: StoreAdapter; t: TestRepository; draftId: string };

async function setup(
  patch: Parameters<typeof drafts.save>[2] = {
    systolic: 148,
    diastolic: 90,
    glucoseValue: 7.8,
    glucoseUnit: "mmol/L",
    glucoseContext: "not_recorded",
    notes: "Came with a relative",
  },
): Promise<Setup> {
  const store = createMemoryStoreAdapter();
  const t = await createTestRepository({ appId: "worker", persona: WORKER, store });
  await t.repo.demo.setFaults({ offline: true });
  const patient = (await store.getAll<Patient>("patients")).find((p) => p.facilityId === FACILITY)!;
  const draft = await drafts.create(t.repo, patient.id, t.key());
  await drafts.save(t.repo, draft, patch, t.key());
  return { store, t, draftId: draft.id };
}

beforeEach(() => {
  routerLog.length = 0;
});

describe("ScreeningReviewScreen (HWM-06)", () => {
  it("shows every value with unit and context, measured-at, ruleset version and the flag card", async () => {
    const { store, draftId } = await setup();
    await renderShell(
      <SignedIn>
        <ScreeningReviewScreen draftId={draftId} />
      </SignedIn>,
      { store, readyTestId: "review-screen" },
    );
    expect(screen.getByText("Check before saving")).toBeTruthy();
    expect(screen.getByTestId("summary-bp").textContent).toContain("BLOOD PRESSURE");
    expect(screen.getByTestId("summary-bp").textContent).toContain("148/90 mmHg");
    expect(screen.getByTestId("summary-glucose").textContent).toContain("7.8 mmol/L");
    expect(screen.getByTestId("summary-context").textContent).toContain("Not recorded");
    expect(screen.getByTestId("summary-measured-at").textContent).toMatch(
      /MEASURED AT.*14 Oct 2026, 08:00 \(Kigali time\)/u,
    );
    expect(screen.getByTestId("summary-notes").textContent).toContain("Came with a relative");
    // 148 ≥ demo systolic threshold → may need review; not_recorded → information item.
    expect(screen.getByTestId("flag-may-need-review")).toBeTruthy();
    expect(screen.getByTestId("flag-info-GLUCOSE_CONTEXT_NOT_RECORDED")).toBeTruthy();
    expect(screen.getByTestId("flag-ruleset").textContent).toMatch(/^Ruleset demo-ruleset-/u);
    expect(screen.getByTestId("flag-disclaimer")).toBeTruthy();

    fireEvent.click(screen.getByTestId("review-edit"));
    expect(routerLog.at(-1)).toEqual({
      method: "replace",
      href: { pathname: "/screenings/draft/[draftId]", params: { draftId } },
    });
  });

  it("a stale / invalid draft shows the banner and returns to the form with its error summary", async () => {
    const { store, draftId } = await setup({ systolic: 150, diastolic: null });
    await renderShell(
      <SignedIn>
        <ScreeningReviewScreen draftId={draftId} />
      </SignedIn>,
      { store, readyTestId: "review-invalid" },
    );
    expect(screen.getByTestId("review-invalid-banner").textContent).toContain(
      "Some entries need attention",
    );
    expect(screen.queryByTestId("review-submit")).toBeNull();
    fireEvent.click(screen.getByTestId("review-back-to-form"));
    expect(routerLog.at(-1)).toEqual({
      method: "replace",
      href: { pathname: "/screenings/draft/[draftId]", params: { draftId, revalidate: "1" } },
    });
  });

  it("the form opened with revalidate shows the error summary at once", async () => {
    const { store, draftId } = await setup({ systolic: 150, diastolic: null });
    await renderShell(
      <SignedIn>
        <ScreeningFormScreen draftId={draftId} revalidate />
      </SignedIn>,
      { store, readyTestId: "screening-form-screen" },
    );
    const summary = await screen.findByTestId("error-summary", {}, { timeout: 8000 });
    expect(within(summary).getByTestId("error-link-diastolic")).toBeTruthy();
  });
});

describe("ScreeningDetailScreen + amendment (HWM-06)", () => {
  async function submittedSetup() {
    const s = await setup({
      systolic: 162,
      diastolic: 98,
      glucoseValue: null,
      glucoseUnit: null,
      glucoseContext: null,
    });
    const outcome = await screenings.submitFromDraft(s.t.repo, scope, s.draftId, s.t.clock.now());
    if (outcome.status !== "submitted") throw new Error(outcome.status);
    return s;
  }

  it("pending: SUBMITTED + preview; after a pass: REVIEW REQUIRED + sent to the clinician queue", async () => {
    const { store, draftId } = await submittedSetup();
    const view = await renderShell(
      <SignedIn>
        <ScreeningDetailScreen screeningId={draftId} />
      </SignedIn>,
      { store, readyTestId: "screening-detail-screen" },
    );
    await screen.findByTestId("detail-status", {}, { timeout: 8000 });
    expect(screen.getByTestId("status-submitted")).toBeTruthy();
    expect(screen.getByTestId("status-note").textContent).toBe(
      "Waiting for the server to confirm the review status",
    );
    expect(screen.getByTestId("flag-preview")).toBeTruthy();
    expect(screen.getByTestId("sync-timeline").textContent).toContain("Saved on this device");
    expect(screen.getByTestId("sync-timeline").textContent).toContain("Waiting to send");

    await act(async () => {
      await view.repo().demo.setFaults({ offline: false });
      await view.repo().sync.process({ trigger: "manual_dev" });
      await invalidateAfterWrite(view.services.queryClient);
    });
    await screen.findByTestId("status-review-required", {}, { timeout: 8000 });
    expect(screen.getByTestId("status-note").textContent).toBe(
      "Sent to clinician queue (simulated)",
    );
    expect(screen.getByTestId("flag-confirmed")).toBeTruthy();
    expect(screen.getByTestId("sync-timeline").textContent).toContain("Sent · 1 attempt");
    expect(screen.getByTestId("timeline-outcome").textContent).toContain("Synced");

    fireEvent.click(screen.getByTestId("detail-correct-header"));
    expect(routerLog.at(-1)).toEqual({
      method: "push",
      href: { pathname: "/screenings/[screeningId]/amend", params: { screeningId: draftId } },
    });
  });

  it("amend: no reason → blocked; with a reason → original kept, before/after/author, Amended", async () => {
    const { store, draftId } = await submittedSetup();
    const first = await renderShell(
      <SignedIn>
        <AmendScreeningScreen screeningId={draftId} />
      </SignedIn>,
      { store, readyTestId: "amend-screen" },
    );
    fireEvent.click(
      within(screen.getByTestId("amend-field")).getByRole("radio", { name: "Systolic" }),
    );
    const value = screen.getByTestId<HTMLInputElement>("amend-value");
    expect(value.value).toBe("162");
    fireEvent.change(value, { target: { value: "126" } });
    fireEvent.click(screen.getByTestId("amend-save"));
    expect((await screen.findByTestId("amend-reason-required")).textContent).toContain(
      "Give a reason for the correction",
    );
    let stored = (await store.get<Screening>("screenings", draftId))!;
    expect(stored.amendments).toEqual([]);

    fireEvent.click(screen.getByTestId("amend-preset-0"));
    expect(screen.getByTestId<HTMLTextAreaElement>("amend-reason").value).toBe("Typing error");
    fireEvent.change(screen.getByTestId("amend-reason"), {
      target: { value: "Typing error — cuff showed 126" },
    });
    fireEvent.click(screen.getByTestId("amend-save"));
    await waitFor(() =>
      expect(routerLog.at(-1)).toEqual({
        method: "replace",
        href: { pathname: "/screenings/[screeningId]", params: { screeningId: draftId } },
      }),
    );
    stored = (await store.get<Screening>("screenings", draftId))!;
    expect(stored.systolic).toBe(162);
    expect(stored.amendments).toHaveLength(1);
    expect(stored.amendments[0]).toMatchObject({ before: 162, after: 126, amendedBy: WORKER });
    const ops = await first.repo().sync.list({ entityId: draftId });
    expect(ops.map((op) => op.opType)).toEqual(["create", "update"]);
    first.unmount();

    await renderShell(
      <SignedIn>
        <ScreeningDetailScreen screeningId={draftId} />
      </SignedIn>,
      { store, readyTestId: "screening-detail-screen" },
    );
    await screen.findByTestId("status-amended", {}, { timeout: 8000 });
    expect(screen.getByTestId("summary-bp").textContent).toContain("126/98 mmHg");
    expect(screen.getByTestId("amended-field")).toBeTruthy();
    const row = screen.getByTestId(`amendment-${stored.amendments[0]!.id}`);
    expect(within(row).getByTestId("amendment-change").textContent).toBe("162 mmHg → 126 mmHg");
    expect(within(row).getByTestId("amendment-reason").textContent).toBe(
      "Reason: Typing error — cuff showed 126",
    );
    expect(within(row).getByTestId("amendment-by").textContent).toMatch(/^.+ · 14 Oct 2026, /u);
    expect(screen.getByTestId("sync-timeline").textContent).toContain("Correction: Systolic");
  });
});
