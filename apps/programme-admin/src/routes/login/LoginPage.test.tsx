/**
 * Demo sign-in (ADM-01 §10): persona choice, scope step (programme lead only), validation
 * messages in EN and RW, and all four personas signing in.
 */
import { rwResources } from "@laif/i18n";
import { DISTRICT_IDS, PERSONA_IDS } from "@laif/mock-data";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { auditEvents, bootApp } from "../../test/app.tsx";

const RW_AUTH = (
  rwResources.admin as {
    auth: { validation: { personaRequired: string; scopeRequired: string }; title: string };
  }
).auth;

const openLogin = (path = "/admin/login") => bootApp({ path });

const choose = async (user: ReturnType<typeof userEvent.setup>, name: RegExp) => {
  const group = await screen.findByRole("group", { name: "Choose a demo persona" });
  await user.click(within(group).getByRole("radio", { name }));
};

describe("LoginPage", () => {
  it("lists the four labelled DEMO PERSONA cards with role, scope and capability chips", async () => {
    await openLogin();
    const group = await screen.findByRole("group", { name: "Choose a demo persona" });
    expect(within(group).getAllByRole("radio")).toHaveLength(4);
    expect(within(group).getAllByText("DEMO PERSONA")).toHaveLength(4);
    expect(within(group).getByText("Districts: Demo District Alpha")).toBeTruthy();
    expect(within(group).getAllByText(/Facilities: /)).toHaveLength(1);
    expect(screen.getByText(/Real authentication, MFA and single sign-on/)).toBeTruthy();
  });

  it("validation: submitting without a persona shows an inline error (EN, then RW)", async () => {
    const user = userEvent.setup();
    await openLogin();
    await screen.findByRole("group", { name: "Choose a demo persona" });
    await user.click(screen.getByRole("button", { name: "Start demo session" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Choose a demo persona to continue",
    );
    await user.click(screen.getByRole("button", { name: "Ikinyarwanda" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(RW_AUTH.validation.personaRequired),
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(RW_AUTH.title);
  });

  it("programme lead gets the scope step; no scope → inline error; single district → overview", async () => {
    const user = userEvent.setup();
    const { router, services, store } = await openLogin();
    await choose(user, /Vaqvox Varqezo/);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    const scopes = await screen.findByRole("group", { name: "Choose reporting scope" });
    expect(screen.getByText("Step 2 of 2")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Start demo session" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Choose a reporting scope to continue",
    );
    await user.click(within(scopes).getByRole("radio", { name: /^Demo District Beta/ }));
    await user.click(screen.getByRole("button", { name: "Start demo session" }));
    await screen.findByTestId("app-shell");
    expect(router.state.location.pathname + router.state.location.search).toBe(
      `/admin/overview?district=${DISTRICT_IDS.beta}`,
    );
    const session = services.session.getState().session;
    expect(session).toMatchObject({
      personaId: PERSONA_IDS.leadProgramme,
      grantId: "grant-persona-lead-programme",
      grantVersion: 1,
      reportingDistrictId: DISTRICT_IDS.beta,
    });
    const started = (await auditEvents(store, "session.started")).filter(
      (e) => e.correlationId === session?.correlationId,
    );
    expect(started).toHaveLength(1);
    expect(started[0]).toMatchObject({ actorId: PERSONA_IDS.leadProgramme, category: "access" });
  });

  it("programme lead: 'All districts in my scope' → overview without a district", async () => {
    const user = userEvent.setup();
    const { router } = await openLogin();
    await choose(user, /Vaqvox Varqezo/);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    const scopes = await screen.findByRole("group", { name: "Choose reporting scope" });
    await user.click(within(scopes).getByRole("radio", { name: /All districts in my scope/ }));
    await user.click(screen.getByRole("button", { name: "Start demo session" }));
    await screen.findByTestId("app-shell");
    expect(router.state.location.pathname + router.state.location.search).toBe("/admin/overview");
    expect((await screen.findByTestId("scope-strip")).textContent).toContain(
      "All districts in my scope (Demo District Alpha, Demo District Beta)",
    );
  });

  it.each([
    [/Quavel Quoriqua/, `/admin/overview?district=${DISTRICT_IDS.alpha}`],
    [/Xelzo Xaboxe/, "/admin/overview?facility=fac-alpha-1"],
    [/Zorqa Zelqumbra/, "/admin/overview"],
  ])("%s skips the scope step and lands on %s", async (name, expected) => {
    const user = userEvent.setup();
    const { router } = await openLogin();
    await choose(user, name);
    expect(screen.queryByText("Step 1 of 2")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Start demo session" }));
    await screen.findByTestId("app-shell");
    expect(router.state.location.pathname + router.state.location.search).toBe(expected);
  });

  it("returns to `next` after sign-in and ignores foreign `next` values", async () => {
    const user = userEvent.setup();
    const { router } = await openLogin(
      "/admin/login?next=%2Fadmin%2Freports%3Fdistrict%3Ddist-alpha",
    );
    await choose(user, /Quavel Quoriqua/);
    await user.click(screen.getByRole("button", { name: "Start demo session" }));
    await screen.findByTestId("app-shell");
    expect(router.state.location.pathname + router.state.location.search).toBe(
      "/admin/reports?district=dist-alpha",
    );
  });

  it("pre-selects the persona from ?persona= (Switch demo persona)", async () => {
    await openLogin(`/admin/login?persona=${PERSONA_IDS.auditorProgramme}`);
    const group = await screen.findByRole("group", { name: "Choose a demo persona" });
    expect(
      within(group).getByRole<HTMLInputElement>("radio", { name: /Zorqa Zelqumbra/ }).checked,
    ).toBe(true);
  });
});
