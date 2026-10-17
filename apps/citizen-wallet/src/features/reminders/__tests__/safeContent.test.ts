/**
 * CTZ-05 task 7 / PRD §10: reminder copy is generic in EN and RW — no interpolation token
 * outside the (empty) whitelist, no digits / units / condition words / names / facilities, and
 * a missing RW key falls back to EN (never a raw key).
 */
import { createTestI18n, enResources, rwResources, type Language } from "@laif/i18n";
import { createSeed } from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import {
  interpolationTokens,
  SAFE_CONTENT_ALLOWED_TOKENS,
  SAFE_REMINDER_KEYS,
  safeReminderContent,
} from "../safeContent.ts";

const SAFE: Record<Language, Record<string, string>> = {
  en: enResources.citizen.reminders.safe,
  rw: (rwResources.citizen as { reminders: { safe: Record<string, string> } }).reminders.safe,
};
const COPY_KEYS = ["title", "bodyTomorrow", "bodyToday"] as const;

/** Words that would reveal health details on a shared phone (EN + RW). */
const FORBIDDEN = [
  /\d/u,
  /mmhg|mg\/dl|glucose|pressure|diabet|hypert|blood|result|flag|risk|disease|condition/iu,
  /umuvuduko|isukari|indwara|ibisubizo by|amaraso/iu,
];

describe("safe reminder content", () => {
  const seed = createSeed();
  const names = [
    ...seed.patients.map((p) => (p as unknown as { displayName?: string }).displayName ?? ""),
    ...seed.personas.map((p) => p.displayName),
    ...seed.facilities.map((f) => f.name),
  ].filter((n) => n.length > 3);

  for (const language of ["en", "rw"] as const) {
    it(`${language}: only whitelisted interpolation tokens (none) and no health details`, () => {
      for (const key of COPY_KEYS) {
        const text = SAFE[language][key];
        expect(text, key).toBeTruthy();
        for (const token of interpolationTokens(text ?? "")) {
          expect(SAFE_CONTENT_ALLOWED_TOKENS, `${language}:${key} uses {{${token}}}`).toContain(
            token,
          );
        }
        for (const pattern of FORBIDDEN) expect(text, `${language}:${key}`).not.toMatch(pattern);
        for (const name of names) expect(text, `${language}:${key}`).not.toContain(name);
      }
    });
  }

  it("the whitelist is empty and the keys are the only source", () => {
    expect(SAFE_CONTENT_ALLOWED_TOKENS).toEqual([]);
    expect(interpolationTokens("Hello {{name}} and {{ value }}")).toEqual(["name", "value"]);
    expect(Object.values(SAFE_REMINDER_KEYS)).toEqual([
      "citizen:reminders.safe.title",
      "citizen:reminders.safe.bodyTomorrow",
      "citizen:reminders.safe.bodyToday",
    ]);
  });

  it("resolves in the current language at delivery time (EN / RW)", () => {
    const en = createTestI18n("en", { appId: "citizen" });
    expect(safeReminderContent(en.t as never, "day_before")).toEqual({
      title: "CareConnect reminder",
      body: "You have an appointment tomorrow. Open the app for details.",
    });
    expect(safeReminderContent(en.t as never, "morning_of").body).toBe(
      "You have an appointment today. Open the app for details.",
    );
    const rw = createTestI18n("rw", { appId: "citizen" });
    expect(safeReminderContent(rw.t as never, "day_before").body).toBe(
      "Ufite gahunda ejo. Fungura porogaramu urebe ibisobanuro.",
    );
  });

  it("falls back to EN when an RW key is missing (never a raw key)", () => {
    const rw = createTestI18n("rw", { appId: "citizen" });
    const bundle = rw.i18n.getResourceBundle("rw", "citizen") as {
      reminders: { safe: Record<string, string | undefined> };
    };
    const copy = structuredClone(bundle);
    delete copy.reminders.safe["title"];
    rw.i18n.addResourceBundle("rw", "citizen", copy, false, true);
    expect(safeReminderContent(rw.t as never, "morning_of").title).toBe("CareConnect reminder");
  });
});
