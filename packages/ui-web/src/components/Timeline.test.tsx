import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { expectNoAxeViolations, renderUi } from "../test/helpers.tsx";
import { StatusChip } from "./StatusChip.tsx";
import { Timeline } from "./Timeline.tsx";

describe("Timeline", () => {
  it("renders an ordered date rail with titles, descriptions and chips", async () => {
    const { container } = renderUi(
      <Timeline
        label="Recent activity"
        items={[
          {
            id: "1",
            dateLabel: "OCT 2",
            dateTime: "2026-10-02T08:00:00.000Z",
            title: "Referral created",
            description: "Created by a demo clinician.",
            chip: <StatusChip tone="warning">Needs you</StatusChip>,
          },
          { id: "2", dateLabel: "OCT 1", title: "Screening submitted" },
        ]}
      />,
    );
    const list = screen.getByRole("list", { name: "Recent activity" });
    expect(list.tagName).toBe("OL");
    expect(container.querySelector("time")?.getAttribute("datetime")).toBe(
      "2026-10-02T08:00:00.000Z",
    );
    expect(screen.getByText("Needs you")).toBeTruthy();
    await expectNoAxeViolations(container);
  });
});
