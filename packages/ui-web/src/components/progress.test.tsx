import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { expectNoAxeViolations, renderUi } from "../test/helpers.tsx";
import { BarList } from "./BarList.tsx";
import { ProgressBar } from "./ProgressBar.tsx";
import { SegmentedProgress } from "./SegmentedProgress.tsx";

describe("ProgressBar", () => {
  it("exposes progressbar semantics and clamps the value", async () => {
    const { container } = renderUi(
      <ProgressBar label="AI usage" value={140} max={100} valueText="100%" />,
    );
    const bar = screen.getByRole("progressbar", { name: "AI usage" });
    expect(bar.getAttribute("aria-valuenow")).toBe("100");
    expect(bar.getAttribute("aria-valuetext")).toBe("100 of 100");
    await expectNoAxeViolations(container);
  });
});

describe("SegmentedProgress", () => {
  it("renders total segments with completed ones marked", async () => {
    const { container } = renderUi(<SegmentedProgress label="Plan" total={8} completed={5} />);
    expect(container.querySelectorAll("[data-done]").length).toBe(5);
    expect(screen.getByRole("progressbar", { name: "Plan" }).getAttribute("aria-valuemax")).toBe(
      "8",
    );
    await expectNoAxeViolations(container);
  });
});

describe("BarList", () => {
  it("renders labelled bars scaled to the max and suppressed values as text", async () => {
    const { container } = renderUi(
      <BarList
        label="Screenings by facility"
        items={[
          { id: "a", label: "Alpha-1", value: 96 },
          { id: "b", label: "Alpha-2", value: 48 },
          { id: "c", label: "Beta-1", value: { value: null, suppressed: true } },
        ]}
      />,
    );
    expect(screen.getByRole("list", { name: "Screenings by facility" })).toBeTruthy();
    const widths = [...container.querySelectorAll<HTMLElement>("li [style]")].map(
      (el) => el.style.width,
    );
    expect(widths).toEqual(["100%", "50%", "0%"]);
    expect(screen.getByText("Suppressed (<5)")).toBeTruthy();
    await expectNoAxeViolations(container);
  });
});
