import { renderNative } from "@laif/test-utils/native";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { AccessibilityInfo } from "react-native";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppText } from "./AppText.tsx";
import { AsyncView, resolveUxState, UX_STATES, type AsyncViewProps } from "./AsyncView.tsx";
import { BrandSplash } from "./BrandSplash.tsx";
import { BottomTabBar, bottomTabBarScreenOptions, tabBarIcon } from "./BottomTabBar.tsx";
import { Card } from "./Card.tsx";
import { EmptyState } from "./EmptyState.tsx";
import { ErrorState } from "./ErrorState.tsx";
import { LoadingState } from "./LoadingState.tsx";
import { PermissionDenied } from "./PermissionDenied.tsx";
import { Section } from "./Section.tsx";
import { ToastProvider, useToast } from "./Toast.tsx";
import { colors } from "../tokens.ts";

afterEach(() => vi.restoreAllMocks());

const err = (code: string) => ({ code });

describe("AsyncView — ten-state contract (same as ui-web AsyncBoundary)", () => {
  const cases: [Omit<AsyncViewProps, "children">, (typeof UX_STATES)[number]][] = [
    [{ status: "initial" }, "initial"],
    [{ status: "pending" }, "loading"],
    [{ status: "success" }, "loaded"],
    [{ status: "success", isEmpty: true }, "empty"],
    [{ status: "error", error: err("VALIDATION_ERROR") }, "validationError"],
    [{ status: "error", error: err("TIMEOUT") }, "serverError"],
    [{ status: "error", error: err("FORBIDDEN") }, "permissionDenied"],
    [{ status: "success", offline: true }, "offline"],
    [{ status: "error", error: err("CONFLICT") }, "conflict"],
    [{ status: "success", successMessage: "Saved on this device" }, "success"],
  ];

  it("covers every UX state exactly once", () => {
    expect(cases.map(([, state]) => state).sort()).toEqual([...UX_STATES].sort());
  });

  it.each(cases)("%o → %s", (props, state) => {
    expect(resolveUxState(props)).toBe(state);
    renderNative(
      <AsyncView {...props}>
        <AppText>Content</AppText>
      </AsyncView>,
    );
    if (state === "loaded") expect(screen.getByText("Content")).toBeTruthy();
    else expect(screen.getByTestId(`ux-${state}`)).toBeTruthy();
  });

  it("offline with cached data shows the banner, the cached marker and the content", () => {
    renderNative(
      <AsyncView status="success" offline hasCachedData lastUpdatedLabel="07:45">
        <AppText>Cached rows</AppText>
      </AsyncView>,
    );
    expect(screen.getByText("You are offline. Changes are saved on this device.")).toBeTruthy();
    expect(screen.getByText("Showing data saved on this device · Last updated 07:45")).toBeTruthy();
    expect(screen.getByText("Cached rows")).toBeTruthy();
  });

  it("offline without data shows the offline error; unknown errors map to INTERNAL", () => {
    renderNative(
      <AsyncView status="pending" offline>
        {() => null}
      </AsyncView>,
    );
    expect(screen.getByText("Error code: OFFLINE")).toBeTruthy();
    expect(resolveUxState({ status: "error", error: new Error("x") })).toBe("serverError");
  });

  it("server error offers retry; conflict renders the conflict slot", () => {
    const onRetry = vi.fn();
    const { unmount } = renderNative(
      <AsyncView status="error" error={err("TIMEOUT")} onRetry={onRetry}>
        {null}
      </AsyncView>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
    unmount();
    renderNative(
      <AsyncView status="error" error={err("CONFLICT")} conflict={<AppText>Compare</AppText>}>
        {null}
      </AsyncView>,
    );
    expect(screen.getByText("Compare")).toBeTruthy();
  });

  it("success is announced", () => {
    const spy = vi
      .spyOn(AccessibilityInfo, "announceForAccessibility")
      .mockImplementation(() => undefined);
    renderNative(
      <AsyncView status="success" successMessage="Saved on this device">
        {null}
      </AsyncView>,
    );
    expect(spy).toHaveBeenCalledWith("Saved on this device");
  });
});

describe("state panels", () => {
  it("EmptyState / ErrorState / PermissionDenied default copy", () => {
    const onClear = vi.fn();
    renderNative(
      <>
        <EmptyState onClearFilters={onClear} />
        <ErrorState code="NOT_FOUND" />
        <PermissionDenied />
        <LoadingState />
        <LoadingState variant="skeleton" label="Loading tasks" />
      </>,
    );
    expect(screen.getByText("Nothing here yet")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onClear).toHaveBeenCalledOnce();
    expect(screen.getByText("This record could not be found.")).toBeTruthy();
    expect(screen.getByText("Access restricted")).toBeTruthy();
    expect(screen.getByLabelText("Loading…").getAttribute("aria-busy")).toBe("true");
    expect(screen.getByLabelText("Loading tasks")).toBeTruthy();
  });
});

function ToastTrigger() {
  const { toast } = useToast();
  return (
    <AppText onPress={() => toast({ title: "Saved on this device", duration: 1000 })}>Fire</AppText>
  );
}

describe("ToastProvider", () => {
  it("shows, announces and auto-dismisses a toast", () => {
    vi.useFakeTimers();
    const spy = vi
      .spyOn(AccessibilityInfo, "announceForAccessibility")
      .mockImplementation(() => undefined);
    renderNative(
      <ToastProvider>
        <ToastTrigger />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText("Fire"));
    expect(screen.getByRole("alert").textContent).toContain("Saved on this device");
    expect(screen.getByTestId("toast-region").getAttribute("aria-live")).toBe("polite");
    expect(spy).toHaveBeenCalledWith("Saved on this device");
    act(() => {
      vi.advanceTimersByTime(1100);
    });
    expect(screen.queryByRole("alert")).toBeNull();
    vi.useRealTimers();
  });

  it("useToast outside the provider throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => renderNative(<ToastTrigger />)).toThrow(/ToastProvider/);
  });
});

describe("BrandSplash", () => {
  it("renders inside I18nProvider with the translated message", () => {
    renderNative(<BrandSplash />);
    expect(screen.getByLabelText("Connecting care, from community to clinic")).toBeTruthy();
    expect(screen.getByText("CareConnect")).toBeTruthy();
  });

  it("renders before i18n is ready (no provider) without crashing", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    render(<BrandSplash />);
    expect(screen.getByTestId("brand-splash")).toBeTruthy();
    expect(screen.queryByText("CareConnect")).toBeNull();
  });

  it("checks Reduce motion and renders statically when on", async () => {
    const spy = vi.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
    renderNative(<BrandSplash message="Opening" />);
    await act(async () => Promise.resolve());
    expect(spy).toHaveBeenCalled();
    expect(screen.getByTestId("brand-splash-bar")).toBeTruthy();
  });
});

describe("layout helpers", () => {
  it("Card and Section render headings", () => {
    renderNative(
      <Section title="Today">
        <Card title="Follow-ups" eyebrow="Needs you" meta="3 open">
          <AppText>Body</AppText>
        </Card>
      </Section>,
    );
    expect(screen.getByRole("heading", { name: "Today" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Follow-ups" })).toBeTruthy();
    expect(screen.getByText("3 open")).toBeTruthy();
  });

  it("bottom tab options keep ≥ 44 pt items, dynamic type and token colours", () => {
    const options = bottomTabBarScreenOptions({ bottomInset: 34 });
    expect(options.tabBarItemStyle.minHeight).toBeGreaterThanOrEqual(44);
    expect(options.tabBarAllowFontScaling).toBe(true);
    expect(options.tabBarStyle.paddingBottom).toBe(34);
    expect(BottomTabBar.screenOptions).toBe(bottomTabBarScreenOptions);
    const Home = tabBarIcon("home");
    render(<Home color={colors.ink} size={24} focused />);
    expect(screen.getByTestId("icon-home")).toBeTruthy();
  });
});
