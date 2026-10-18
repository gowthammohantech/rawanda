/**
 * ADM-07 report builder: the keyboard flow through the 4 steps, reason validation (EN / RW,
 * focus on the first error), the disabled record-level option, the facility manager's
 * preview-only mode, and a successful export (toast + history row with a checksum).
 */
import { PERSONA_IDS } from "@laif/mock-data";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { bootApp } from "../../test/app.tsx";

const PATH = "/admin/reports?template=programme_summary";

async function openReports(personaId: string) {
  const result = await bootApp({ path: PATH, signInAs: personaId });
  await screen.findByTestId("report-builder", {}, { timeout: 15_000 });
  return result;
}

const clicks: string[] = [];

beforeEach(() => {
  clicks.length = 0;
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: vi.fn(() => "blob:report"),
      revokeObjectURL: vi.fn(),
    }),
  );
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicks.push(this.download);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ReportBuilder", () => {
  it("keyboard flow: template → preview → reason (validation) → export → history", async () => {
    const user = userEvent.setup();
    await openReports(PERSONA_IDS.analystAlpha);
    // Step 1: the template preselected from the URL; record-level option disabled.
    const group = screen.getByRole("group", { name: /Report template/ });
    expect(within(group).getByRole("radio", { name: /Programme summary/ })).toHaveProperty(
      "checked",
      true,
    );
    expect(
      within(group).getByRole("radio", { name: /De-identified record-level CSV/ }),
    ).toHaveProperty("disabled", true);
    expect(screen.getByText(/record-level export requires data-governance approval/)).toBeTruthy();
    await user.selectOptions(screen.getByLabelText("Granularity"), "facility");
    screen.getByRole("button", { name: "Next" }).focus();
    await user.keyboard("{Enter}");

    // Step 2: preview with suppression legend and counts; the heading takes focus.
    await screen.findByTestId("report-preview");
    await screen.findByTestId("preview-row-count", {}, { timeout: 10_000 });
    expect(document.activeElement).toBe(screen.getByTestId("report-step-heading"));
    expect(screen.getByTestId("report-step-heading").textContent).toBe("Step 2 of 4: Preview");
    expect(screen.getByTestId("preview-row-count").textContent).toBe("Rows: 14");
    expect(screen.getByTestId("preview-legend").textContent).toContain("<5");
    await user.click(screen.getByRole("button", { name: "Next" }));

    // Step 3: submitting without a reason shows the errors, focus on the first one.
    await screen.findByTestId("export-reason-form");
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Choose a reason for the export")).toBeTruthy();
    expect(
      screen.getByText("Confirm that the export contains aggregate figures only"),
    ).toBeTruthy();
    expect(document.activeElement?.getAttribute("type")).toBe("radio");
    await user.click(screen.getByRole("radio", { name: "Other" }));
    await user.type(screen.getByLabelText(/Details/), "short");
    await user.click(screen.getByRole("checkbox", { name: /aggregate figures only/ }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Describe the reason in 10 to 300 characters")).toBeTruthy();
    await user.click(screen.getByRole("radio", { name: "District meeting" }));
    await user.clear(screen.getByLabelText(/Details/));
    await user.click(screen.getByRole("button", { name: "Next" }));

    // Step 4: export → toast + a GENERATED history row with a checksum.
    const exportButton = await screen.findByTestId("export-button");
    expect(exportButton).toHaveProperty("disabled", false);
    await user.click(exportButton);
    const done = await screen.findByTestId("export-done", {}, { timeout: 10_000 });
    expect(done.textContent).toMatch(/laif-demo_programme_summary_dist-alpha_.*\.csv/);
    expect(clicks).toHaveLength(1);
    expect(screen.getAllByText(/^Export generated · laif-demo_/).length).toBeGreaterThan(0);
    const history = screen.getByTestId("export-history");
    await waitFor(() => expect(within(history).getByText("GENERATED")).toBeTruthy());
    expect(within(history).getByText("District meeting")).toBeTruthy();
  });

  it("validation messages are translated (RW)", async () => {
    const user = userEvent.setup();
    const { services } = await openReports(PERSONA_IDS.analystAlpha);
    await services.i18n.setLanguage("rw");
    await user.click(await screen.findByRole("button", { name: "Komeza" }));
    await screen.findByTestId("preview-row-count", {}, { timeout: 10_000 });
    await user.click(screen.getByRole("button", { name: "Komeza" }));
    await screen.findByTestId("export-reason-form");
    await user.click(screen.getByRole("button", { name: "Komeza" }));
    expect(await screen.findByText("Hitamo impamvu yo gukura raporo")).toBeTruthy();
    expect(screen.getByText("Emeza ko raporo irimo imibare rusange gusa")).toBeTruthy();
  });

  it("facility manager: preview-only, Export disabled with the reason", async () => {
    const user = userEvent.setup();
    await openReports(PERSONA_IDS.fmgrAlpha1);
    expect(screen.getByText("Preview only")).toBeTruthy();
    // District granularity is unavailable for a facility-only grant.
    const district = within(screen.getByLabelText("Granularity")).getByRole("option", {
      name: /By district/,
    });
    expect(district).toHaveProperty("disabled", true);
    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByTestId("preview-row-count", {}, { timeout: 10_000 });
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(await screen.findByRole("radio", { name: "Programme review" }));
    await user.click(screen.getByRole("checkbox", { name: /aggregate figures only/ }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    const button = await screen.findByTestId("export-button");
    expect(button).toHaveProperty("disabled", true);
    expect(button.getAttribute("aria-describedby")).toBe("export-denied-reason");
    expect(screen.getByText("Your role cannot export")).toBeTruthy();
  });
});
