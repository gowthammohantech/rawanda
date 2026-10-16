import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { expectNoAxeViolations, renderUi } from "../test/helpers.tsx";
import { StatusChip } from "./StatusChip.tsx";
import { Stepper } from "./Stepper.tsx";

const steps = [
  { id: "created", label: "Created" },
  { id: "accepted", label: "Accepted" },
  { id: "scheduled", label: "Scheduled" },
  { id: "completed", label: "Completed" },
];

describe("Stepper", () => {
  it("marks done / current / upcoming with aria-current=step", async () => {
    const { container } = renderUi(<Stepper steps={steps} currentIndex={1} />);
    const items = container.querySelectorAll("li");
    expect([...items].map((li) => li.getAttribute("data-status"))).toEqual([
      "done",
      "current",
      "upcoming",
      "upcoming",
    ]);
    expect(items[1]?.getAttribute("aria-current")).toBe("step");
    expect(screen.getByText("Step 2 of 4, Current step")).toBeTruthy();
    expect(screen.getByRole("list", { name: "Progress steps" })).toBeTruthy();
    await expectNoAxeViolations(container);
  });

  it("renders explicit cancelled status and a terminal pill", () => {
    const { container } = renderUi(
      <Stepper
        steps={[steps[0]!, { ...steps[1]!, status: "cancelled" }]}
        currentIndex={1}
        terminal={<StatusChip tone="danger">Cancelled</StatusChip>}
      />,
    );
    expect(container.querySelector('[data-status="cancelled"]')).not.toBeNull();
    expect(screen.getAllByText(/Cancelled/).length).toBeGreaterThan(0);
  });
});
