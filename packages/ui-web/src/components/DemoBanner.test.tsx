import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { expectNoAxeViolations, renderUi } from "../test/helpers.tsx";
import { DemoBanner } from "./DemoBanner.tsx";

describe("DemoBanner", () => {
  it("shows the fixed demo text in EN", async () => {
    const { container } = renderUi(<DemoBanner />);
    expect(
      screen.getByText("DEMONSTRATION — SYNTHETIC PATIENT DATA — NOT FOR CLINICAL USE"),
    ).toBeTruthy();
    await expectNoAxeViolations(container, true);
  });

  it("is translated to RW", () => {
    renderUi(<DemoBanner />, { language: "rw" });
    expect(
      screen.getByText("IGERAGEZA — AMAKURU Y'ABARWAYI B'IKITEGEREREZO — NTIBIKORESHWA MU BUVUZI"),
    ).toBeTruthy();
  });
});
