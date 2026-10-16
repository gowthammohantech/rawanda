import { renderNative } from "@laif/test-utils/native";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./Button.tsx";
import { ConfirmSheet } from "./ConfirmSheet.tsx";
import { DemoToolsSheet, type DemoFaultToggles } from "./DemoToolsSheet.tsx";
import { IconButton } from "./IconButton.tsx";
import { PersonaSwitcher, initialsOf } from "./PersonaSwitcher.tsx";

describe("Button", () => {
  it("ignores a second tap while an async press is pending (no double submit)", async () => {
    let resolve: () => void = () => undefined;
    const onPress = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    renderNative(<Button onPress={onPress}>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(button.getAttribute("aria-busy")).toBe("true");
    await act(async () => {
      resolve();
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save" }).getAttribute("aria-busy")).toBe("false"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onPress).toHaveBeenCalledTimes(2);
  });

  it("loading and disabled block presses", () => {
    const onPress = vi.fn();
    renderNative(
      <>
        <Button loading onPress={onPress}>
          A
        </Button>
        <Button disabled variant="danger" onPress={onPress}>
          B
        </Button>
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "A" }));
    fireEvent.click(screen.getByRole("button", { name: "B" }));
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "B" }).getAttribute("aria-disabled")).toBe("true");
  });
});

describe("IconButton", () => {
  it("requires and uses a translated label, with badge text", () => {
    renderNative(
      <>
        <IconButton icon="sync" labelKey="common:actions.retry" badge badgeLabel="3 pending" />
        <IconButton icon="close" label="Close panel" />
      </>,
    );
    expect(screen.getByRole("button", { name: "Try again. 3 pending" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close panel" })).toBeTruthy();
  });
});

function ReasonHarness({ onConfirm }: { onConfirm: (reason?: string) => void }) {
  const [open, setOpen] = useState(true);
  return (
    <ConfirmSheet
      visible={open}
      onClose={() => setOpen(false)}
      variant="destructive"
      requireReason
      title="Discard draft?"
      description="The draft is removed from this device."
      onConfirm={onConfirm}
    />
  );
}

describe("ConfirmSheet", () => {
  it("destructive + reason variant: confirm disabled until 10 non-whitespace characters", () => {
    const onConfirm = vi.fn();
    renderNative(<ReasonHarness onConfirm={onConfirm} />);
    expect(screen.getByText("This cannot be undone.")).toBeTruthy();
    const confirm = screen.getByRole("button", { name: "Confirm" });
    expect(confirm.getAttribute("aria-disabled")).toBe("true");
    fireEvent.change(screen.getByTestId("confirm-reason"), { target: { value: "  short  " } });
    fireEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.change(screen.getByTestId("confirm-reason"), {
      target: { value: "  Duplicate entry  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onConfirm).toHaveBeenCalledWith("Duplicate entry");
  });

  it("cancel closes; loading blocks dismissal", () => {
    const onClose = vi.fn();
    const { rerender } = renderNative(
      <ConfirmSheet visible title="Sign out?" onClose={onClose} onConfirm={() => undefined} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    rerender(
      <ConfirmSheet
        visible
        loading
        title="Sign out?"
        onClose={onClose}
        onConfirm={() => undefined}
      />,
    );
    expect(screen.getByRole("button", { name: "Saving…" }).getAttribute("aria-busy")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

function ToolsHarness({
  onReset,
  onFault,
  onScenario,
}: {
  onReset: () => Promise<void>;
  onFault: (k: string, v: boolean) => void;
  onScenario: (id: string) => void;
}) {
  const [faults, setFaults] = useState<DemoFaultToggles>({
    offline: false,
    slow: false,
    errors: false,
  });
  return (
    <DemoToolsSheet
      visible
      onClose={() => undefined}
      onReset={onReset}
      faults={faults}
      onFaultChange={(key, enabled) => {
        onFault(key, enabled);
        setFaults((f) => ({ ...f, [key]: enabled }));
      }}
      scenarios={[{ id: "SCN-08", title: "Offline sync" }]}
      onLoadScenario={onScenario}
    />
  );
}

describe("DemoToolsSheet", () => {
  it("toggles faults, loads a scenario and confirms reset", async () => {
    const onReset = vi.fn(() => Promise.resolve());
    const onFault = vi.fn();
    const onScenario = vi.fn();
    renderNative(<ToolsHarness onReset={onReset} onFault={onFault} onScenario={onScenario} />);
    fireEvent.click(screen.getByRole("switch", { name: "Offline" }));
    expect(onFault).toHaveBeenCalledWith("offline", true);
    expect(screen.getByRole("switch", { name: "Offline" }).getAttribute("aria-checked")).toBe(
      "true",
    );
    fireEvent.click(screen.getByRole("switch", { name: "Slow network" }));
    fireEvent.click(screen.getByRole("switch", { name: "Server errors" }));
    expect(onFault).toHaveBeenCalledTimes(3);
    fireEvent.click(screen.getByRole("button", { name: "SCN-08 Offline sync" }));
    expect(onScenario).toHaveBeenCalledWith("SCN-08");

    fireEvent.click(screen.getByRole("button", { name: "Reset demo" }));
    expect(onReset).not.toHaveBeenCalled();
    expect(await screen.findByText("Reset demo data?")).toBeTruthy();
    const buttons = screen.getAllByRole("button", { name: "Reset demo" });
    fireEvent.click(buttons[buttons.length - 1]!);
    await waitFor(() => expect(onReset).toHaveBeenCalledOnce());
  });
});

describe("PersonaSwitcher", () => {
  it("shows the demo disclaimer and switches persona", () => {
    const onChange = vi.fn();
    renderNative(
      <PersonaSwitcher
        value="p1"
        onChange={onChange}
        personas={[
          { id: "p1", name: "Aline Uwase", roleLabel: "Community health worker" },
          { id: "p2", name: "Jean Bosco", roleLabel: "Field supervisor", scopeLabel: "Alpha-1" },
        ]}
      />,
    );
    expect(initialsOf("Aline Uwase")).toBe("AU");
    fireEvent.click(
      screen.getByRole("button", { name: "Demo persona: Aline Uwase. Switch demo persona" }),
    );
    expect(screen.getByText("Demo role switch — not authentication")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Jean Bosco, Field supervisor · Alpha-1" }));
    expect(onChange).toHaveBeenCalledWith("p2");
  });
});
