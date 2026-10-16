import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations, renderUi } from "../test/helpers.tsx";
import { Button } from "./Button.tsx";
import { ConfirmDialog } from "./ConfirmDialog.tsx";

describe("ConfirmDialog", () => {
  it("reason variant keeps Confirm disabled until ≥ 10 non-whitespace chars", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    renderUi(
      <ConfirmDialog
        trigger={<Button>Dismiss flag</Button>}
        title="Dismiss this flag?"
        description="The reason is recorded."
        variant="destructive"
        requireReason
        onConfirm={onConfirm}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Dismiss flag" }));
    const dialog = await screen.findByRole("dialog", { name: "Dismiss this flag?" });
    const confirm = screen.getByRole<HTMLButtonElement>("button", { name: "Confirm" });
    expect(confirm.disabled).toBe(true);

    const reason = screen.getByRole("textbox", { name: "Reason" });
    await user.type(reason, "too   short");
    expect(confirm.disabled).toBe(true);
    await user.clear(reason);
    await user.type(reason, "  Reading repeated normal  ");
    expect(confirm.disabled).toBe(false);
    await expectNoAxeViolations(dialog);
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith("Reading repeated normal");
  });

  it("Escape closes the dialog and focus returns to the trigger", async () => {
    const user = userEvent.setup();
    renderUi(
      <ConfirmDialog
        trigger={<Button>Reset demo</Button>}
        title="Reset demo data?"
        onConfirm={() => undefined}
      />,
    );
    const trigger = screen.getByRole("button", { name: "Reset demo" });
    await user.click(trigger);
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(document.activeElement).not.toBe(trigger);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it("traps focus inside the dialog", async () => {
    const user = userEvent.setup();
    renderUi(
      <ConfirmDialog
        trigger={<Button>Open</Button>}
        title="Confirm?"
        onConfirm={() => undefined}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Open" }));
    const dialog = await screen.findByRole("dialog");
    for (let i = 0; i < 5; i += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it("is not dismissible while loading", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderUi(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        loading
        title="Saving"
        onConfirm={() => undefined}
      />,
    );
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
