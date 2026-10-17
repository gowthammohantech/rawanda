/** HWM-05 autosave: 600 ms debounce, identical payloads skipped, flush on background / unmount. */
import { act, renderHook } from "@testing-library/react";
import { AppState, type AppStateStatus } from "react-native";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DRAFT_AUTOSAVE_DEBOUNCE_MS, useDraftAutosave } from "../useDraftAutosave.ts";

type Listener = (state: AppStateStatus) => void;
let listeners: Listener[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  listeners = [];
  vi.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
    listeners.push(listener);
    return {
      remove: () => {
        listeners = listeners.filter((l) => l !== listener);
      },
    };
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const setup = (initial = "a") => {
  const save = vi.fn((value: string) => Promise.resolve(`saved:${value}`));
  const hook = renderHook(
    ({ value }) => useDraftAutosave({ values: value, save, signature: (v) => v }),
    { initialProps: { value: initial } },
  );
  return { save, hook };
};

describe("useDraftAutosave", () => {
  it("is 600 ms", () => expect(DRAFT_AUTOSAVE_DEBOUNCE_MS).toBe(600));

  it("debounces: one save 600 ms after the last change, none for the loaded values", async () => {
    const { save, hook } = setup();
    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });
    expect(save).not.toHaveBeenCalled();

    hook.rerender({ value: "ab" });
    await act(async () => {
      vi.advanceTimersByTime(400);
      await Promise.resolve();
    });
    hook.rerender({ value: "abc" });
    await act(async () => {
      vi.advanceTimersByTime(599);
      await Promise.resolve();
    });
    expect(save).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenLastCalledWith("abc");
    expect(hook.result.current.status).toBe("saved");
    expect(hook.result.current.savedAt).toBe("saved:abc");

    // Back to an already-saved payload → nothing to write.
    await act(async () => {
      await hook.result.current.flush();
    });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("flushes immediately when the app goes to the background", async () => {
    const { save, hook } = setup();
    hook.rerender({ value: "typed" });
    expect(listeners.length).toBe(1);
    await act(async () => {
      for (const l of listeners) l("background");
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenLastCalledWith("typed");
    // The pending debounce was cancelled: no second write.
    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("flush() (blur / back) saves now; unmount flushes pending changes", async () => {
    const { save, hook } = setup();
    hook.rerender({ value: "blurred" });
    await act(async () => {
      await hook.result.current.flush();
    });
    expect(save).toHaveBeenLastCalledWith("blurred");
    hook.rerender({ value: "leaving" });
    hook.unmount();
    await act(async () => {
      await Promise.resolve();
    });
    expect(save).toHaveBeenLastCalledWith("leaving");
    expect(listeners.length).toBe(0);
  });

  it("a failed save reports 'error' and is retried on the next change", async () => {
    const save = vi
      .fn<(v: string) => Promise<string>>()
      .mockRejectedValueOnce(new Error("disk"))
      .mockResolvedValue("ok");
    const hook = renderHook(
      ({ value }) => useDraftAutosave({ values: value, save, signature: (v) => v }),
      { initialProps: { value: "a" } },
    );
    hook.rerender({ value: "b" });
    await act(async () => {
      await hook.result.current.flush();
    });
    expect(hook.result.current.status).toBe("error");
    await act(async () => {
      await hook.result.current.flush();
    });
    expect(hook.result.current.status).toBe("saved");
    expect(save).toHaveBeenCalledTimes(2);
  });
});
