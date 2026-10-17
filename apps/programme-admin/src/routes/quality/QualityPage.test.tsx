/**
 * `/admin/quality` (ADM-06 §7, §9): eyebrow + 5 KPIs (PROXY pills on the review-outcome
 * figures), the "Flag review outcomes" / fairness / reasons card, the invariant check (0, check
 * icon), the corrected-at-source callout, the overview's open-issue count agreeing with the
 * queue's Open tab, RW pills, the empty period and an out-of-scope district → 403.
 */
import { DISTRICT_IDS, PERSONA_IDS } from "@laif/mock-data";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { bootApp } from "../../test/app.tsx";

const CHART = { width: 800, height: 240 };

async function openQuality(path = "/admin/quality", personaId: string = PERSONA_IDS.leadProgramme) {
  const result = await bootApp({ path, signInAs: personaId, chartSize: CHART });
  await screen.findByTestId("kpi-strip", {}, { timeout: 15_000 });
  return result;
}

const countOf = (el: HTMLElement): number => Number(/(\d+)\s*$/.exec(el.textContent ?? "")?.[1]);

describe("QualityPage", () => {
  it("programme lead: eyebrow, 5 KPIs, PROXY labels, invariant check, callout", async () => {
    await openQuality();
    expect(screen.getByText("SAFETY & QUALITY")).toBeTruthy();
    expect(screen.getByTestId("kpi-strip").children).toHaveLength(5);
    expect(screen.getByTestId("kpi-qualityMissingFields").textContent).toContain(
      "Screenings with missing required fields",
    );
    expect(screen.getByTestId("kpi-identityMismatches").textContent).toContain(
      "Possible identity mismatches",
    );
    expect(
      within(screen.getByTestId("kpi-overturnedFlagRate")).getByTestId("quality-proxy-pill")
        .textContent,
    ).toBe("PROXY");
    expect(screen.getByTestId("proxy-label").textContent).toBe("PROXY · not clinical accuracy");
    expect(screen.getByTestId("fairness-table").textContent).toContain("Age 60+");
    expect(screen.getByTestId("dismissal-reasons").textContent).toContain(
      "Measurement error suspected",
    );
    const evidence = screen.getByTestId("invariant-evidence");
    expect(evidence.getAttribute("data-holds")).toBe("true");
    expect(evidence.textContent).toContain("0");
    expect(screen.getByTestId("missing-field-bars").textContent).toContain("Glucose unit");
    expect(screen.getByTestId("quality-callout").textContent).toBe(
      "Issues are corrected at source by the facility through amendment events. Triage here tracks follow-up; it never edits clinical records.",
    );
    expect(screen.getByTestId("chart-quality-trend")).toBeTruthy();
  });

  it("the overview's open quality issues equal the queue's Open tab (after a triage)", async () => {
    const user = userEvent.setup();
    const { router } = await openQuality("/admin/quality", PERSONA_IDS.leadProgramme);
    await waitFor(() => expect(screen.getAllByTestId(/^issue-row-/).length).toBeGreaterThan(0), {
      timeout: 15_000,
    });
    const row = screen.getAllByTestId(/^issue-row-/)[0]!;
    await user.click(within(row).getAllByRole("button")[0]!);
    await user.click(within(row).getByRole("button", { name: "Acknowledge" }));
    await screen.findByText("Issue acknowledged");
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /^Acknowledged/ }).textContent).toMatch(/1$/),
    );
    const open = countOf(screen.getByRole("tab", { name: /^Open/ }));
    const openCell = screen.getByTestId("open-by-facility");
    expect(openCell).toBeTruthy();
    await router.navigate("/admin/overview");
    const card = await screen.findByTestId("attention-openQualityIssues", {}, { timeout: 15_000 });
    await waitFor(() => expect(card.textContent).toContain(String(open)));
  });

  it("RW: pills and the callout are translated", async () => {
    const user = userEvent.setup();
    await openQuality();
    await user.click(screen.getByRole("button", { name: "Ikinyarwanda" }));
    await waitFor(() =>
      expect(screen.getByTestId("quality-callout").textContent).toContain(
        "Ibibazo bikosorerwa aho byanditswe n'ikigo",
      ),
    );
    expect(
      within(screen.getByTestId("kpi-overturnedFlagRate")).getByTestId("quality-proxy-pill")
        .textContent,
    ).toBe("IGERERANYA");
    await waitFor(() => expect(screen.getAllByTestId("issue-type-pill").length).toBeGreaterThan(0));
    const pills = screen.getAllByTestId("issue-type-pill").map((p) => p.textContent);
    expect(pills.some((p) => p === "AMAKURU ABURA" || p === "CYAKUWEHO")).toBe(true);
  });

  it("empty period: 'No open issues in this period'", async () => {
    await openQuality("/admin/quality?preset=custom&from=2025-01-01&to=2025-01-31");
    expect(
      (await screen.findByTestId("queue-empty", {}, { timeout: 15_000 })).textContent,
    ).toContain("No open issues in this period");
  });

  it("District Alpha analyst: District Beta in the URL → 403", async () => {
    await bootApp({
      path: `/admin/quality?district=${DISTRICT_IDS.beta}`,
      signInAs: PERSONA_IDS.analystAlpha,
      waitFor: "forbidden-page",
    });
    expect(screen.queryByTestId("quality-page")).toBeNull();
  });
});
