import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { expectNoAxeViolations, renderUi } from "../test/helpers.tsx";
import { Avatar, initialsOf } from "./Avatar.tsx";
import { Card } from "./Card.tsx";
import { KeyValueList } from "./KeyValueList.tsx";
import { MicroLabel } from "./MicroLabel.tsx";

describe("KeyValueList", () => {
  it("renders a description list", async () => {
    const { container } = renderUi(
      <KeyValueList
        items={[
          { label: "Plan", value: "Growth" },
          { label: "Renewal", value: "Nov 1" },
        ]}
      />,
    );
    expect(container.querySelectorAll("dl dt")).toHaveLength(2);
    expect(screen.getByText("Nov 1").tagName).toBe("DD");
    await expectNoAxeViolations(container);
  });
});

describe("Avatar", () => {
  it("shows initials only, labelled with the name", async () => {
    const { container } = renderUi(<Avatar name="Dr. Diane Nyira" />);
    expect(screen.getByRole("img", { name: "Dr. Diane Nyira" }).textContent).toBe("DN");
    expect(container.querySelector("img")).toBeNull();
    await expectNoAxeViolations(container);
  });

  it("computes initials", () => {
    expect(initialsOf("Habimana Noël")).toBe("HN");
    expect(initialsOf("Aline")).toBe("A");
    expect(initialsOf("  ")).toBe("");
  });

  it("can be decorative", () => {
    const { container } = renderUi(<Avatar name="X Y" decorative />);
    expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("MicroLabel / Card", () => {
  it("renders a mono uppercase label", () => {
    renderUi(<MicroLabel>Primary constraint</MicroLabel>);
    expect(screen.getByText("Primary constraint").className).toContain("micro-label");
  });

  it("renders a labelled card section", async () => {
    const { container } = renderUi(
      <Card title="Open items" eyebrow="Needs you" meta="3 open">
        <p>Body</p>
      </Card>,
    );
    expect(screen.getByRole("region", { name: "Open items" })).toBeTruthy();
    await expectNoAxeViolations(container);
  });
});
