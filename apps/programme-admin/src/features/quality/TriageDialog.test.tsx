/**
 * TriageDialog (ADM-06 §10): a 3-character note shows the field error (EN and RW) with focus on
 * the field and saves nothing; a valid note resolves (history lists actor, role and time); the
 * submit is disabled while pending (a double click resolves once); a timeout keeps the dialog
 * open with the input and the retry reuses the key; triage never changes a screening.
 */
import type { DataQualityIssue } from "@laif/contracts";
import { PERSONA_IDS } from "@laif/mock-data";
import { readStoreCollection } from "@laif/test-utils";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { auditEvents, bootApp } from "../../test/app.tsx";

const CHART = { width: 800, height: 240 };
type User = ReturnType<typeof userEvent.setup>;

const CLINICAL = ["patients", "screenings", "reviews", "referrals", "followUps"] as const;

async function openResolve(user: User, rw = false) {
  const booted = await bootApp({
    path: "/admin/quality",
    signInAs: PERSONA_IDS.analystAlpha,
    chartSize: CHART,
  });
  await screen.findByTestId("issue-queue", {}, { timeout: 15_000 });
  await waitFor(() => expect(screen.getAllByTestId(/^issue-row-/).length).toBeGreaterThan(0), {
    timeout: 15_000,
  });
  if (rw) await user.click(screen.getByRole("button", { name: "Ikinyarwanda" }));
  const row = screen.getAllByTestId(/^issue-row-/)[0]!;
  const id = row.getAttribute("data-testid")!.replace("issue-row-", "");
  await user.click(within(row).getAllByRole("button")[0]!);
  await user.click(
    within(row).getByRole("button", {
      name: rw ? "Kemura wandike icyitonderwa…" : "Resolve with note…",
    }),
  );
  const form = await screen.findByTestId("triage-form");
  return { ...booted, id, form, dialog: screen.getByRole("dialog") };
}

const note = (form: HTMLElement) => within(form).getByRole("textbox");

describe("TriageDialog", () => {
  it("EN: a 3-character note → field error with focus; a valid note resolves with history", async () => {
    const user = userEvent.setup();
    const { dialog, form, store, id } = await openResolve(user);
    const before = await Promise.all(CLINICAL.map((c) => readStoreCollection(store, c)));
    await user.type(note(form), "abc");
    await user.click(within(dialog).getByRole("button", { name: "Resolve" }));
    expect((await within(form).findByTestId("triage-note-error")).textContent).toBe(
      "Add a note of 10 to 500 characters",
    );
    expect(note(form).getAttribute("aria-invalid")).toBe("true");
    await waitFor(() => expect(document.activeElement).toBe(note(form)));
    expect(
      (await readStoreCollection<DataQualityIssue>(store, "dataQualityIssues")).find(
        (i) => i.id === id,
      )?.status,
    ).toBe("open");

    await user.type(note(form), " — unit confirmed with the facility register");
    await user.click(within(dialog).getByRole("button", { name: "Resolve" }));
    expect(await screen.findByText("Issue resolved")).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId("triage-form")).toBeNull());
    const resolved = (await readStoreCollection<DataQualityIssue>(store, "dataQualityIssues")).find(
      (i) => i.id === id,
    );
    expect(resolved).toMatchObject({
      status: "resolved_with_note",
      history: [{ by: PERSONA_IDS.analystAlpha, role: "district_analyst", action: "resolve" }],
    });
    // The Resolved tab shows it; its history names the actor, role and time.
    await user.click(screen.getByRole("tab", { name: /^Resolved/ }));
    const row = await screen.findByTestId(`issue-row-${id}`);
    await user.click(within(row).getAllByRole("button")[0]!);
    expect(within(row).getByTestId("issue-history").textContent).toMatch(
      /Resolved by .+ \(District analyst\)/,
    );
    // Triage never changes a clinical record (table snapshots).
    expect(await Promise.all(CLINICAL.map((c) => readStoreCollection(store, c)))).toEqual(before);
  });

  it("RW: the note error in Kinyarwanda", async () => {
    const user = userEvent.setup();
    const { dialog, form } = await openResolve(user, true);
    await user.type(note(form), "abc");
    await user.click(within(dialog).getByRole("button", { name: "Kemura" }));
    expect((await within(form).findByTestId("triage-note-error")).textContent).toBe(
      "Andika icyitonderwa gifite inyuguti 10 kugeza 500",
    );
  });

  it("submit is disabled while pending: a double click resolves once", async () => {
    const user = userEvent.setup();
    const { dialog, form, services, store } = await openResolve(user);
    const original = services.repo.triageQualityIssue.bind(services.repo);
    const keys: string[] = [];
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    services.repo.triageQualityIssue = async (input, key) => {
      keys.push(key);
      await gate;
      return original(input, key);
    };
    await user.type(note(form), "Facility confirmed the unit at source");
    const submit = within(dialog).getByRole("button", { name: "Resolve" });
    await user.click(submit);
    await waitFor(() => expect(submit.getAttribute("aria-busy")).toBe("true"));
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    await user.click(submit);
    release();
    expect(await screen.findByText("Issue resolved")).toBeTruthy();
    expect(keys).toHaveLength(1);
    expect(await auditEvents(store, "admin.quality_issue.triaged")).toHaveLength(1);
  });

  it("timeout keeps the dialog open with the input; retry reuses the key", async () => {
    const user = userEvent.setup();
    const { dialog, form, services, store } = await openResolve(user);
    const original = services.repo.triageQualityIssue.bind(services.repo);
    const keys: string[] = [];
    services.repo.triageQualityIssue = (input, key) => {
      keys.push(key);
      return original(input, key);
    };
    await services.repo.demo.setFaults({ timeoutRate: 1 });
    await user.type(note(form), "Facility confirmed the unit at source");
    await user.click(within(dialog).getByRole("button", { name: "Resolve" }));
    expect((await within(dialog).findByTestId("triage-error")).textContent).toContain(
      "Not saved — retry",
    );
    expect((note(form) as HTMLTextAreaElement).value).toBe("Facility confirmed the unit at source");
    await services.repo.demo.setFaults({ timeoutRate: 0 });
    await user.click(within(dialog).getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Issue resolved")).toBeTruthy();
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
    expect(await auditEvents(store, "admin.quality_issue.triaged")).toHaveLength(1);
  });
});
