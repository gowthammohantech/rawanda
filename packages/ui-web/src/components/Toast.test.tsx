import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations, renderUi } from "../test/helpers.tsx";
import { Button } from "./Button.tsx";
import { useToast } from "./Toast.tsx";

function Trigger({ duration }: { duration?: number }) {
  const { toast } = useToast();
  return (
    <Button
      onClick={() =>
        toast({
          title: "Saved",
          description: "Referral updated",
          ...(duration === undefined ? {} : { duration }),
        })
      }
    >
      Save
    </Button>
  );
}

afterEach(() => vi.useRealTimers());

describe("Toast / useToast", () => {
  it("announces politely and can be dismissed", async () => {
    const user = userEvent.setup();
    const { container } = renderUi(<Trigger duration={0} />, { withToasts: true });
    await user.click(screen.getByRole("button", { name: "Save" }));
    const region = screen.getByRole("status");
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.textContent).toContain("Saved");
    await expectNoAxeViolations(container);
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("Saved")).toBeNull();
  });

  it("auto-dismisses after the duration", () => {
    vi.useFakeTimers();
    renderUi(<Trigger duration={1000} />, { withToasts: true });
    act(() => screen.getByRole("button", { name: "Save" }).click());
    expect(screen.getByText("Saved")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(1001);
    });
    expect(screen.queryByText("Saved")).toBeNull();
  });

  it("throws outside a ToastProvider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => renderUi(<Trigger />)).toThrow(/ToastProvider/);
    spy.mockRestore();
  });
});
