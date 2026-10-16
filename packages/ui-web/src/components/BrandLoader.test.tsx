import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { expectNoAxeViolations, renderUi } from "../test/helpers.tsx";
import { BrandLoader } from "./BrandLoader.tsx";

describe("BrandLoader", () => {
  it("is a busy status with the translated message and reduced-motion classes", async () => {
    const { container } = renderUi(<BrandLoader />, { language: "rw" });
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(
      screen.getByText("Duhuza ubuvuzi, kuva mu muryango kugera ku kigo nderabuzima"),
    ).toBeTruthy();
    expect(container.innerHTML).toContain("motion-reduce:animate-none");
    await expectNoAxeViolations(container);
  });

  it("is no longer busy when leaving", () => {
    renderUi(<BrandLoader leaving layout="inline" message="Seeding" />);
    expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("false");
    expect(screen.getByText("Seeding")).toBeTruthy();
  });
});
