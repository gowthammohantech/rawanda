import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { expectNoAxeViolations, renderUi } from "../test/helpers.tsx";
import { KpiStrip } from "./KpiStrip.tsx";
import { MetricCard } from "./MetricCard.tsx";

describe("KpiStrip", () => {
  it("renders labels, formatted numbers and hints in one strip", async () => {
    const { container } = renderUi(
      <KpiStrip
        label="Queue"
        items={[
          { id: "a", label: "Pending reviews", value: 1312, hint: "in 30 days" },
          { id: "b", label: "Overdue", value: 4, tone: "danger" },
          { id: "c", label: "Rate", value: "83%" },
        ]}
      />,
    );
    expect(screen.getByText("1,312")).toBeTruthy();
    expect(screen.getByText("in 30 days")).toBeTruthy();
    expect(screen.getByText("83%")).toBeTruthy();
    expect(container.querySelectorAll("dt").length).toBe(3);
    await expectNoAxeViolations(container);
  });

  it('renders "Suppressed (<5)" for suppressed values', () => {
    renderUi(
      <KpiStrip
        items={[
          { id: "s", label: "Referrals in Beta", value: { value: null, suppressed: true } },
          { id: "z", label: "Zero", value: { value: 0, suppressed: false } },
        ]}
      />,
    );
    expect(screen.getByText("Suppressed (<5)")).toBeTruthy();
    expect(screen.getByText("0")).toBeTruthy();
  });

  it("uses the given threshold and translates (RW)", () => {
    renderUi(
      <KpiStrip
        suppressionThreshold={10}
        items={[{ label: "X", value: { value: 3, suppressed: true } }]}
      />,
      { language: "rw" },
    );
    expect(screen.getByText(/<10/)).toBeTruthy();
  });
});

describe("MetricCard", () => {
  it("renders a standalone card as a description list", async () => {
    const { container } = renderUi(
      <MetricCard label="Activation" value={31} hint="primary constraint" />,
    );
    expect(container.querySelector("dl > div > dt")?.textContent).toBe("Activation");
    expect(screen.getByText("31")).toBeTruthy();
    await expectNoAxeViolations(container);
  });
});
