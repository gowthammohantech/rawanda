import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { expectNoAxeViolations, renderUi } from "../test/helpers.tsx";
import { ReadingDisplay } from "./ReadingDisplay.tsx";

describe("ReadingDisplay", () => {
  it("renders blood pressure with its unit", async () => {
    const { container } = renderUi(
      <ReadingDisplay kind="bloodPressure" systolic={152} diastolic={96} />,
    );
    expect(screen.getByText("152/96 mmHg")).toBeTruthy();
    await expectNoAxeViolations(container);
  });

  it("renders glucose with unit and translated context", () => {
    renderUi(<ReadingDisplay kind="glucose" value={7.8} unit="mmol/L" context="non_fasting" />);
    expect(screen.getByText("7.8 mmol/L")).toBeTruthy();
    expect(screen.getByText(/· /).textContent).not.toContain("non_fasting");
  });

  it("never shows a bare number: a missing unit adds an UNIT MISSING chip", async () => {
    const { container } = renderUi(<ReadingDisplay kind="glucose" value={7.8} unit={null} />);
    expect(screen.getByText("7.8")).toBeTruthy();
    expect(screen.getByText("Unit missing")).toBeTruthy();
    expect(container.querySelector('[data-tone="warning"] svg')).not.toBeNull();
    await expectNoAxeViolations(container);
  });

  it("renders generic measurements", () => {
    renderUi(<ReadingDisplay kind="measurement" value={140} unit="mg/dL" />);
    expect(screen.getByText("140 mg/dL")).toBeTruthy();
  });
});
