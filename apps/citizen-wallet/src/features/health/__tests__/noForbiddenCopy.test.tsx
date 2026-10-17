/**
 * CTZ-03 task 10 / tech spec §2.4 + §11: every seeded persona with reachable results × EN/RW —
 * the list, every released result's detail and the "Understand my result" sheet — renders no
 * score, risk forecast, diagnosis claim or percentage. The `citizen:health` catalogue itself is
 * scanned too (keys and values), so such copy cannot be added later.
 */
import type { Language } from "@laif/i18n";
import { enResources, rwResources } from "@laif/i18n";
import { PERSONA_IDS } from "@laif/mock-data";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderShell } from "../../../test/harness.tsx";
import { resetRouter } from "../../../test/router-stub.tsx";
import {
  FORBIDDEN_COPY,
  findForbiddenCopy,
  forbiddenCopyKeys,
  JUDGEMENT_WORDS,
} from "../__guards__/noScore.ts";
import { HealthListScreen } from "../HealthListScreen.tsx";
import { ResultDetailScreen } from "../ResultDetailScreen.tsx";

vi.mock("expo-router", () => import("../../../test/router-stub.tsx"));

const PERSONAS = [PERSONA_IDS.citizen1, PERSONA_IDS.citizen2, PERSONA_IDS.citizenRep];
const LANGUAGES: Language[] = ["en", "rw"];
const health: Record<Language, unknown> = {
  en: enResources.citizen.health,
  rw: (rwResources.citizen as { health: unknown }).health,
};

function rendered(container: HTMLElement): string {
  // Visible text plus every accessible name (screen readers read those too).
  const labels = [...container.querySelectorAll("[aria-label]")].map(
    (e) => e.getAttribute("aria-label") ?? "",
  );
  return [container.textContent ?? "", ...labels].join("\n");
}

describe("guard helper", () => {
  it("flags the forbidden patterns (EN + RW)", () => {
    expect(findForbiddenCopy("Your wellness score is 80%", "en").map((m) => m.match)).toEqual([
      "score",
      "%",
    ]);
    expect(findForbiddenCopy("You have hypertension", "en")).toHaveLength(1);
    expect(findForbiddenCopy("You were diagnosed with diabetes", "en")).toHaveLength(1);
    expect(findForbiddenCopy("This result is not a diagnosis.", "en")).toHaveLength(0);
    expect(findForbiddenCopy("Amanota yawe ni 80", "rw")).toHaveLength(1);
    expect(forbiddenCopyKeys({ a: { riskScore: "x" }, b: "ok" }, "en")).toEqual(["a.riskScore"]);
  });

  it.each(LANGUAGES)("citizen:health catalogue (%s) has no forbidden key or copy", (lng) => {
    expect(forbiddenCopyKeys(health[lng], lng)).toEqual([]);
    const understand = (health[lng] as { understand: Record<string, string> }).understand;
    for (const text of Object.values(understand)) expect(text).not.toMatch(JUDGEMENT_WORDS[lng]);
    expect(FORBIDDEN_COPY[lng]).toBeInstanceOf(RegExp);
  });
});

describe.each(LANGUAGES)("rendered wallet health copy (%s)", (lng) => {
  it.each(PERSONAS)("%s: list, every detail and the explainer sheet", async (personaId) => {
    resetRouter(["(app)", "(tabs)", "health"]);
    const view = await renderShell(<HealthListScreen />, {
      before: (s) => void s.session.switchTo(personaId),
      readyTestId: "health-screen",
    });
    await act(async () => view.services.i18n.setLanguage(lng));
    const list = await screen.findByTestId("results-list", {}, { timeout: 10_000 });
    expect(view.container.textContent).toContain((health[lng] as { subtitle: string }).subtitle);
    expect(findForbiddenCopy(rendered(view.container), lng)).toEqual([]);
    const ids = within(list)
      .queryAllByRole("button")
      .map((b) => b.getAttribute("data-testid")?.replace("result-card-", "") ?? "")
      .filter((id) => id !== "");
    expect(ids.length).toBeGreaterThan(0);
    view.unmount();

    for (const id of ids) {
      const detail = await renderShell(<ResultDetailScreen observationId={id} />, {
        before: (s) => void s.session.switchTo(personaId),
        readyTestId: "result-detail",
      });
      await act(async () => detail.services.i18n.setLanguage(lng));
      fireEvent.click(screen.getByTestId("understand-open"));
      const sheet = await screen.findByTestId("understand-sheet");
      const copy = health[lng] as { understand: { clinician: string } };
      expect(sheet.textContent).toContain(copy.understand.clinician);
      expect(findForbiddenCopy(rendered(document.body), lng), id).toEqual([]);
      detail.unmount();
    }
  });
});
