import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations, renderUi } from "../test/helpers.tsx";
import { ExpandableRow } from "./ExpandableRow.tsx";

describe("ExpandableRow", () => {
  it("toggles with the keyboard and reflects aria-expanded", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = renderUi(
      <ExpandableRow title="Two sources disagree" subtitle="choose one" onExpandedChange={onChange}>
        <p>Details here</p>
      </ExpandableRow>,
    );
    const button = screen.getByRole("button", { name: /Two sources disagree/ });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Details here")).toBeNull();

    await user.tab();
    expect(document.activeElement).toBe(button);
    await user.keyboard("{Enter}");
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Details here")).toBeTruthy();
    expect(document.getElementById(button.getAttribute("aria-controls") ?? "")?.hidden).toBe(false);

    await user.keyboard(" ");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(onChange.mock.calls).toEqual([[true], [false]]);
    await expectNoAxeViolations(container);
  });

  it("supports controlled mode", () => {
    renderUi(
      <ExpandableRow title="Row" expanded>
        <p>Open content</p>
      </ExpandableRow>,
    );
    expect(screen.getByText("Open content")).toBeTruthy();
  });
});
