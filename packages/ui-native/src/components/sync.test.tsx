import { deriveSyncState, type SyncOpStatus } from "@laif/domain";
import { renderNative } from "@laif/test-utils/native";
import { screen } from "@testing-library/react";
import { AccessibilityInfo } from "react-native";
import { describe, expect, it, vi } from "vitest";

import {
  SYNC_PILL_STATES,
  SyncStatusPill,
  syncPillVisual,
  type SyncStatusInput,
} from "./SyncStatusPill.tsx";

const FIVE: Record<(typeof SYNC_PILL_STATES)[number], SyncStatusInput> = {
  saved_locally: "saved_locally",
  syncing: "syncing",
  synced: "synced",
  conflict: "conflict",
  failed: "failed",
};

const EN: Record<string, string> = {
  saved_locally: "Saved on this device",
  syncing: "Syncing…",
  synced: "Synced",
  conflict: "Conflict — needs your decision",
  failed: "Not sent — will retry",
};

describe("SyncStatusPill (AC 5)", () => {
  for (const language of ["en", "rw"] as const) {
    it.each(SYNC_PILL_STATES)(`renders icon + text for %s (${language})`, (state) => {
      const { unmount } = renderNative(<SyncStatusPill state={FIVE[state]} />, { language });
      const pill = screen.getByTestId("sync-status-pill");
      const visual = syncPillVisual(FIVE[state]);
      expect(screen.getByTestId(`sync-icon-${visual.icon}`)).toBeTruthy();
      expect(pill.textContent?.trim()).not.toBe("");
      if (language === "en") expect(pill.textContent).toBe(EN[state]);
      else expect(pill.textContent).not.toBe(EN[state]);
      expect(pill.getAttribute("aria-live")).toBe("polite");
      expect(pill.getAttribute("aria-label")).toContain(pill.textContent ?? "");
      unmount();
    });
  }

  it("uses distinct icons so state is never colour-only", () => {
    const icons = SYNC_PILL_STATES.map((state) => syncPillVisual(FIVE[state]).icon);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it("maps FND-02 deriveSyncState results (op statuses) to the five visuals", () => {
    const visualFor = (status: SyncOpStatus) =>
      syncPillVisual(deriveSyncState("e1", [{ entityId: "e1", status, localSeq: 1 }]));
    expect(visualFor("queued").state).toBe("saved_locally");
    expect(visualFor("retryable_failure").state).toBe("saved_locally");
    expect(visualFor("sending").state).toBe("syncing");
    expect(visualFor("acknowledged").state).toBe("synced");
    expect(visualFor("conflict").state).toBe("conflict");
    expect(visualFor("needs_resolution").state).toBe("conflict");
    expect(visualFor("rejected")).toMatchObject({
      state: "failed",
      labelKey: "common:sync.notAccepted",
    });
    expect(visualFor("blocked_revoked")).toMatchObject({
      state: "failed",
      labelKey: "common:sync.keptOnDeviceRevoked",
    });
    // superseded ops are ignored by deriveSyncState → no pending state is shown.
    expect(visualFor("superseded").state).toBe("synced");
  });

  it("shows the rejected and revoked texts", () => {
    const a = renderNative(<SyncStatusPill state="rejected" />);
    expect(screen.getByText("Not accepted")).toBeTruthy();
    a.unmount();
    renderNative(<SyncStatusPill state="blocked" note="Device revoked 09:00" />);
    expect(screen.getByText("Kept on device — device revoked · Device revoked 09:00")).toBeTruthy();
  });

  it("announces changes for VoiceOver when asked", () => {
    const spy = vi
      .spyOn(AccessibilityInfo, "announceForAccessibility")
      .mockImplementation(() => undefined);
    const { rerender } = renderNative(<SyncStatusPill state="syncing" announceChanges />);
    expect(spy).not.toHaveBeenCalled();
    rerender(<SyncStatusPill state="synced" announceChanges />);
    expect(spy).toHaveBeenCalledWith("Synced");
    spy.mockRestore();
  });
});
