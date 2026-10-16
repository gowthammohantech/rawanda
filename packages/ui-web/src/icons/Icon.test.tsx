import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Icon } from "./Icon.tsx";

describe("Icon", () => {
  it("is decorative (aria-hidden) by default", () => {
    const { container } = render(<Icon name="bell" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.getAttribute("data-icon")).toBe("bell");
  });

  it("is a labelled image when given a title", () => {
    const { getByRole } = render(<Icon name="alert" title="Warning" />);
    expect(getByRole("img", { name: "Warning" })).toBeTruthy();
  });
});
