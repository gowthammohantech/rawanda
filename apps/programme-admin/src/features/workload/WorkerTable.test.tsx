/**
 * WorkerTable (ADM-05 §10): worker codes only (no names anywhere on the page), small-cell
 * suppression of the low-volume Beta-1 worker (+ a complementary cell), no `danger` tone or
 * ranking badge, keyboard sort (Enter on a header) with `aria-sort`, default sort by code.
 */
import { createTestI18n, I18nProvider } from "@laif/i18n";
import { createSeed, DISTRICT_IDS, FACILITY_IDS, PERSONA_IDS, sliceForApp } from "@laif/mock-data";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { MemoryRouter } from "react-router";

import { bootApp } from "../../test/app.tsx";
import { DEFAULT_FILTERS } from "../filters/filterSchema.ts";
import type { WorkerRow } from "./selectWorkload.ts";
import { WorkerTable } from "./WorkerTable.tsx";

const CHART = { width: 800, height: 240 };
const ADMIN_ROLES = new Set(["programme_lead", "district_analyst", "facility_manager", "auditor"]);

async function openWorkload(
  path = "/admin/workload",
  personaId: string = PERSONA_IDS.leadProgramme,
) {
  const result = await bootApp({ path, signInAs: personaId, chartSize: CHART });
  await screen.findByTestId("worker-table", {}, { timeout: 15_000 });
  return result;
}

const table = () => within(screen.getByTestId("worker-table")).getByRole("table");
const bodyRows = () => within(table()).getAllByRole("row").slice(1);
const codes = () => bodyRows().map((r) => within(r).getByRole("rowheader").textContent ?? "");

describe("WorkerTable", () => {
  it("shows pseudonymous worker codes only — no staff display name anywhere on the page", async () => {
    await openWorkload();
    expect(codes().length).toBeGreaterThanOrEqual(5);
    for (const code of codes()) expect(code).toMatch(/^[A-Z]{2}-\d{3}$/);
    expect(codes()).toEqual(
      expect.arrayContaining(["HW-014", "HW-015", "HW-021", "HW-031", "HW-032"]),
    );
    const staff = (sliceForApp(createSeed(), "admin").personas ?? []).filter(
      (p) => p.workerCode !== null && !ADMIN_ROLES.has(p.role),
    );
    expect(staff.length).toBeGreaterThan(5);
    const text = document.body.textContent ?? "";
    for (const p of staff) expect(text).not.toContain(p.displayName);
    // No link to a task or patient — only facility filter links.
    for (const link of within(table()).queryAllByRole("link")) {
      expect(link.getAttribute("href")).toMatch(/^\/admin\/workload\?(.*&)?facility=/);
    }
  });

  it("District Beta: the low-volume worker shows <5 and one more cell is hidden", async () => {
    await openWorkload(`/admin/workload?district=${DISTRICT_IDS.beta}`);
    expect(codes()).toEqual(["HW-031", "HW-032"]);
    const small = bodyRows()[1]!;
    const cells = within(small).getAllByRole("cell");
    expect(cells[1]?.textContent).toContain("<5"); // assigned
    expect(cells[1]?.textContent).toContain("Fewer than 5, hidden to protect privacy");
    const hiddenComplementary = within(table()).getAllByText("Hidden", { exact: true });
    expect(hiddenComplementary.length).toBeGreaterThanOrEqual(1);
  });

  it("no danger tone, no ranking badge; overdue uses the neutral warning token with icon + text", () => {
    const cell = (key: string, value: number | null) => ({ key, value, suppressed: false });
    const row = (
      code: string,
      assigned: number,
      completed: number,
      overdue: number,
    ): WorkerRow => ({
      key: `${code}@${FACILITY_IDS.alpha1}`,
      workerCode: code,
      facilityId: FACILITY_IDS.alpha1,
      districtId: DISTRICT_IDS.alpha,
      assigned: cell(code, assigned),
      completed: cell(code, completed),
      completionRate: cell(code, completed / assigned),
      overdue: cell(code, overdue),
      unableToReach: cell(code, 0),
      minutesPerPatientDay: cell(code, 42.5),
      noContacts: false,
    });
    render(
      <I18nProvider i18n={createTestI18n("en", { appId: "admin" })}>
        <MemoryRouter>
          <WorkerTable
            rows={[row("HW-099", 20, 2, 12), row("HW-098", 20, 20, 0)]}
            threshold={5}
            filters={DEFAULT_FILTERS}
          />
        </MemoryRouter>
      </I18nProvider>,
    );
    const root = screen.getByTestId("worker-table");
    expect(root.querySelector('[data-tone="danger"]')).toBeNull();
    expect(root.innerHTML).not.toMatch(/danger|positive|success/);
    expect(root.textContent).not.toMatch(/\b(top|bottom|best|worst)\b/i);
    const warning = root.querySelectorAll('[data-tone="warning"]');
    expect(warning.length).toBeGreaterThan(0);
    expect(warning[0]?.textContent).toMatch(/overdue/);
  });

  it("default sort by worker code; Enter on a header sorts and updates aria-sort", async () => {
    const user = userEvent.setup();
    await openWorkload();
    const header = (name: RegExp) =>
      within(table())
        .getAllByRole("columnheader")
        .find((th) => name.test(th.textContent ?? ""))!;
    expect(header(/Worker code/).getAttribute("aria-sort")).toBe("ascending");
    expect(codes()).toEqual([...codes()].sort());
    expect(header(/^Completed/).getAttribute("aria-sort")).toBe("none");
    within(header(/^Completed/))
      .getByRole("button")
      .focus();
    await user.keyboard("{Enter}");
    expect(header(/^Completed/).getAttribute("aria-sort")).toBe("ascending");
    expect(header(/Worker code/).getAttribute("aria-sort")).toBe("none");
    await user.keyboard("{Enter}");
    expect(header(/^Completed/).getAttribute("aria-sort")).toBe("descending");
  });
});
