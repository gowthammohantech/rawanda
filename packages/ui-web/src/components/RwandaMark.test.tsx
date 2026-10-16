import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { expectNoAxeViolations, renderUi } from "../test/helpers.tsx";
import { RwandaMark } from "./RwandaMark.tsx";

describe("RwandaMark", () => {
  it("renders the sun symbol (12 rays) and the translated wordmark", async () => {
    const { container } = renderUi(<RwandaMark />);
    expect(screen.getByText("CareConnect")).toBeTruthy();
    expect(screen.getByText("Rwanda")).toBeTruthy();
    expect(container.querySelectorAll('[aria-hidden="true"] > span').length).toBe(13);
    await expectNoAxeViolations(container);
  });

  it("symbol-only keeps a screen-reader name", () => {
    renderUi(<RwandaMark compact symbolOnly />);
    expect(screen.getByText("CareConnect").className).toContain("sr-only");
  });
});
