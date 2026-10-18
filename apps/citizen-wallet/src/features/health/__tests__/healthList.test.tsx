/**
 * CTZ-03 My health list: CTZ-P1 follow-up result; CTZ-P2 dismissed screening as "Reviewed" and
 * a value-less pending card pinned on top (no flag reason / free text in the render tree);
 * skeleton loading (busy), empty and server-error + Retry states; representative banner;
 * one `citizen.result.list_viewed` per focus.
 */
import { createSeed, PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import type { Review, Screening } from "@laif/domain";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { auditsOf, renderShell } from "../../../test/harness.tsx";
import { resetRouter, routerLog } from "../../../test/router-stub.tsx";
import { HealthListScreen } from "../HealthListScreen.tsx";

vi.mock("expo-router", () => import("../../../test/router-stub.tsx"));

const as = (personaId: string) => ({
  before: (s: { session: { switchTo: (id: string) => unknown } }) =>
    void s.session.switchTo(personaId),
});
const P2_PENDING = SEED_ANCHORS.CTZ_P2_AWAITING_REVIEW_SCREENING.screeningId;
const P2_DISMISSED = SEED_ANCHORS.CTZ_P2_DISMISSED_SCREENING;
const seed = createSeed();

describe("My health list", () => {
  beforeEach(() => resetRouter(["(app)", "(tabs)", "health"]));

  it("CTZ-P1: follow-up result with chip, values + units and reviewer; opens the detail", async () => {
    const { store } = await renderShell(<HealthListScreen />, as(PERSONA_IDS.citizen1));
    const list = await screen.findByTestId("results-list", {}, { timeout: 10_000 });
    expect(screen.getByText("Hello, Xelrix")).toBeTruthy();
    expect(screen.getByText("Results your care team has shared with you")).toBeTruthy();
    const chips = within(list).getAllByTestId("result-chip-followUpAgreed");
    expect(chips.length).toBeGreaterThan(0);
    expect(list.textContent).toMatch(/\d+\/\d+ mmHg/u);
    expect(list.textContent).toMatch(/\d+\.\d mmol\/L/u);
    expect(within(list).getAllByTestId("review-provenance")[0]?.textContent).toMatch(
      /^Reviewed by /u,
    );
    const cards = within(list).getAllByRole("button");
    fireEvent.click(cards[0]!);
    expect(routerLog.at(-1)).toMatchObject({
      method: "push",
      href: { pathname: "/health/[observationId]" },
    });
    expect(screen.queryByTestId("representative-banner")).toBeNull();
    await waitFor(async () =>
      expect(await auditsOf(store, "citizen.result.list_viewed")).toHaveLength(1),
    );
  });

  it("CTZ-P2: pending placeholder on top without values; dismissed flag shown as Reviewed", async () => {
    const view = await renderShell(<HealthListScreen />, as(PERSONA_IDS.citizen2));
    const list = await screen.findByTestId("results-list", {}, { timeout: 10_000 });
    const pending = within(list).getByTestId(`pending-card-${P2_PENDING}`);
    expect(list.firstElementChild).toBe(pending);
    expect(pending.textContent).toContain(
      "A recent check is waiting for your care team. You will see it here after they review it.",
    );
    // No values, units, dates or flags on the placeholder.
    const raw = seed.screenings.find((s: Screening) => s.id === P2_PENDING)!;
    expect(pending.textContent).not.toMatch(/mmHg|mmol|mg\/dL|\d/u);
    if (raw.systolic !== null) expect(view.container.textContent).not.toContain(`${raw.systolic}/`);

    const dismissed = within(list).getByTestId(`result-card-${P2_DISMISSED.screeningId}`);
    expect(within(dismissed).getByTestId("result-chip-reviewedNoActionNeeded").textContent).toBe(
      "Reviewed",
    );
    // The original flag reason / dismiss reason / free text never reach the render tree.
    const review = seed.reviews.find((r: Review) => r.id === P2_DISMISSED.reviewId)!;
    const text = view.container.textContent ?? "";
    for (const forbidden of [
      "Measurement error suspected",
      "measurement_error_suspected",
      "Repeat reading acceptable",
      "Known condition already managed",
      ...(review.decisionReason ? [review.decisionReason] : []),
      ...review.flagReasons,
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("CTZ-P4: representative banner with the represented patient's name", async () => {
    await renderShell(<HealthListScreen />, as(PERSONA_IDS.citizenRep));
    await screen.findByTestId("results-list", {}, { timeout: 10_000 });
    expect(screen.getByTestId("representative-banner").textContent).toContain(
      "Viewing for Qorzo Texaumbra",
    );
  });

  it("loading = 2 busy skeleton cards; empty state copy", async () => {
    const view = await renderShell(<HealthListScreen />, {
      ...as(PERSONA_IDS.citizen1),
      readyTestId: "health-screen",
    });
    await screen.findByTestId("results-list", {}, { timeout: 10_000 });
    const repo = view.repo();
    let release: (v: []) => void = () => undefined;
    const spy = vi
      .spyOn(repo, "listReleasedObservations")
      .mockImplementation(() => new Promise((resolve) => (release = resolve)));
    void view.services.queryClient.resetQueries({
      predicate: (q) => q.queryKey.includes("observations"),
    });
    const loading = await screen.findByTestId("loading-state");
    expect(loading.getAttribute("aria-busy")).toBe("true");
    release([]);
    expect(await screen.findByText("No results shared with you yet")).toBeTruthy();
    expect(
      screen.getByText(
        "No results shared with you yet. Your care team shares results after they review them.",
      ),
    ).toBeTruthy();
    spy.mockRestore();
  });

  it("server error (fault error500) → error state + Retry recovers", async () => {
    const view = await renderShell(<HealthListScreen />, as(PERSONA_IDS.citizen1));
    await screen.findByTestId("results-list", {}, { timeout: 10_000 });
    await view.repo().demo.setFaults({ serverErrorRate: 1 });
    await view.services.queryClient.resetQueries({
      predicate: (q) => q.queryKey.includes("observations"),
    });
    expect(await screen.findByTestId("error-state", {}, { timeout: 10_000 })).toBeTruthy();
    expect(screen.queryByTestId("results-list")).toBeNull();
    await view.repo().demo.setFaults({ serverErrorRate: 0 });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("results-list", {}, { timeout: 10_000 })).toBeTruthy();
  });
});
