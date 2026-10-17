/**
 * IssueQueue (ADM-06 §10): tabs with counts, keyboard expand (rule + ruleset version, history,
 * correct-at-source guidance, no edit control), acknowledge moves a row to the next tab, the
 * auditor sees read-only rows (no actions, lock note) and no patient name or synthetic
 * identifier appears anywhere on the page.
 */
import type { DataQualityIssue } from "@laif/contracts";
import { createSeed, PERSONA_IDS, sliceForApp } from "@laif/mock-data";
import { readStoreCollection } from "@laif/test-utils";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { auditEvents, bootApp } from "../../test/app.tsx";

const CHART = { width: 800, height: 240 };

async function openQuality(personaId: string = PERSONA_IDS.analystAlpha) {
  const result = await bootApp({ path: "/admin/quality", signInAs: personaId, chartSize: CHART });
  await screen.findByTestId("issue-queue", {}, { timeout: 15_000 });
  await waitFor(() => expect(screen.getAllByTestId(/^issue-row-/).length).toBeGreaterThan(0), {
    timeout: 15_000,
  });
  return result;
}

const tab = (name: RegExp) => screen.getByRole("tab", { name });
const countOf = (el: HTMLElement): number => Number(/(\d+)\s*$/.exec(el.textContent ?? "")?.[1]);

describe("IssueQueue", () => {
  it("tabs show counts; the Open tab lists the detected issues", async () => {
    const { store } = await openQuality();
    const open = countOf(tab(/^Open/));
    expect(open).toBeGreaterThan(0);
    expect(countOf(tab(/^Resolved/))).toBe(0);
    expect(screen.getAllByTestId(/^issue-row-/)).toHaveLength(Math.min(open, 20));
    // Detection persisted the issues once (system events, actor = system).
    const stored = await readStoreCollection<DataQualityIssue>(store, "dataQualityIssues");
    expect(stored.length).toBeGreaterThanOrEqual(open);
    const detected = await auditEvents(store, "admin.quality_issue.detected");
    expect(detected).toHaveLength(stored.length);
    expect(detected.every((e) => e.actorId === null)).toBe(true);
  });

  it("keyboard: Enter expands a row (rule, ruleset version, history, guidance, no edit control)", async () => {
    const user = userEvent.setup();
    await openQuality();
    const queue = screen.getByTestId("issue-queue");
    await user.click(within(queue).getByRole("button", { name: "Missing field" }));
    await waitFor(() =>
      expect(
        screen.getAllByTestId(/^issue-row-/).every((r) => r.textContent?.includes("MISSING FIELD")),
      ).toBe(true),
    );
    const row = screen.getAllByTestId(/^issue-row-/)[0]!;
    const toggle = within(row).getAllByRole("button")[0]!;
    toggle.focus();
    await user.keyboard("{Enter}");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(within(row).getByTestId("issue-detected").textContent).toContain("Glucose unit");
    expect(within(row).getByTestId("issue-rule").textContent).toContain("DQ-01-MANDATORY-FIELDS");
    expect(within(row).getByTestId("issue-ruleset").textContent).toMatch(/demo-ruleset-/);
    expect(within(row).getByTestId("correct-at-source")).toBeTruthy();
    expect(within(row).queryByRole("textbox")).toBeNull();
    await user.keyboard("{Enter}");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("acknowledge moves the row to the Acknowledged tab and updates the counts", async () => {
    const user = userEvent.setup();
    const { store } = await openQuality();
    const open = countOf(tab(/^Open/));
    const row = screen.getAllByTestId(/^issue-row-/)[0]!;
    const id = row.getAttribute("data-testid")!.replace("issue-row-", "");
    await user.click(within(row).getAllByRole("button")[0]!);
    await user.click(within(row).getByRole("button", { name: "Acknowledge" }));
    expect(await screen.findByText("Issue acknowledged")).toBeTruthy();
    await waitFor(() => expect(countOf(tab(/^Open/))).toBe(open - 1));
    expect(countOf(tab(/^Acknowledged/))).toBe(1);
    await user.click(tab(/^Acknowledged/));
    const moved = await screen.findByTestId(`issue-row-${id}`);
    expect(moved.getAttribute("data-status")).toBe("acknowledged");
    const triaged = await auditEvents(store, "admin.quality_issue.triaged");
    expect(triaged).toHaveLength(1);
    expect(triaged[0]).toMatchObject({ actorId: PERSONA_IDS.analystAlpha, entityId: id });
  });

  it("auditor: read-only rows with a lock note, no triage actions", async () => {
    const user = userEvent.setup();
    await openQuality(PERSONA_IDS.auditorProgramme);
    expect(screen.getByTestId("queue-readonly").textContent).toContain("Read-only");
    const row = screen.getAllByTestId(/^issue-row-/)[0]!;
    await user.click(within(row).getAllByRole("button")[0]!);
    expect(within(row).getByTestId("issue-readonly")).toBeTruthy();
    expect(within(row).queryByTestId("issue-actions")).toBeNull();
    expect(within(row).queryByRole("button", { name: "Acknowledge" })).toBeNull();
  });

  it("no patient name or synthetic identifier appears on the page", async () => {
    await openQuality(PERSONA_IDS.leadProgramme);
    await screen.findByTestId("kpi-strip", {}, { timeout: 15_000 });
    const text = document.body.textContent ?? "";
    for (const p of sliceForApp(createSeed(), "admin").patients) {
      expect(text).not.toContain(p.displayName);
      expect(text).not.toContain(p.syntheticIdentifier);
    }
  });
});
