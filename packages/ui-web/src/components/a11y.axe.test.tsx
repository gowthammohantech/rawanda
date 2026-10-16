import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Gallery } from "../../gallery/Gallery.tsx";
import { expectNoAxeViolations, renderUi } from "../test/helpers.tsx";

describe("all components (gallery page) — axe", () => {
  it.each(["en", "rw"] as const)(
    "has zero axe violations as a full page in %s",
    async (language) => {
      const { container } = renderUi(<Gallery />, { language, withToasts: true });
      expect(screen.getByRole("main")).toBeTruthy();
      expect(screen.getAllByRole("table").length).toBeGreaterThan(0);
      await expectNoAxeViolations(container, true);
    },
  );
});
