/**
 * CLN-04 amendment flow on the real app (memory store, StrictMode): validation in EN + RW with
 * nothing persisted, double submit → one amendment + one `screening.amended`, simulated
 * conflict → panel + no overwrite + reload, timeout → values kept + same-key retry, coordinator
 * denied (UI + repository FORBIDDEN), `screening.history_viewed` once per mount.
 */
import type { Screening } from "@laif/domain";
import { FACILITY_IDS, PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import { isRepositoryError, type StoreAdapter } from "@laif/repositories";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { routes } from "../../../app/routes.ts";
import { auditEvents, renderApp, type RenderedApp } from "../../../test/render-app.tsx";
import { createTestClinicalRepo } from "../../../test/test-repository.ts";

const NURSE = { personaId: PERSONA_IDS.nurseAlpha2, facilityId: FACILITY_IDS.alpha2 };
const COORDINATOR = { personaId: PERSONA_IDS.coordAlpha, facilityId: FACILITY_IDS.alpha2 };
const AMENDED = SEED_ANCHORS.AMENDED_SCREENING;
const MISSING_UNIT = SEED_ANCHORS.MISSING_UNIT_SCREENING;
const REASON = "Re-checked the cuff reading with the patient.";

async function storedScreening(store: StoreAdapter, id: string): Promise<Screening> {
  const all = await store.getAll<Screening>("screenings");
  return all.find((s) => s.id === id) as Screening;
}

/** `screening.amended` events of `id` (the seed already holds one for AMENDED_SCREENING). */
const amendedFor = async (store: StoreAdapter, id: string) =>
  (await auditEvents(store, "screening.amended")).filter((e) => e.entityId === id);
const SEEDED_AMENDED_EVENTS = 1;

async function openScreenings(user: UserEvent, patientId: string, signIn = NURSE) {
  const app = await renderApp({ path: routes.patient(patientId), signIn });
  await screen.findByTestId("patient-header");
  await user.click(screen.getByRole("tab", { name: "Screenings" }));
  await screen.findByTestId("screening-timeline");
  return app;
}

async function openDialog(user: UserEvent) {
  await user.click(screen.getByRole("button", { name: /^Amend screening measured/ }));
  return screen.findByRole("dialog", { name: "Amend screening" });
}

async function fillValid(user: UserEvent, dialog: HTMLElement, value = "124") {
  await user.selectOptions(
    within(dialog).getByRole("combobox", { name: /Field to correct/ }),
    "systolic",
  );
  const input = within(dialog).getByRole("textbox", { name: /New value/ });
  await user.clear(input);
  await user.type(input, value);
  await user.type(within(dialog).getByRole("textbox", { name: /Reason for correction/ }), REASON);
}

describe("AmendScreeningDialog", () => {
  it("shows the timeline with units, history and records one screening.history_viewed", async () => {
    const user = userEvent.setup();
    const { store } = await openScreenings(user, AMENDED.patientId);
    const card = screen.getByTestId("screening-card");
    expect(within(card).getByText("126/82 mmHg")).toBeTruthy();
    expect(within(card).getByText("Amended")).toBeTruthy();
    expect(within(card).getByRole("button", { name: "Show correction history (1)" })).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const viewed = (await auditEvents(store, "screening.history_viewed")).filter(
      (e) => e.patientId === AMENDED.patientId,
    );
    expect(viewed).toHaveLength(1);
  });

  it("MISSING_UNIT_SCREENING shows UNIT MISSING and the open-review callout", async () => {
    const user = userEvent.setup();
    await openScreenings(user, MISSING_UNIT.patientId);
    expect(await screen.findByTestId("reading-unit-missing")).toBeTruthy();
    expect(
      screen.getByText("Value recorded without unit — not evaluated by demo rules"),
    ).toBeTruthy();
    expect(screen.getByText("DEMO_RULE_NOT_CLINICALLY_VALIDATED")).toBeTruthy();
    const dialog = await openDialog(user);
    expect(
      within(dialog).getByText(
        "Review uses the evidence snapshot taken at flag time; the amendment is shown to the reviewer.",
      ),
    ).toBeTruthy();
  });

  it("empty value and reason → translated field errors (EN, then RW); nothing persisted", async () => {
    const user = userEvent.setup();
    const { store, services } = await openScreenings(user, AMENDED.patientId);
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole("button", { name: "Save amendment" }));
    expect(await within(dialog).findAllByText("This field is required.")).toHaveLength(2);

    await user.type(within(dialog).getByRole("textbox", { name: /Reason for correction/ }), "typo");
    await user.click(within(dialog).getByRole("button", { name: "Save amendment" }));
    expect(
      await within(dialog).findByText("Give a reason of at least 10 characters."),
    ).toBeTruthy();

    await act(async () => {
      await services.i18n.setLanguage("rw");
    });
    await user.click(within(dialog).getByRole("button", { name: "Bika ikosora" }));
    expect(await within(dialog).findByText("Iki gice kigomba kuzuzwa.")).toBeTruthy();
    expect(within(dialog).getByText("Tanga impamvu ifite nibura inyuguti 10.")).toBeTruthy();

    expect((await storedScreening(store, AMENDED.screeningId)).version).toBe(4);
    expect(await amendedFor(store, AMENDED.screeningId)).toHaveLength(SEEDED_AMENDED_EVENTS);
  });

  it("a double click saves ONE amendment with ONE screening.amended; history shows 2 entries", async () => {
    const user = userEvent.setup();
    const { store } = await openScreenings(user, AMENDED.patientId);
    const dialog = await openDialog(user);
    await fillValid(user, dialog);
    await user.dblClick(within(dialog).getByRole("button", { name: "Save amendment" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByText("Amendment saved")).toBeTruthy();
    const saved = await storedScreening(store, AMENDED.screeningId);
    expect(saved.version).toBe(5);
    expect(saved.amendments).toHaveLength(2);
    expect(saved.systolic).toBe(128); // original retained
    expect(await amendedFor(store, AMENDED.screeningId)).toHaveLength(SEEDED_AMENDED_EVENTS + 1);

    const entries = await screen.findAllByTestId("correction-entry");
    expect(entries).toHaveLength(2);
    expect(entries[1]?.getAttribute("data-highlighted")).toBe("true");
    expect(within(screen.getByTestId("screening-card")).getByText("124/82 mmHg")).toBeTruthy();
  });

  it("conflict fault → conflict panel, no overwrite; reload then saves on the latest", async () => {
    const user = userEvent.setup();
    const { store, services } = await openScreenings(user, AMENDED.patientId);
    await services.repo.demo.setFaults({
      conflictOnce: [{ entityType: "screening", entityId: AMENDED.screeningId }],
    });
    const dialog = await openDialog(user);
    await fillValid(user, dialog);
    await user.click(within(dialog).getByRole("button", { name: "Save amendment" }));

    const panel = await within(dialog).findByTestId("amend-conflict");
    expect(within(panel).getByText("This screening changed since you opened it")).toBeTruthy();
    expect(within(panel).getByText("126/82 mmHg")).toBeTruthy();
    expect((await storedScreening(store, AMENDED.screeningId)).amendments).toHaveLength(1);
    expect(await amendedFor(store, AMENDED.screeningId)).toHaveLength(SEEDED_AMENDED_EVENTS);
    expect(
      within(dialog).getByRole<HTMLButtonElement>("button", { name: "Save amendment" }).disabled,
    ).toBe(true);

    await user.click(within(panel).getByRole("button", { name: "Reload latest values" }));
    await waitFor(() => expect(within(dialog).queryByTestId("amend-conflict")).toBeNull());
    // Entries are kept; saving now applies on the latest version.
    await user.click(within(dialog).getByRole("button", { name: "Save amendment" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect((await storedScreening(store, AMENDED.screeningId)).amendments).toHaveLength(2);
    expect(await amendedFor(store, AMENDED.screeningId)).toHaveLength(SEEDED_AMENDED_EVENTS + 1);
  });

  it("timeout → dialog stays open with values; retry re-sends the same key (one amendment)", async () => {
    const user = userEvent.setup();
    const { store, services }: RenderedApp = await openScreenings(user, AMENDED.patientId);
    await services.repo.demo.setFaults({ timeoutRate: 1 });
    const dialog = await openDialog(user);
    await fillValid(user, dialog);
    await user.click(within(dialog).getByRole("button", { name: "Save amendment" }));
    const failed = await within(dialog).findByTestId("amend-failed");
    expect(
      within(dialog).getByRole<HTMLTextAreaElement>("textbox", { name: /Reason for correction/ })
        .value,
    ).toBe(REASON);

    await services.repo.demo.setFaults({ timeoutRate: 0 });
    await user.click(within(failed).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect((await storedScreening(store, AMENDED.screeningId)).amendments).toHaveLength(2);
    expect(await amendedFor(store, AMENDED.screeningId)).toHaveLength(SEEDED_AMENDED_EVENTS + 1);
  });

  it("coordinator: no amend button (explanation instead) and the repository answers FORBIDDEN", async () => {
    const user = userEvent.setup();
    await openScreenings(user, AMENDED.patientId, COORDINATOR);
    expect(screen.queryByRole("button", { name: /^Amend screening measured/ })).toBeNull();
    expect(screen.getByText("Amendments require clinician privileges")).toBeTruthy();

    const { repo, store } = await createTestClinicalRepo(COORDINATOR);
    const error: unknown = await repo
      .amendScreening(
        {
          screeningId: AMENDED.screeningId,
          expectedVersion: 4,
          field: "systolic",
          after: 124,
          reason: REASON,
        },
        crypto.randomUUID(),
      )
      .catch((e: unknown) => e);
    expect(isRepositoryError(error) ? error.code : null).toBe("FORBIDDEN");
    expect((await storedScreening(store, AMENDED.screeningId)).amendments).toHaveLength(1);
  });
});
