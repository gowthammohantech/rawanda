/**
 * CTZ-05 notification adapters (expo-notifications mocked): the preview asks for permission and
 * schedules ONE generic notification 5 s later; denied permission schedules nothing;
 * `cancelAll` maps to `cancelAllScheduledNotificationsAsync` and runs on consent withdrawal.
 */
import * as Notifications from "expo-notifications";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { emitConsentWithdrawn } from "../../../state/events.ts";
import {
  ExpoLocalNotificationAdapter,
  PREVIEW_DELAY_SECONDS,
  SimulatedNotificationAdapter,
} from "../notificationAdapter.ts";
import { registerConsentWithdrawnCancel } from "../notifications.tsx";

vi.mock("expo-notifications", () => ({
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
  scheduleNotificationAsync: vi.fn(() => Promise.resolve("n-1")),
  cancelAllScheduledNotificationsAsync: vi.fn(() => Promise.resolve()),
  setNotificationHandler: vi.fn(),
  SchedulableTriggerInputTypes: { TIME_INTERVAL: "timeInterval" },
}));

const content = {
  title: "CareConnect reminder",
  body: "You have an appointment tomorrow. Open the app for details.",
};
const mocked = vi.mocked(Notifications);

describe("ExpoLocalNotificationAdapter", () => {
  beforeEach(() => vi.clearAllMocks());

  it("asks for permission, then schedules one generic local notification in 5 s", async () => {
    mocked.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true } as never);
    mocked.requestPermissionsAsync.mockResolvedValue({ granted: true } as never);
    const adapter = new ExpoLocalNotificationAdapter(Notifications);
    expect(adapter.canPreview).toBe(true);
    expect(await adapter.ensurePermission()).toBe("granted");
    await adapter.schedulePreview(content);
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledWith({
      content,
      trigger: { type: "timeInterval", seconds: PREVIEW_DELAY_SECONDS },
    });
    expect(mocked.setNotificationHandler).toHaveBeenCalledTimes(1);
  });

  it("denied (cannot ask again) → denied, nothing requested or scheduled", async () => {
    mocked.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false } as never);
    const adapter = new ExpoLocalNotificationAdapter(Notifications);
    expect(await adapter.ensurePermission()).toBe("denied");
    expect(mocked.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("cancelAll → cancelAllScheduledNotificationsAsync (opt-out path)", async () => {
    await new ExpoLocalNotificationAdapter(Notifications).cancelAll();
    expect(mocked.cancelAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
  });

  it("consent withdrawal cancels OS-scheduled notifications", async () => {
    const off = registerConsentWithdrawnCancel(new ExpoLocalNotificationAdapter(Notifications));
    emitConsentWithdrawn({ patientId: "pat-1", personaId: "persona-citizen-1" });
    await Promise.resolve();
    expect(mocked.cancelAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
    off();
    emitConsentWithdrawn({ patientId: "pat-1", personaId: "persona-citizen-1" });
    await Promise.resolve();
    expect(mocked.cancelAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
  });
});

describe("SimulatedNotificationAdapter (default)", () => {
  it("never previews on the OS and records cancelAll", async () => {
    const adapter = new SimulatedNotificationAdapter();
    expect(adapter.canPreview).toBe(false);
    await adapter.schedulePreview(content);
    expect(adapter.previews).toEqual([content]);
    await adapter.cancelAll();
    expect(adapter.cancelAllCalls).toBe(1);
    expect(adapter.previews).toEqual([]);
  });
});
