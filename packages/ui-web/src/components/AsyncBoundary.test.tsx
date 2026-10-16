import { makeErrorShape } from "@laif/contracts";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations, renderUi } from "../test/helpers.tsx";
import {
  AsyncBoundary,
  resolveUxState,
  UX_STATES,
  type AsyncBoundaryProps,
  type UxState,
} from "./AsyncBoundary.tsx";

const err = (code: Parameters<typeof makeErrorShape>[0]) => makeErrorShape(code);

const CASES: Array<[UxState, Omit<AsyncBoundaryProps, "children">]> = [
  ["initial", { status: "initial" }],
  ["loading", { status: "pending" }],
  ["loaded", { status: "success" }],
  ["empty", { status: "success", isEmpty: true }],
  ["validationError", { status: "error", error: err("VALIDATION_ERROR") }],
  ["serverError", { status: "error", error: err("INTERNAL") }],
  ["permissionDenied", { status: "error", error: err("FORBIDDEN") }],
  ["offline", { status: "success", offline: true, hasCachedData: true, lastUpdatedLabel: "08:00" }],
  ["conflict", { status: "error", error: err("CONFLICT") }],
  ["success", { status: "success", successMessage: "Saved." }],
];

describe("resolveUxState", () => {
  it("covers all ten UX states", () => {
    expect(CASES.map(([state]) => state).sort()).toEqual([...UX_STATES].sort());
    for (const [state, props] of CASES) expect(resolveUxState(props)).toBe(state);
  });

  it("maps other codes and plain errors to server error, OFFLINE to offline", () => {
    expect(resolveUxState({ status: "error", error: err("TIMEOUT") })).toBe("serverError");
    expect(resolveUxState({ status: "error", error: new Error("boom") })).toBe("serverError");
    expect(resolveUxState({ status: "error", error: err("OFFLINE") })).toBe("offline");
  });
});

describe("AsyncBoundary", () => {
  it.each(CASES)("renders the %s state accessibly", async (state, props) => {
    const { container } = renderUi(
      <AsyncBoundary {...props}>
        <p>DATA</p>
      </AsyncBoundary>,
    );
    expect(
      container.querySelector(`[data-ux-state="${state}"]`) !== null || state === "loaded",
    ).toBe(true);
    const showsData = screen.queryByText("DATA") !== null;
    const expectData = ["loaded", "validationError", "offline", "success"].includes(state);
    expect(showsData).toBe(expectData);
    await expectNoAxeViolations(container);
  });

  it("server error shows the code and retries", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderUi(
      <AsyncBoundary status="error" error={err("DEPENDENCY_UNAVAILABLE")} onRetry={onRetry}>
        <p>DATA</p>
      </AsyncBoundary>,
    );
    expect(screen.getByText("Error code: DEPENDENCY_UNAVAILABLE")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("loading is aria-busy; offline without cache shows the offline error", () => {
    const { unmount } = renderUi(
      <AsyncBoundary status="pending">
        <p>DATA</p>
      </AsyncBoundary>,
    );
    expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("true");
    unmount();
    renderUi(
      <AsyncBoundary status="error" error={err("OFFLINE")}>
        <p>DATA</p>
      </AsyncBoundary>,
    );
    expect(screen.getByText("Error code: OFFLINE")).toBeTruthy();
    expect(screen.queryByText("DATA")).toBeNull();
  });

  it("renders the conflict slot", () => {
    renderUi(
      <AsyncBoundary status="error" error={err("CONFLICT")} conflict={<p>CONFLICT UI</p>}>
        <p>DATA</p>
      </AsyncBoundary>,
    );
    expect(screen.getByText("CONFLICT UI")).toBeTruthy();
  });
});
