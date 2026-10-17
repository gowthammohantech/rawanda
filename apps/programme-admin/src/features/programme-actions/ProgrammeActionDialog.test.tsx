/**
 * ProgrammeActionDialog (ADM-03 §10): field-level validation in EN and RW with focus on the first
 * invalid field, submit disabled while pending (no double submit), and a simulated timeout +
 * retry that reuses the idempotency key → exactly one record and one created audit event.
 */
import type { ProgrammeAction } from "@laif/contracts";
import { FACILITY_IDS, PERSONA_IDS } from "@laif/mock-data";
import { readStoreCollection } from "@laif/test-utils";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { auditEvents, bootApp } from "../../test/app.tsx";

const CHART = { width: 800, height: 240 };
type User = ReturnType<typeof userEvent.setup>;

async function openDialog(user: User, actionsName: RegExp, assignName: string) {
  const result = await bootApp({
    path: "/admin/funnel/reviewed",
    signInAs: PERSONA_IDS.analystAlpha,
    chartSize: CHART,
  });
  await screen.findByTestId("stage-breakdown", {}, { timeout: 15_000 });
  await user.click(screen.getByRole("button", { name: /Demo District Alpha/ }));
  const row = screen.getByTestId(`facility-row-${FACILITY_IDS.alpha1}`);
  await user.click(within(row).getByRole("button", { name: actionsName }));
  await user.click(within(row).getByRole("button", { name: assignName }));
  const form = await screen.findByTestId("programme-action-form");
  return { ...result, form, dialog: screen.getByRole("dialog") };
}

async function fill(user: User, form: HTMLElement, title = "Supervision visit for data entry") {
  await user.selectOptions(within(form).getByLabelText(/Category/), "supervision_visit");
  await user.type(within(form).getByLabelText(/Title/), title);
}

describe("ProgrammeActionDialog", () => {
  it("EN: empty submit → field errors, focus on the first invalid field, nothing saved", async () => {
    const user = userEvent.setup();
    const { dialog, form, store } = await openDialog(
      user,
      /Actions for/,
      "Assign programme follow-up",
    );
    expect(within(dialog).getByTestId("programme-action-banner").textContent).toBe(
      "Programme action — not a clinical decision",
    );
    expect(within(dialog).getAllByText(/Demo Health Centre Alpha-1/).length).toBeGreaterThan(0);
    await user.click(within(dialog).getByRole("button", { name: "Assign follow-up" }));
    expect(await within(form).findByText("Choose a category")).toBeTruthy();
    expect(within(form).getByText("Title must be 5 to 120 characters")).toBeTruthy();
    const category = within(form).getByLabelText(/Category/);
    expect(category.getAttribute("aria-invalid")).toBe("true");
    await waitFor(() => expect(document.activeElement).toBe(category));
    // A too-short title keeps the title error; a due date outside the window is rejected.
    await user.selectOptions(category, "data_completeness_check");
    await user.type(within(form).getByLabelText(/Title/), "abc");
    const due = within(form).getByLabelText(/Due date/);
    await user.clear(due);
    await user.type(due, "2030-01-01");
    await user.click(within(dialog).getByRole("button", { name: "Assign follow-up" }));
    expect(await within(form).findByText(/Choose a due date from/)).toBeTruthy();
    expect(within(form).getByText("Title must be 5 to 120 characters")).toBeTruthy();
    expect(within(form).queryByText("Choose a category")).toBeNull();
    expect(await readStoreCollection(store, "programmeActions")).toHaveLength(0);
  });

  it("RW: the same field errors in Kinyarwanda", async () => {
    const user = userEvent.setup();
    const booted = await bootApp({
      path: "/admin/funnel/reviewed",
      signInAs: PERSONA_IDS.analystAlpha,
      chartSize: CHART,
    });
    await screen.findByTestId("stage-breakdown", {}, { timeout: 15_000 });
    await user.click(screen.getByRole("button", { name: "Ikinyarwanda" }));
    await user.click(screen.getByRole("button", { name: /Demo District Alpha|Alpha/ }));
    const row = screen.getByTestId(`facility-row-${FACILITY_IDS.alpha1}`);
    await user.click(within(row).getByRole("button", { name: /Ibikorwa bya/ }));
    await user.click(
      within(row).getByRole("button", { name: "Tanga igikorwa cyo gukurikirana cya porogaramu" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByTestId("programme-action-banner").textContent).toBe(
      "Igikorwa cya porogaramu — si icyemezo cy'ubuvuzi",
    );
    await user.click(within(dialog).getByRole("button", { name: "Tanga igikorwa" }));
    expect(await within(dialog).findByText("Hitamo icyiciro")).toBeTruthy();
    expect(within(dialog).getByText("Umutwe ugomba kugira inyuguti 5 kugeza 120")).toBeTruthy();
    booted.unmount();
  });

  it("submit is disabled while pending: a double click creates one record", async () => {
    const user = userEvent.setup();
    const { dialog, form, services, store } = await openDialog(
      user,
      /Actions for/,
      "Assign programme follow-up",
    );
    const original = services.repo.createProgrammeAction.bind(services.repo);
    const keys: string[] = [];
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    services.repo.createProgrammeAction = async (input, key) => {
      keys.push(key);
      await gate;
      return original(input, key);
    };
    await fill(user, form);
    const submit = within(dialog).getByRole("button", { name: "Assign follow-up" });
    await user.click(submit);
    await waitFor(() => expect(submit.getAttribute("aria-busy")).toBe("true"));
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    await user.click(submit);
    await user.keyboard("{Enter}");
    release();
    expect(await screen.findByText("Programme action assigned")).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId("programme-action-form")).toBeNull());
    expect(keys).toHaveLength(1);
    expect(await readStoreCollection(store, "programmeActions")).toHaveLength(1);
  });

  it("timeout + retry reuses the key: exactly one record and one created audit event", async () => {
    const user = userEvent.setup();
    const { dialog, form, services, store } = await openDialog(
      user,
      /Actions for/,
      "Assign programme follow-up",
    );
    const original = services.repo.createProgrammeAction.bind(services.repo);
    const keys: string[] = [];
    services.repo.createProgrammeAction = (input, key) => {
      keys.push(key);
      return original(input, key);
    };
    await services.repo.demo.setFaults({ timeoutRate: 1 });
    await fill(user, form);
    await user.click(within(dialog).getByRole("button", { name: "Assign follow-up" }));
    const alert = await within(dialog).findByTestId("programme-action-error");
    expect(alert.textContent).toContain("Not saved — retry");
    // The dialog stays open with the input preserved.
    expect(within(form).getByLabelText<HTMLInputElement>(/Title/).value).toBe(
      "Supervision visit for data entry",
    );
    await services.repo.demo.setFaults({ timeoutRate: 0 });
    await user.click(within(dialog).getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Programme action assigned")).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId("programme-action-form")).toBeNull());

    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
    const rows = await readStoreCollection<ProgrammeAction>(store, "programmeActions");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      facilityId: FACILITY_IDS.alpha1,
      category: "supervision_visit",
      status: "open",
      idempotencyKey: keys[0],
      sourceContext: { page: "funnel_stage", stage: "reviewed" },
    });
    const created = await auditEvents(store, "admin.programme_action.created");
    expect(created).toHaveLength(1);
    expect(created[0]?.correlationId).toBe(services.session.getState().session?.correlationId);
    // The side card lists the new action, highlighted.
    const item = await screen.findByTestId(`programme-action-${rows[0]?.id}`);
    expect(item.getAttribute("data-highlighted")).toBe("true");
    expect(item.textContent).toContain("Open");
  });
});
