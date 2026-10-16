import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { expectNoAxeViolations, renderUi } from "../test/helpers.tsx";
import { TrendChart } from "./TrendChart.tsx";

describe("TrendChart", () => {
  it("is an SVG image with title/desc and a visually hidden data table", async () => {
    const { container } = renderUi(
      <TrendChart
        title="Screenings per week"
        description="Screened rises from 46 to 58; flagged stays below 15."
        categories={["SEP 4", "SEP 11", "SEP 18"]}
        series={[
          { id: "screened", label: "Screened", values: [46, 51, 58] },
          { id: "flagged", label: "Flagged", values: [12, null, 8], tone: "danger", dashed: true },
        ]}
      />,
    );
    const img = screen.getByRole("img", { name: /Screenings per week/ });
    expect(img.querySelector("title")?.textContent).toBe("Screenings per week");
    expect(img.querySelector("desc")?.textContent).toContain("58");
    const table = screen.getByRole("table", { name: "Chart data: Screenings per week" });
    expect(table.className).toContain("sr-only");
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(4);
    expect(within(rows[2] as HTMLElement).getByText("Not recorded")).toBeTruthy();
    expect(container.querySelectorAll("polyline")).toHaveLength(2);
    await expectNoAxeViolations(container);
  });
});
