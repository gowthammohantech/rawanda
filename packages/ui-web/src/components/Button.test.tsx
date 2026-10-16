import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations, renderUi } from "../test/helpers.tsx";
import { Button, BUTTON_VARIANTS } from "./Button.tsx";

describe("Button", () => {
  it.each(BUTTON_VARIANTS)("renders the %s variant accessibly", async (variant) => {
    const { container } = renderUi(
      <Button variant={variant} icon="plus">
        Create
      </Button>,
    );
    expect(screen.getByRole("button", { name: "Create" })).toBeTruthy();
    await expectNoAxeViolations(container);
  });

  it("fires onClick once when clicked twice while its async action is pending", async () => {
    let resolve: () => void = () => undefined;
    const onClick = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    renderUi(<Button onClick={onClick}>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect((button as HTMLButtonElement).disabled).toBe(true);
    resolve();
    await vi.waitFor(() => expect(button.getAttribute("aria-busy")).toBeNull());
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("a loading button is disabled, aria-busy and ignores clicks", () => {
    const onClick = vi.fn();
    renderUi(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Save" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    expect(button.getAttribute("aria-busy")).toBe("true");
  });
});
