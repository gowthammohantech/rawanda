/**
 * Reminder hooks (CTZ-05).
 *
 * - `useReminderProcessor` runs the simulated delivery (`repo.processDueReminders`) on mount,
 *   when the app comes to the foreground and when the demo clock moves; new deliveries refresh
 *   the reminder queries (inbox banner + history).
 * - `useReminderPrefsSave` writes opt-in / opt-out / timing. One idempotency key per user
 *   action, kept across Retry (T-09); a server error or a conflict reverts the toggle to the
 *   saved value (the shown value is `pending ?? saved`); a conflict drops the key and shows the
 *   saved state (T-05). Opting out also cancels OS-scheduled notifications.
 * - `useAcknowledgeReminderAction` is "Got it" (idempotent per reminder). It never changes the
 *   related next step.
 */
import type { NotificationPreference } from "@laif/contracts";
import type { Reminder, ReminderTiming } from "@laif/domain";
import { RepositoryError } from "@laif/repositories";
import { announce, useToast, useTx, type TranslationKey } from "@laif/ui-native";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { newIdempotencyKey } from "../../data/keys.ts";
import {
  useAcknowledgeReminder,
  useNotificationPrefs,
  useReminders,
  useUpdateNotificationPrefs,
} from "../../data/queries.ts";
import { useCitizenRepo } from "../../data/repo.tsx";
import { onDemoClockChanged } from "../../state/events.ts";
import { useNotificationAdapter } from "./notifications.tsx";

export { useNotificationPrefs, useReminders };

export type ReminderGroups = { scheduled: Reminder[]; history: Reminder[] };

/** Scheduled (soonest first) and history (delivered / seen / cancelled, newest first). */
export function groupReminders(reminders: readonly Reminder[]): ReminderGroups {
  const scheduled = reminders
    .filter((r) => r.status === "scheduled")
    .sort((a, b) => (a.scheduledAt < b.scheduledAt ? -1 : a.scheduledAt > b.scheduledAt ? 1 : 0));
  const at = (r: Reminder) => r.acknowledgedAt ?? r.deliveredAt ?? r.updatedAt;
  const history = reminders
    .filter((r) => r.status !== "scheduled")
    .sort((a, b) => (at(a) < at(b) ? 1 : at(a) > at(b) ? -1 : 0));
  return { scheduled, history };
}

/** Delivered reminders the person has not marked as seen (inbox banner). */
export function unacknowledged(reminders: readonly Reminder[] | undefined): Reminder[] {
  return (reminders ?? []).filter((r) => r.status === "delivered_simulated");
}

/** One delivery run per repository at a time (the banner and the tab may both ask). */
const inflight = new WeakMap<object, Promise<void>>();

/** Runs the simulated delivery once (coalesced); refreshes reminder queries on change. */
export function useProcessDueReminders(patientId: string | null): () => Promise<void> {
  const repo = useCitizenRepo();
  const queryClient = useQueryClient();
  return useCallback(() => {
    if (patientId === null) return Promise.resolve();
    const running = inflight.get(repo);
    if (running) return running;
    const run = (async () => {
      try {
        const result = await repo.processDueReminders(patientId);
        if (result.delivered.length + result.cancelled.length > 0) {
          await queryClient.invalidateQueries({
            predicate: (q) =>
              q.queryKey[0] === "ctz" &&
              q.queryKey.includes(patientId) &&
              (q.queryKey.includes("reminders") || q.queryKey.includes("timeline")),
          });
        }
      } catch {
        // Consent / transport errors: the screens show their own states.
      } finally {
        inflight.delete(repo);
      }
    })();
    inflight.set(repo, run);
    return run;
  }, [repo, queryClient, patientId]);
}

/** Delivery on mount, on app foreground and on every demo-clock change. */
export function useReminderProcessor(patientId: string | null): () => Promise<void> {
  const run = useProcessDueReminders(patientId);
  useEffect(() => {
    void run();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void run();
    });
    const off = onDemoClockChanged(() => void run());
    return () => {
      subscription.remove();
      off();
    };
  }, [run]);
  return run;
}

export type PrefsChoice = { optedIn: boolean; timing: ReminderTiming };
export type PrefsSaveStatus = "idle" | "pending" | "error" | "conflict";

type Attempt = { choice: PrefsChoice; expectedVersion: number; key: string };

const TOAST_KEY = (before: PrefsChoice, after: PrefsChoice): TranslationKey =>
  before.optedIn !== after.optedIn
    ? after.optedIn
      ? "citizen:reminders.toast.on"
      : "citizen:reminders.toast.off"
    : "citizen:reminders.toast.timing";

export type PrefsSaveState = {
  status: PrefsSaveStatus;
  /** What the controls show: the choice being saved, else the saved value. */
  shown: PrefsChoice | null;
  errorCode: string | null;
  save: (choice: PrefsChoice) => Promise<void>;
  retry: () => Promise<void>;
  dismissConflict: () => void;
};

export function useReminderPrefsSave(saved: NotificationPreference | null): PrefsSaveState {
  const t = useTx();
  const { toast } = useToast();
  const adapter = useNotificationAdapter();
  const mutation = useUpdateNotificationPrefs();
  const inFlight = useRef(false);
  const [status, setStatus] = useState<PrefsSaveStatus>("idle");
  const [pending, setPending] = useState<PrefsChoice | null>(null);
  const [failed, setFailed] = useState<Attempt | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const attempt = useCallback(
    async (next: Attempt) => {
      if (saved === null || inFlight.current) return;
      inFlight.current = true;
      const before = { optedIn: saved.optedIn, timing: saved.timing };
      setPending(next.choice);
      setStatus("pending");
      setErrorCode(null);
      try {
        await mutation.mutateAsync({
          input: {
            patientId: saved.patientId,
            expectedVersion: next.expectedVersion,
            optedIn: next.choice.optedIn,
            timing: next.choice.timing,
          },
          key: next.key,
        });
        setFailed(null);
        setStatus("idle");
        if (!next.choice.optedIn) await adapter.cancelAll().catch(() => undefined);
        const message = t(TOAST_KEY(before, next.choice));
        toast({ title: message, tone: "positive" });
        announce(message);
      } catch (error) {
        if (error instanceof RepositoryError && error.code === "CONFLICT") {
          // Nothing was written; the screen shows the saved state (refetched by the mutation).
          setFailed(null);
          setStatus("conflict");
        } else {
          // Keep the key: Retry replays the same action (T-09).
          setFailed(next);
          setErrorCode(error instanceof RepositoryError ? error.code : null);
          setStatus("error");
        }
      } finally {
        setPending(null);
        inFlight.current = false;
      }
    },
    [saved, mutation, adapter, t, toast],
  );

  const save = useCallback(
    (choice: PrefsChoice) =>
      saved === null
        ? Promise.resolve()
        : attempt({ choice, expectedVersion: saved.version, key: newIdempotencyKey() }),
    [attempt, saved],
  );
  const retry = useCallback(
    () => (failed === null ? Promise.resolve() : attempt(failed)),
    [attempt, failed],
  );
  const dismissConflict = useCallback(() => setStatus("idle"), []);

  return {
    status,
    shown: pending ?? (saved === null ? null : { optedIn: saved.optedIn, timing: saved.timing }),
    errorCode,
    save,
    retry,
    dismissConflict,
  };
}

export type AcknowledgeReminderState = {
  status: "idle" | "pending" | "error";
  acknowledge: () => Promise<void>;
};

export function useAcknowledgeReminderAction(
  reminder: Pick<Reminder, "id" | "patientId">,
): AcknowledgeReminderState {
  const t = useTx();
  const mutation = useAcknowledgeReminder();
  const key = useRef<string | null>(null);
  const inFlight = useRef(false);
  const [status, setStatus] = useState<"idle" | "pending" | "error">("idle");

  const acknowledge = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    key.current ??= newIdempotencyKey();
    setStatus("pending");
    try {
      await mutation.mutateAsync({
        input: { patientId: reminder.patientId, reminderId: reminder.id },
        key: key.current,
      });
      key.current = null;
      setStatus("idle");
      announce(t("citizen:reminders.chip.seen"));
    } catch {
      setStatus("error");
    } finally {
      inFlight.current = false;
    }
  }, [mutation, reminder.id, reminder.patientId, t]);

  return { status, acknowledge };
}
