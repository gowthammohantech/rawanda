/**
 * Notification adapter context (CTZ-05). Mounted by `Boot` above the router, so the
 * `onConsentWithdrawn` subscription outlives the wallet tabs: a withdrawal cancels every
 * OS-scheduled preview notification (`adapter.cancelAll()`) — the repository already cancelled
 * the stored reminders (`consent_withdrawn`) in the withdrawal transaction.
 */
import { createContext, useContext, useEffect, type ReactNode } from "react";

import { platform } from "../../platform";
import { onConsentWithdrawn } from "../../state/events.ts";
import type { NotificationAdapter } from "./notificationAdapter.ts";

const NotificationContext = createContext<NotificationAdapter | null>(null);

/** Cancels OS-scheduled notifications on every consent withdrawal; returns the unsubscribe. */
export function registerConsentWithdrawnCancel(adapter: NotificationAdapter): () => void {
  return onConsentWithdrawn(() => {
    void adapter.cancelAll().catch(() => undefined);
  });
}

export function ReminderNotificationsProvider({
  adapter,
  children,
}: {
  /** Test seam; defaults to the platform adapter. */
  adapter?: NotificationAdapter;
  children?: ReactNode;
}) {
  const value = adapter ?? platform.notifications();
  useEffect(() => registerConsentWithdrawnCancel(value), [value]);
  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotificationAdapter(): NotificationAdapter {
  return useContext(NotificationContext) ?? platform.notifications();
}
