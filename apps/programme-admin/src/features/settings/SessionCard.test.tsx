/**
 * ADM-09 session expiry (FRD T-09): "Expire session now" records `session.expired`; the next
 * navigation redirects to the sign-in with `next` = the same path + filters and the notice; after
 * re-login the user is back on the filtered view. An open programme-action dialog keeps its draft
 * (sessionStorage, keyed by idempotency key): the submit that failed on the expired session is
 * restored after re-login and creates exactly ONE record.
 */
import type { ProgrammeAction } from "@laif/contracts";
import { FACILITY_IDS, PERSONA_IDS } from "@laif/mock-data";
import { readStoreCollection } from "@laif/test-utils";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { expireAdminSession } from "../../auth/signIn.ts";
import { DRAFTS_STORAGE_KEY } from "../../lib/drafts.ts";
import { auditEvents, bootApp } from "../../test/app.tsx";

const CHART = { width: 800, height: 240 };

describe("session expiry (ADM-09)", () => {
  it("Expire session now → next navigation → login?next=…&expired=1 → same filtered view", async () => {
    const user = userEvent.setup();
    const { store, router, services } = await bootApp({
      path: "/admin/settings?preset=30d",
      signInAs: PERSONA_IDS.analystAlpha,
      waitFor: "settings-page",
    });
    await user.click(await screen.findByRole("button", { name: "Expire session now" }));
    expect(await screen.findByTestId("session-expired-status")).toBeTruthy();
    expect(await auditEvents(store, "session.expired")).toHaveLength(1);
    // Repository calls no longer carry an actor.
    expect(services.session.actor()).toBeNull();

    await router.navigate("/admin/timeliness?preset=30d");
    await waitFor(() => expect(router.state.location.pathname).toBe("/admin/login"));
    const params = new URLSearchParams(router.state.location.search);
    expect(params.get("next")).toBe("/admin/timeliness?preset=30d");
    expect(params.get("expired")).toBe("1");
    expect(await screen.findByTestId("session-expired-notice")).toBeTruthy();
    expect(screen.getByText("Your demo session expired. Sign in again to continue.")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Start demo session" }));
    await waitFor(() =>
      expect(`${router.state.location.pathname}${router.state.location.search}`).toBe(
        "/admin/timeliness?preset=30d",
      ),
    );
  });

  it("a restored programme-action draft submits exactly once after re-login", async () => {
    const user = userEvent.setup();
    const { store, router, services } = await bootApp({
      path: "/admin/funnel/reviewed",
      signInAs: PERSONA_IDS.analystAlpha,
      chartSize: CHART,
    });
    await screen.findByTestId("stage-breakdown", {}, { timeout: 15_000 });
    await user.click(screen.getByRole("button", { name: /Demo District Alpha/ }));
    const row = screen.getByTestId(`facility-row-${FACILITY_IDS.alpha1}`);
    await user.click(within(row).getByRole("button", { name: /Actions for/ }));
    await user.click(within(row).getByRole("button", { name: "Assign programme follow-up" }));
    const form = await screen.findByTestId("programme-action-form");
    await user.selectOptions(within(form).getByLabelText(/Category/), "supervision_visit");
    await user.type(within(form).getByLabelText(/Title/), "Supervision visit for data entry");
    expect(window.sessionStorage.getItem(DRAFTS_STORAGE_KEY)).toContain(
      "Supervision visit for data entry",
    );

    // The session expires while the dialog is open; the submit fails and redirects.
    await expireAdminSession(services);
    await user.click(screen.getByRole("button", { name: "Assign follow-up" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/admin/login"), {
      timeout: 10_000,
    });
    expect(await readStoreCollection<ProgrammeAction>(store, "programmeActions")).toHaveLength(0);

    await user.click(await screen.findByRole("button", { name: "Start demo session" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/admin/funnel/reviewed"));
    const restored = await screen.findByTestId("programme-action-form", {}, { timeout: 15_000 });
    expect(within(restored).getByLabelText<HTMLInputElement>(/Title/).value).toBe(
      "Supervision visit for data entry",
    );
    await user.click(screen.getByRole("button", { name: "Assign follow-up" }));
    await waitFor(async () =>
      expect(await readStoreCollection<ProgrammeAction>(store, "programmeActions")).toHaveLength(1),
    );
    expect(await auditEvents(store, "admin.programme_action.created")).toHaveLength(1);
    await waitFor(() => expect(window.sessionStorage.getItem(DRAFTS_STORAGE_KEY)).toBeNull());
  });

  it("triage and export-reason drafts come back after re-login (and only then)", async () => {
    const user = userEvent.setup();
    const { router, services } = await bootApp({
      path: "/admin/quality",
      signInAs: PERSONA_IDS.analystAlpha,
      chartSize: CHART,
    });
    await screen.findByTestId("issue-queue", {}, { timeout: 15_000 });
    await waitFor(() => expect(screen.getAllByTestId(/^issue-row-/).length).toBeGreaterThan(0), {
      timeout: 15_000,
    });
    const row = screen.getAllByTestId(/^issue-row-/)[0];
    if (row === undefined) throw new Error("no issue row");
    const firstButton = within(row).getAllByRole("button")[0];
    if (firstButton === undefined) throw new Error("no row button");
    await user.click(firstButton);
    await user.click(within(row).getByRole("button", { name: "Resolve with note…" }));
    const form = await screen.findByTestId("triage-form");
    await user.type(within(form).getByRole("textbox"), "Checked the paper register (draft).");

    // The session expires while the dialog is open; the next failing call redirects with
    // `next` = this page.
    await expireAdminSession(services);
    act(() => services.session.noticeExpiry());
    await waitFor(() => expect(router.state.location.pathname).toBe("/admin/login"));
    expect(new URLSearchParams(router.state.location.search).get("next")).toBe("/admin/quality");
    await user.click(await screen.findByRole("button", { name: "Start demo session" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/admin/quality"));
    const restored = await screen.findByTestId("triage-form", {}, { timeout: 15_000 });
    expect(within(restored).getByRole<HTMLTextAreaElement>("textbox").value).toBe(
      "Checked the paper register (draft).",
    );
  });

  it("export reason draft is restored at the reason step after re-login", async () => {
    const user = userEvent.setup();
    const { router, services } = await bootApp({
      path: "/admin/reports?template=programme_summary",
      signInAs: PERSONA_IDS.analystAlpha,
      waitFor: "report-builder",
    });
    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByTestId("preview-row-count", {}, { timeout: 15_000 });
    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByTestId("export-reason-form");
    await user.click(screen.getByRole("radio", { name: "District meeting" }));

    await expireAdminSession(services);
    act(() => services.session.noticeExpiry());
    await waitFor(() => expect(router.state.location.pathname).toBe("/admin/login"));
    await user.click(await screen.findByRole("button", { name: "Start demo session" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/admin/reports"));
    await screen.findByTestId("export-reason-form", {}, { timeout: 15_000 });
    expect(screen.getByRole<HTMLInputElement>("radio", { name: "District meeting" }).checked).toBe(
      true,
    );
  });
});
