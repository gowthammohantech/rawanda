import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations, renderUi } from "../test/helpers.tsx";
import { ConflictNotice } from "./ConflictNotice.tsx";

describe("ConflictNotice", () => {
  it("compares your version vs latest with who/when and both resolutions", async () => {
    const user = userEvent.setup();
    const onResolve = vi.fn();
    const { container } = renderUi(
      <ConflictNotice
        rows={[
          { id: "status", label: "Status", yours: "Scheduled", latest: "Cancelled" },
          { id: "owner", label: "Owner", yours: "Aline", latest: "Aline" },
        ]}
        changedBy="Demo Coordinator"
        changedAt="2026-10-14T06:00:00.000Z"
        onResolve={onResolve}
      />,
    );
    const table = screen.getByRole("table");
    expect(within(table).getByRole("columnheader", { name: "Your version" })).toBeTruthy();
    expect(within(table).getByRole("columnheader", { name: "Latest version" })).toBeTruthy();
    expect(container.querySelectorAll("[data-changed]")).toHaveLength(1);
    expect(
      screen.getByText(/Changed by Demo Coordinator · Changed at 14 Oct 2026, 08:00/),
    ).toBeTruthy();
    expect(screen.getByText("Conflict", { exact: false })).toBeTruthy();

    await user.click(
      screen.getByRole("button", { name: "Re-apply my change on the latest version" }),
    );
    expect(onResolve).toHaveBeenCalledWith("reapply_on_latest");
    await user.click(screen.getByRole("button", { name: "Keep the latest version" }));
    expect(onResolve).toHaveBeenCalledWith("keep_latest");
    await expectNoAxeViolations(container);
  });

  it("disables the other action while one resolution is applying", () => {
    renderUi(<ConflictNotice rows={[]} onResolve={() => undefined} resolving="keep_latest" />);
    const reapply = screen.getByRole<HTMLButtonElement>("button", { name: /Re-apply/ });
    expect(reapply.disabled).toBe(true);
  });
});
