import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations, renderUi } from "../test/helpers.tsx";
import { Tabs } from "./Tabs.tsx";

describe("Tabs", () => {
  it("shows count badges and moves with arrow keys", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const { container } = renderUi(
      <Tabs
        label="Review queues"
        onValueChange={onValueChange}
        tabs={[
          { value: "needs", label: "Needs you", count: 8, content: <p>Needs content</p> },
          { value: "waiting", label: "Waiting", count: 5, content: <p>Waiting content</p> },
          { value: "done", label: "Resolved", count: 6, content: <p>Done content</p> },
        ]}
      />,
    );
    const list = screen.getByRole("tablist", { name: "Review queues" });
    expect(list).toBeTruthy();
    const first = screen.getByRole("tab", { name: /Needs you/ });
    expect(first.textContent).toContain("8");
    expect(first.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").textContent).toBe("Needs content");

    first.focus();
    await user.keyboard("{ArrowRight}");
    const second = screen.getByRole("tab", { name: /Waiting/ });
    expect(document.activeElement).toBe(second);
    expect(second.getAttribute("aria-selected")).toBe("true");
    expect(onValueChange).toHaveBeenCalledWith("waiting");
    expect(screen.getByRole("tabpanel").textContent).toBe("Waiting content");
    await expectNoAxeViolations(container);
  });
});
