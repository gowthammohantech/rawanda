/**
 * CTZ-05 Reminders tab + preferences on the real shell (memory store, seeded CTZ-P1 / CTZ-P2):
 * seed state; toggle off → "Stop reminders?" → every scheduled row cancelled (DB + audits),
 * "Reminders are off", OS notifications cancelled, clock +7 days delivers nothing; conflict and
 * server-error paths revert the toggle (Retry replays the same key); opt in with morning_of →
 * exactly one reminder; clock past the reminder → inbox banner → "Got it" → SEEN, the next step
 * stays planned; timing change re-plans; the device preview handles permission denied.
 */
import { PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { platform } from "../../../platform";
import { emitConsentWithdrawn, emitDemoClockChanged } from "../../../state/events.ts";
import { auditsOf, renderShell, type ShellView } from "../../../test/harness.tsx";
import { resetRouter, routerLog } from "../../../test/router-stub.tsx";
import type { NotificationAdapter, SimulatedNotificationAdapter } from "../notificationAdapter.ts";
import { ReminderNotificationsProvider } from "../notifications.tsx";
import { ReminderInboxBanner } from "../ReminderInboxBanner.tsx";
import { ReminderPreferencesScreen } from "../ReminderPreferencesScreen.tsx";
import { RemindersScreen } from "../RemindersScreen.tsx";

vi.mock("expo-router", () => import("../../../test/router-stub.tsx"));

const DAY = 86_400_000;
const P1 = SEED_ANCHORS.CTZ_P1_APPOINTMENT_INSTRUCTION.patientId;
const APPOINTMENT = SEED_ANCHORS.CTZ_P1_APPOINTMENT_INSTRUCTION.careInstructionId;
const P2 = SEED_ANCHORS.CTZ_P2_DISMISSED_SCREENING.patientId;
const T = { timeout: 10_000 };

const as = (personaId: string) => ({
  before: (s: { session: { switchTo: (id: string) => unknown } }) =>
    void s.session.switchTo(personaId),
});

type Row = { id: string; patientId: string; status: string; cancelReason: string | null };
const rowsOf = async (view: ShellView, patientId = P1) =>
  (await view.store.getAll<Row>("reminders")).filter((r) => r.patientId === patientId);
const scheduledRows = async (view: ShellView, patientId = P1) =>
  (await rowsOf(view, patientId)).filter((r) => r.status === "scheduled");
/** Audits written during the test (seed history is older than the pinned demo clock). */
const freshAudits = async (view: ShellView, action: string) =>
  ((await auditsOf(view.store, action)) as unknown as { occurredAt: string }[]).filter(
    (e) => e.occurredAt >= "2026-10-14T06:00:00.000Z",
  );

const toggle = () => screen.getByTestId("reminder-toggle");
const checked = () => toggle().getAttribute("aria-checked");

async function openReminders(personaId: string = PERSONA_IDS.citizen1) {
  return renderShell(<RemindersScreen />, {
    ...as(personaId),
    readyTestId: "reminder-toggle-card",
  });
}

function confirmStop() {
  const buttons = screen.getAllByRole("button", { name: "Stop reminders" });
  fireEvent.click(buttons[buttons.length - 1]!);
}

describe("Reminders tab", () => {
  beforeEach(() => resetRouter(["(app)", "(tabs)", "reminders"]));

  it("CTZ-P1 seed: reminders on, 1 scheduled, 2 history rows (1 seen), safe reminder text", async () => {
    await openReminders();
    expect(checked()).toBe("true");
    expect(screen.getByText("We'll remind you the day before.")).toBeTruthy();
    const scheduled = within(screen.getByTestId("section-scheduled"));
    expect(scheduled.getAllByText("SCHEDULED")).toHaveLength(1);
    expect(scheduled.getByText(/^Will be sent 18 Oct 2026, \d\d:\d\d$/u)).toBeTruthy();
    const history = within(screen.getByTestId("section-history"));
    expect(history.getAllByText("Appointment reminder")).toHaveLength(2);
    expect(history.getAllByText("SEEN")).toHaveLength(1);
    expect(history.getAllByText("DELIVERED (DEMO)")).toHaveLength(1);
    expect(history.getAllByRole("button", { name: "Got it" })).toHaveLength(1);
    const note = within(screen.getByTestId("safe-content-preview"));
    expect(note.getByText("CareConnect reminder")).toBeTruthy();
    expect(
      note.getByText("You have an appointment tomorrow. Open the app for details."),
    ).toBeTruthy();
  });

  it("toggle off → confirm → all scheduled cancelled + audits, 'Reminders are off', OS cancelled; +7 days delivers nothing", async () => {
    const adapter = platform.notifications() as SimulatedNotificationAdapter;
    const cancelsBefore = adapter.cancelAllCalls;
    const view = await openReminders();
    const before = await scheduledRows(view);
    expect(before).toHaveLength(1);

    fireEvent.click(toggle());
    expect(await screen.findByText("Stop reminders?", {}, T)).toBeTruthy();
    expect(
      screen.getByText(
        "You will not get reminders for your appointments. Your appointments stay the same.",
      ),
    ).toBeTruthy();
    confirmStop();

    await waitFor(() => expect(checked()).toBe("false"), T);
    const scheduled = within(screen.getByTestId("section-scheduled"));
    expect(await scheduled.findByText("Reminders are off", {}, T)).toBeTruthy();
    expect(screen.queryByText("SCHEDULED")).toBeNull();
    expect(screen.getAllByText("Reminders turned off").length).toBeGreaterThan(0);
    expect(await scheduledRows(view)).toHaveLength(0);
    const cancelled = (await rowsOf(view)).filter((r) => r.id === before[0]!.id);
    expect(cancelled[0]).toMatchObject({ status: "cancelled", cancelReason: "opted_out" });
    const changed = (await freshAudits(view, "reminder.preference_changed")) as unknown as {
      changeSummary: { change: string };
    }[];
    expect(changed.map((e) => e.changeSummary.change)).toEqual(["opted_out"]);
    expect(await freshAudits(view, "reminder.cancelled")).toHaveLength(before.length);
    expect(adapter.cancelAllCalls).toBe(cancelsBefore + 1);

    const total = (await rowsOf(view)).length;
    await act(async () => {
      await view.repo().demo.advanceClock(7 * DAY);
      emitDemoClockChanged();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(await freshAudits(view, "reminder.delivered_simulated")).toHaveLength(0);
    expect(await rowsOf(view)).toHaveLength(total);
    expect(await scheduledRows(view)).toHaveLength(0);
  });

  it("conflict-next-write → conflict notice with the saved state; toggle reverts; nothing changed", async () => {
    const view = await openReminders();
    const before = await rowsOf(view);
    await view.repo().demo.setFaults({ conflictOnce: [{ entityType: "patient", entityId: P1 }] });
    fireEvent.click(toggle());
    confirmStop();
    const notice = await screen.findByTestId("prefs-conflict", {}, T);
    expect(notice.textContent).toContain("Your reminder settings changed");
    expect(notice.textContent).toContain("We'll remind you the day before.");
    expect(checked()).toBe("true");
    expect(await rowsOf(view)).toEqual(before);
    expect(await freshAudits(view, "reminder.preference_changed")).toHaveLength(0);
    fireEvent.click(screen.getByTestId("prefs-conflict-ok"));
    await waitFor(() => expect(screen.queryByTestId("prefs-conflict")).toBeNull());
  });

  it("server error → toggle reverts + inline error; Retry replays the same key", async () => {
    const view = await openReminders();
    const spy = vi.spyOn(view.repo(), "updateNotificationPrefs");
    await view.repo().demo.setFaults({ serverErrorRate: 1 });
    fireEvent.click(toggle());
    confirmStop();
    expect(
      await screen.findByText(
        "We could not save your reminder setting. Nothing was changed.",
        {},
        T,
      ),
    ).toBeTruthy();
    expect(checked()).toBe("true");
    expect(await scheduledRows(view)).toHaveLength(1);

    await view.repo().demo.setFaults({ serverErrorRate: 0 });
    fireEvent.click(screen.getByTestId("prefs-retry"));
    await waitFor(() => expect(checked()).toBe("false"), T);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[0]?.[1]).toBe(spy.mock.calls[1]?.[1]);
    expect(await scheduledRows(view)).toHaveLength(0);
    expect(await freshAudits(view, "reminder.preference_changed")).toHaveLength(1);
  });

  it("CTZ-P2 opted out → turn on (morning_of) → exactly one reminder for the approved appointment", async () => {
    const view = await openReminders(PERSONA_IDS.citizen2);
    expect(checked()).toBe("false");
    expect(
      within(screen.getByTestId("section-scheduled")).getByText("Reminders are off"),
    ).toBeTruthy();
    fireEvent.click(toggle());
    await waitFor(() => expect(checked()).toBe("true"), T);
    expect(
      await screen.findByText("We'll remind you on the morning of your appointment.", {}, T),
    ).toBeTruthy();
    const rows = await scheduledRows(view, P2);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ scheduledAt: "2026-10-19T05:00:00.000Z" });
    expect(
      await within(screen.getByTestId("section-scheduled")).findAllByText("SCHEDULED", {}, T),
    ).toHaveLength(1);
  });

  it("consent withdrawal cancels OS-scheduled notifications (provider subscription)", async () => {
    const adapter = platform.notifications() as SimulatedNotificationAdapter;
    await openReminders();
    const before = adapter.cancelAllCalls;
    act(() => emitConsentWithdrawn({ patientId: P1, personaId: PERSONA_IDS.citizen1 }));
    await waitFor(() => expect(adapter.cancelAllCalls).toBe(before + 1));
  });
});

describe("inbox banner and Got it", () => {
  beforeEach(() => resetRouter(["(app)", "(tabs)", "health"]));

  it("clock past scheduledAt → banner → Got it marks it seen; the next step stays planned", async () => {
    const view = await renderShell(<ReminderInboxBanner />, as(PERSONA_IDS.citizen1));
    // The seeded delivered reminder is unread → banner shows; mark it seen first.
    fireEvent.click(await screen.findByTestId("reminder-inbox-banner", {}, T));
    expect(routerLog.at(-1)).toEqual({ method: "push", href: "/reminders" });
    const seeded = (await rowsOf(view)).find((r) => r.status === "delivered_simulated")!;
    await act(async () => {
      await view
        .repo()
        .acknowledgeReminder(
          { patientId: P1, reminderId: seeded.id },
          "00000000-0000-4000-8000-00000000c705",
        );
    });
    view.unmount();

    const banner = await renderShell(<ReminderInboxBanner />, {
      ...as(PERSONA_IDS.citizen1),
      store: view.store,
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(screen.queryByTestId("reminder-inbox-banner")).toBeNull();
    const [due] = await scheduledRows(banner);
    await act(async () => {
      await banner.repo().demo.advanceClock(5 * DAY);
      emitDemoClockChanged();
    });
    expect(await screen.findByTestId("reminder-inbox-banner", {}, T)).toBeTruthy();
    expect(screen.getByText("You have a reminder from your care team")).toBeTruthy();
    expect((await rowsOf(banner)).find((r) => r.id === due!.id)?.status).toBe(
      "delivered_simulated",
    );
    banner.unmount();

    resetRouter(["(app)", "(tabs)", "reminders"]);
    const tab = await renderShell(<RemindersScreen />, {
      ...as(PERSONA_IDS.citizen1),
      store: view.store,
      readyTestId: "reminder-toggle-card",
    });
    fireEvent.click(await screen.findByTestId(`reminder-got-it-${due!.id}`, {}, T));
    await waitFor(
      async () =>
        expect((await rowsOf(tab)).find((r) => r.id === due!.id)?.status).toBe("acknowledged"),
      T,
    );
    await waitFor(() => expect(screen.queryByTestId(`reminder-got-it-${due!.id}`)).toBeNull(), T);
    expect(within(screen.getByTestId("section-history")).getAllByText("SEEN")).toHaveLength(3);
    const step = (await tab.repo().listApprovedInstructions(P1)).find((s) => s.id === APPOINTMENT);
    expect(step).toMatchObject({ progress: "planned", completion: null });
  }, 30_000);
});

describe("reminder preferences", () => {
  beforeEach(() => resetRouter(["(app)", "(tabs)", "reminders", "preferences"]));

  it("morning of → the scheduled reminder moves to 07:00 Kigali on the day (timing_changed)", async () => {
    const view = await renderShell(<ReminderPreferencesScreen />, {
      ...as(PERSONA_IDS.citizen1),
      readyTestId: "timing-selector",
    });
    expect(screen.getByTestId("reminder-channel").textContent).toContain("In this app (demo)");
    // Web / simulated adapter: no device preview button.
    expect(screen.queryByTestId("preview-notification-button")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "The morning of" }));
    await waitFor(async () => {
      const rows = await scheduledRows(view);
      expect(rows.map((r) => (r as unknown as { scheduledAt: string }).scheduledAt)).toEqual([
        "2026-10-19T05:00:00.000Z",
      ]);
    }, T);
    expect((await rowsOf(view)).filter((r) => r.cancelReason === "timing_changed")).toHaveLength(1);
    expect(
      await screen.findByText("You have an appointment today. Open the app for details.", {}, T),
    ).toBeTruthy();
  });

  it("device preview: permission denied → info card, nothing scheduled; granted → one generic preview + audit", async () => {
    const calls: { title: string; body: string }[] = [];
    let permission: "granted" | "denied" = "denied";
    const device: NotificationAdapter = {
      kind: "expo-local",
      canPreview: true,
      ensurePermission: () => Promise.resolve(permission),
      schedulePreview: (content) => {
        calls.push(content);
        return Promise.resolve();
      },
      cancelAll: () => Promise.resolve(),
    };
    const view = await renderShell(
      <ReminderNotificationsProvider adapter={device}>
        <ReminderPreferencesScreen />
      </ReminderNotificationsProvider>,
      { ...as(PERSONA_IDS.citizen1), readyTestId: "preview-notification-button" },
    );
    fireEvent.click(screen.getByTestId("preview-notification-button"));
    expect(await screen.findByTestId("preview-permission-denied", {}, T)).toBeTruthy();
    expect(calls).toHaveLength(0);
    // Everything else still works.
    expect(screen.getByTestId("timing-selector")).toBeTruthy();

    permission = "granted";
    fireEvent.click(screen.getByTestId("preview-notification-button"));
    await waitFor(
      () =>
        expect(calls).toEqual([
          {
            title: "CareConnect reminder",
            body: "You have an appointment tomorrow. Open the app for details.",
          },
        ]),
      T,
    );
    await waitFor(async () =>
      expect(await auditsOf(view.store, "citizen.reminder.preview_sent")).toHaveLength(1),
    );
  });
});
