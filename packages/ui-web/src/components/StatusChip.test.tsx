import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations, renderUi } from "../test/helpers.tsx";
import { StatusChip } from "./StatusChip.tsx";
import { TONES } from "./tone.ts";

describe("StatusChip", () => {
  it.each(TONES)("renders an icon and text for tone %s", async (tone) => {
    const { container } = renderUi(<StatusChip tone={tone}>Needs review</StatusChip>);
    const chip = container.querySelector(`[data-tone="${tone}"]`);
    expect(chip?.querySelector("svg[data-icon]")).not.toBeNull();
    expect(screen.getByText("Needs review")).toBeTruthy();
    await expectNoAxeViolations(container);
  });

  it("throws when children are empty (status is never colour-only)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => renderUi(<StatusChip tone="danger">{""}</StatusChip>)).toThrow(
      /requires visible text/,
    );
    expect(() => renderUi(<StatusChip tone="danger">{null}</StatusChip>)).toThrow(
      /requires visible text/,
    );
    spy.mockRestore();
  });

  it("accepts an icon override", () => {
    const { container } = renderUi(
      <StatusChip tone="info" icon="sync">
        Syncing
      </StatusChip>,
    );
    expect(container.querySelector('svg[data-icon="sync"]')).not.toBeNull();
  });
});
