import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { expectNoAxeViolations, renderUi } from "../test/helpers.tsx";
import { Button } from "./Button.tsx";
import { Drawer } from "./Drawer.tsx";

describe("Drawer", () => {
  it("opens as a named dialog, closes with the close button and returns focus", async () => {
    const user = userEvent.setup();
    renderUi(
      <Drawer
        trigger={<Button>Open referral</Button>}
        title="Referral"
        footer={<Button>Save</Button>}
      >
        <p>Details</p>
      </Drawer>,
    );
    const trigger = screen.getByRole("button", { name: "Open referral" });
    await user.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Referral" });
    expect(screen.getByText("Details")).toBeTruthy();
    await expectNoAxeViolations(dialog);
    await user.click(screen.getByRole("button", { name: "Close dialog" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });
});
