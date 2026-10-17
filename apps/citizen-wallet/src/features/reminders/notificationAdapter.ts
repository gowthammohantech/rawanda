/**
 * Notification adapters (CTZ-05 scheduling decision). Reminders are SIMULATED: the local
 * database is the source of truth and delivery is driven by the demo clock
 * (`SimulatedNotificationAdapter`, the default — nothing reaches the OS, nothing on a lock
 * screen). `ExpoLocalNotificationAdapter` exists only for the explicit "Send a test reminder to
 * this phone" preview on a device: permission request, then one local notification with the
 * safe generic text 5 s later. Opt-out and consent withdrawal call `cancelAll()` so no stray OS
 * notification survives (`cancelAllScheduledNotificationsAsync`).
 */
import type * as ExpoNotifications from "expo-notifications";

import type { SafeReminderContent } from "./safeContent.ts";

export type PreviewPermission = "granted" | "denied";

export interface NotificationAdapter {
  readonly kind: "simulated" | "expo-local";
  /** True only where an OS preview notification is possible (device builds). */
  readonly canPreview: boolean;
  /** Asks for OS permission when needed. */
  ensurePermission(): Promise<PreviewPermission>;
  /** Schedules ONE local preview notification `seconds` from now. */
  schedulePreview(content: SafeReminderContent, seconds?: number): Promise<void>;
  /** Cancels every OS-scheduled notification of this app. */
  cancelAll(): Promise<void>;
}

export const PREVIEW_DELAY_SECONDS = 5;

/** Default: in-app simulation only (records calls for tests; no OS access). */
export class SimulatedNotificationAdapter implements NotificationAdapter {
  readonly kind = "simulated" as const;
  readonly canPreview = false;
  readonly previews: SafeReminderContent[] = [];
  cancelAllCalls = 0;

  ensurePermission(): Promise<PreviewPermission> {
    return Promise.resolve("granted");
  }

  schedulePreview(content: SafeReminderContent): Promise<void> {
    this.previews.push(content);
    return Promise.resolve();
  }

  cancelAll(): Promise<void> {
    this.cancelAllCalls += 1;
    this.previews.length = 0;
    return Promise.resolve();
  }
}

type ExpoNotificationsModule = Pick<
  typeof ExpoNotifications,
  | "getPermissionsAsync"
  | "requestPermissionsAsync"
  | "scheduleNotificationAsync"
  | "cancelAllScheduledNotificationsAsync"
  | "setNotificationHandler"
  | "SchedulableTriggerInputTypes"
>;

/** Device preview via `expo-notifications` local scheduling (never used for real reminders). */
export class ExpoLocalNotificationAdapter implements NotificationAdapter {
  readonly kind = "expo-local" as const;
  readonly canPreview = true;
  private handlerSet = false;

  constructor(private readonly notifications: ExpoNotificationsModule) {}

  async ensurePermission(): Promise<PreviewPermission> {
    const current = await this.notifications.getPermissionsAsync();
    if (current.granted) return "granted";
    if (current.canAskAgain === false) return "denied";
    const asked = await this.notifications.requestPermissionsAsync();
    return asked.granted ? "granted" : "denied";
  }

  async schedulePreview(
    content: SafeReminderContent,
    seconds: number = PREVIEW_DELAY_SECONDS,
  ): Promise<void> {
    if (!this.handlerSet) {
      // Show the preview even while the app is open (no sound, no badge).
      this.notifications.setNotificationHandler({
        handleNotification: () =>
          Promise.resolve({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: false,
            shouldSetBadge: false,
          }),
      });
      this.handlerSet = true;
    }
    await this.notifications.scheduleNotificationAsync({
      content: { title: content.title, body: content.body },
      trigger: { type: this.notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds },
    });
  }

  async cancelAll(): Promise<void> {
    await this.notifications.cancelAllScheduledNotificationsAsync();
  }
}
