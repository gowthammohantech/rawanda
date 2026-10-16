import type { AuditEvent, Reminder, ReminderPreference } from "@laif/domain";
import { PERSONA_IDS } from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import { createHarness } from "../testing/harness.ts";

describe("reminders", () => {
  it("citizen lists own reminders; preference create / update with version; opt-out cancels scheduled", async () => {
    const h = await createHarness({ appId: "citizen", personaId: PERSONA_IDS.citizen1 });
    const prefs = await h.store.getAll<ReminderPreference>("reminderPreferences");
    const linked = h.persona(PERSONA_IDS.citizen1).linkedPatientIds;
    const patientId = linked.find((id) => prefs.some((p) => p.patientId === id)) ?? linked[0]!;
    const reminders = await h.repo.listReminders(patientId);
    expect(reminders.every((r) => r.patientId === patientId)).toBe(true);
    const existing = prefs.find((p) => p.patientId === patientId);
    const set = await h.repo.setReminderPreference(
      {
        patientId,
        optedIn: true,
        timing: "morning_of",
        ...(existing ? { expectedVersion: existing.version } : {}),
      },
      h.key(),
    );
    expect(set.data).toMatchObject({ optedIn: true, timing: "morning_of", channel: "in_app" });
    if (existing) {
      await expect(
        h.repo.setReminderPreference(
          { patientId, optedIn: false, timing: "morning_of", expectedVersion: existing.version },
          h.key(),
        ),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    }
    await h.store.put("reminders", {
      ...(reminders[0] ?? (await h.store.getAll<Reminder>("reminders"))[0]!),
      id: "rem-test-1",
      patientId,
      status: "scheduled",
    });
    const off = await h.repo.setReminderPreference(
      { patientId, optedIn: false, timing: "morning_of" },
      h.key(),
    );
    expect(off.data.optedIn).toBe(false);
    expect(await h.store.get("reminders", "rem-test-1")).toMatchObject({
      status: "cancelled",
      cancelReason: "opted_out",
    });
    const event = (await h.store.getAll<AuditEvent>("auditEvents")).find(
      (e) => e.id === off.auditEventId,
    );
    expect(event).toMatchObject({ action: "reminder.preference_changed", patientId });
  });

  it("a patient without a preference gets one created; other patients are out of scope", async () => {
    const h = await createHarness({ appId: "citizen", personaId: PERSONA_IDS.citizen1 });
    const linked = h.persona(PERSONA_IDS.citizen1).linkedPatientIds;
    const prefs = await h.store.getAll<ReminderPreference>("reminderPreferences");
    for (const p of prefs.filter((x) => linked.includes(x.patientId)))
      await h.store.delete("reminderPreferences", p.id);
    const created = await h.repo.setReminderPreference(
      { patientId: linked[0]!, optedIn: true, timing: "day_before" },
      h.key(),
    );
    expect(created.data.version).toBe(1);
    const stranger = h.seed.patients.find((p) => !linked.includes(p.id))!;
    await expect(h.repo.listReminders(stranger.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(h.repo.listCareInstructions(stranger.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      h.repo.setReminderPreference(
        { patientId: stranger.id, optedIn: true, timing: "day_before" },
        h.key(),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
