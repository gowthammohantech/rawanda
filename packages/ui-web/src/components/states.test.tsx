import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations, renderUi } from "../test/helpers.tsx";
import { EmptyState } from "./EmptyState.tsx";
import { ErrorState } from "./ErrorState.tsx";
import { LoadingSkeleton } from "./LoadingSkeleton.tsx";
import { PermissionDenied } from "./PermissionDenied.tsx";

describe("EmptyState", () => {
  it("shows defaults and a clear-filters action", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    const { container } = renderUi(<EmptyState onClearFilters={onClear} />);
    expect(screen.getByText("Nothing here yet")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onClear).toHaveBeenCalled();
    await expectNoAxeViolations(container);
  });
});

describe("ErrorState", () => {
  it("shows the error code, a translated message and retry", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const { container } = renderUi(<ErrorState code="TIMEOUT" onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Error code: TIMEOUT")).toBeTruthy();
    expect(screen.getByText("The request took too long. Try again.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalled();
    await expectNoAxeViolations(container);
  });

  it("falls back to a generic message for unknown codes", () => {
    renderUi(<ErrorState code="WHATEVER" />);
    expect(screen.getByText("Something went wrong.")).toBeTruthy();
  });
});

describe("PermissionDenied", () => {
  it("explains the denial without data", async () => {
    const { container } = renderUi(<PermissionDenied />, { language: "rw" });
    expect(screen.getByText("Kwinjira birabujijwe")).toBeTruthy();
    await expectNoAxeViolations(container);
  });
});

describe("LoadingSkeleton", () => {
  it.each(["lines", "card", "kpi", "table"] as const)(
    "%s is a busy status with a label",
    async (variant) => {
      const { container } = renderUi(<LoadingSkeleton variant={variant} />);
      const status = screen.getByRole("status");
      expect(status.getAttribute("aria-busy")).toBe("true");
      expect(status.textContent).toContain("Loading…");
      await expectNoAxeViolations(container);
    },
  );
});
