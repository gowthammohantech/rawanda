/**
 * Admin shell smoke tests (FND-11, updated for ADM-01): no session → demo sign-in; the shell
 * boots on a memory-adapter repository with the DEMONSTRATION banner, RoleBanner and EN/RW
 * switcher on every route (login, 403, 404 included), demo tools, capability-locked nav items.
 */
import { enResources, rwResources } from "@laif/i18n";
import { createSeed, PERSONA_IDS, SEED_ANCHORS, sliceForApp } from "@laif/mock-data";
import {
  computeDatasetHash,
  createMemoryStoreAdapter,
  datasetToRecords,
  type StoreAdapter,
} from "@laif/repositories";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

import { auditEvents, bootApp, createTestServices } from "../test/app.tsx";
import { App } from "./App.tsx";
import { APP_ID } from "./config.ts";
import { routes } from "./router.tsx";

const EN_BANNER = enResources.demo.banner;
const RW_BANNER = (rwResources.demo as { banner: string }).banner;
const RW_ADMIN = rwResources.admin as {
  nav: { reports: string };
  errors: { forbidden: { title: string } };
};

const signedIn = (path = "/admin/overview", store?: StoreAdapter) =>
  bootApp({
    path,
    signInAs: PERSONA_IDS.analystAlpha,
    waitFor: "app-shell",
    ...(store === undefined ? {} : { store }),
  });

describe("programme-admin shell", () => {
  it("without a session /admin/overview redirects to the demo sign-in with ?next", async () => {
    const { router } = await bootApp({ path: "/admin/overview" });
    await screen.findByRole("heading", { level: 1, name: "Demo sign-in" });
    expect(router.state.location.pathname).toBe("/admin/login");
    expect(router.state.location.search).toBe("?next=%2Fadmin%2Foverview");
    // Banners on the public sign-in page too.
    expect(screen.getByTestId("demo-banner").textContent).toContain(EN_BANNER);
    expect(screen.getByRole("note").textContent).toContain("Demo role — not authentication");
    expect(screen.getByRole("button", { name: "Ikinyarwanda" })).toBeTruthy();
  });

  it("/ and /admin redirect to the overview (then to sign-in when signed out)", async () => {
    const { router } = await bootApp({ path: "/" });
    await screen.findByRole("heading", { level: 1, name: "Demo sign-in" });
    expect(router.state.location.search).toBe("?next=%2Fadmin%2Foverview");
  });

  it("boots seeded with the banner, role banner, scope strip and grouped nav", async () => {
    const { services } = await signedIn();
    expect(screen.getByTestId("demo-banner").textContent).toContain(EN_BANNER);
    expect(services.session.getState().persona?.id).toBe(PERSONA_IDS.analystAlpha);
    expect(window.localStorage.getItem("laif.admin.persona")).toBe(PERSONA_IDS.analystAlpha);
    expect(screen.getByRole("note").textContent).toContain("Demo role switch — not authentication");
    expect(await screen.findByTestId("overview-page")).toBeTruthy();
    expect(await screen.findByTestId("kpi-strip", {}, { timeout: 10_000 })).toBeTruthy();
    expect(screen.getByTestId("scope-strip").textContent).toContain("Viewing aggregate data");
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    expect(within(nav).getByRole("link", { name: "Pathway funnel" })).toBeTruthy();
    expect(within(nav).getByRole("link", { name: "Settings" })).toBeTruthy();
    expect(within(nav).getByText("Govern")).toBeTruthy();
    const state = await services.repo.demo.getDemoState();
    expect(state.datasetHash).toBe(
      computeDatasetHash(datasetToRecords(sliceForApp(createSeed(), APP_ID))),
    );
    // The admin store holds the analytics overlay (base + overlay).
    expect((await services.repo.listAccessGrants()).length).toBe(4);
  });

  it("switches EN → RW, sets <html lang> and keeps RW and the session after a reload", async () => {
    const user = userEvent.setup();
    const first = await signedIn();
    await user.click(screen.getByRole("button", { name: "Ikinyarwanda" }));
    await waitFor(() => expect(screen.getByTestId("demo-banner").textContent).toContain(RW_BANNER));
    expect(document.documentElement.lang).toBe("rw");
    expect(window.localStorage.getItem("laif.admin.language")).toBe("rw");
    first.unmount();

    // "Reload": fresh services read the stored language and the stored demo session.
    const services = await createTestServices(first.store);
    expect(services.session.getState().session?.personaId).toBe(PERSONA_IDS.analystAlpha);
    render(
      <App
        services={services}
        router={createMemoryRouter(routes, { initialEntries: ["/admin/reports"] })}
      />,
    );
    await screen.findByTestId("app-shell", {}, { timeout: 10_000 });
    expect(screen.getByTestId("demo-banner").textContent).toContain(RW_BANNER);
    expect((await screen.findByRole("heading", { level: 1 })).textContent).toBe(
      RW_ADMIN.nav.reports,
    );
  });

  it("Offline shows the OfflineBanner at once; Reset demo restores the seed slice", async () => {
    const user = userEvent.setup();
    // A read-only page: /admin/quality persists detected data-quality issues on load (ADM-06),
    // which would change the dataset hash concurrently with this test.
    const { services, store, router } = await signedIn("/admin/overview");
    const seeded = await services.repo.demo.getDemoState();

    // Programme personas have no clinical writes: change the local dataset directly.
    await store.delete("patients", SEED_ANCHORS.WF01_FLAGGED_REVIEW.patientId);
    expect((await services.repo.demo.getDemoState()).datasetHash).not.toBe(seeded.datasetHash);

    const trigger = screen.getByRole("button", { name: "Demo tools" });
    await user.click(trigger);
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "Offline" }));
    expect(screen.getByText("You are offline. Changes are saved on this device.")).toBeTruthy();
    await waitFor(async () => expect((await services.repo.demo.getFaults()).offline).toBe(true));

    await user.keyboard("{Escape}");
    await user.click(trigger);
    await user.click(await screen.findByRole("menuitem", { name: "Reset demo" }));
    await screen.findByRole("dialog", { name: "Reset demo data?" });
    await user.click(screen.getByRole("button", { name: "Reset demo" }));
    // ADM-09: Reset demo returns to the sign-in with "Demo data restored".
    await screen.findByText("Demo data restored");
    await waitFor(() => expect(router.state.location.pathname).toBe("/admin/login"));

    const after = await services.repo.demo.getDemoState();
    expect(after.datasetHash).toBe(seeded.datasetHash);
    expect((await services.repo.demo.getFaults()).offline).toBe(false);
    await waitFor(() =>
      expect(screen.queryByText("You are offline. Changes are saved on this device.")).toBeNull(),
    );
    // ADM-09: the session ends with the reset (no `session.ended`: audit = baseline + demo.reset).
    expect(services.session.getState().session).toBeNull();
    expect(await auditEvents(store, "session.ended")).toHaveLength(0);
    expect(await auditEvents(store, "demo.reset")).toHaveLength(1);
  });

  it("renders NotFound inside the shell for unknown routes", async () => {
    await signedIn("/admin/does-not-exist");
    expect(screen.getByTestId("demo-banner")).toBeTruthy();
    expect(screen.getByRole("note")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Page not found" })).toBeTruthy();
  });

  it("facility manager: Governance nav item is locked and /admin/governance is a 403 + audit", async () => {
    const { services, store, router } = await bootApp({
      path: "/admin/governance",
      signInAs: PERSONA_IDS.fmgrAlpha1,
      waitFor: "app-shell",
    });
    await screen.findByTestId("forbidden-page");
    expect(
      screen.getByRole("heading", { level: 1, name: "Outside your authorised scope" }),
    ).toBeTruthy();
    expect(router.state.location.pathname).toBe("/admin/governance");
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    expect(within(nav).queryByRole("link", { name: /Governance/ })).toBeNull();
    const locked = within(nav).getByText("Governance").closest("[aria-disabled='true']");
    expect(locked?.getAttribute("title")).toBe("Not available for your demo role");
    expect(locked?.querySelector("svg")).toBeTruthy();
    // Banners + language switch on the 403 page.
    expect(screen.getByTestId("demo-banner")).toBeTruthy();
    expect(screen.getByRole("note")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ikinyarwanda" })).toBeTruthy();
    const correlationId = services.session.getState().session?.correlationId;
    await waitFor(async () =>
      expect(
        (await auditEvents(store, "access.denied")).filter(
          (e) => e.correlationId === correlationId,
        ),
      ).toHaveLength(1),
    );
    const [event] = (await auditEvents(store, "access.denied")).filter(
      (e) => e.correlationId === correlationId,
    );
    expect(event).toMatchObject({
      actorId: PERSONA_IDS.fmgrAlpha1,
      actorRole: "facility_manager",
      outcome: "denied",
      entityId: "/admin/governance",
      facilityId: null,
      changeSummary: { reason: "ROLE", grant: "grant-persona-fmgr-alpha1" },
    });
  });

  it("End session emits session.ended and returns to the sign-in", async () => {
    const user = userEvent.setup();
    const { services, store, router } = await signedIn();
    const correlationId = services.session.getState().session?.correlationId;
    await user.click(screen.getByRole("button", { name: /Switch demo persona/ }));
    await user.click(await screen.findByRole("menuitem", { name: "End session" }));
    await screen.findByRole("heading", { level: 1, name: "Demo sign-in" });
    expect(router.state.location.pathname).toBe("/admin/login");
    expect(services.session.getState().session).toBeNull();
    const ended = (await auditEvents(store, "session.ended")).filter(
      (e) => e.correlationId === correlationId,
    );
    expect(ended).toHaveLength(1);
    expect(
      (await auditEvents(store, "session.started")).some((e) => e.correlationId === correlationId),
    ).toBe(true);
  });

  it("shows an ErrorState with Reset demo when seeding fails", async () => {
    const store = createMemoryStoreAdapter();
    const broken: StoreAdapter = {
      ...store,
      transaction: () => Promise.reject(new Error("disk full")),
    };
    const services = await createTestServices(broken);
    render(
      <App
        services={services}
        router={createMemoryRouter(routes, { initialEntries: ["/admin/overview"] })}
      />,
    );
    expect(await screen.findByText("The demo data could not be prepared")).toBeTruthy();
    expect(screen.getByTestId("demo-banner")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reset demo" })).toBeTruthy();
  });

  it("the 403 copy is in Kinyarwanda after switching language", async () => {
    const user = userEvent.setup();
    await bootApp({
      path: "/admin/overview?district=dist-beta",
      signInAs: PERSONA_IDS.analystAlpha,
      waitFor: "forbidden-page",
    });
    await user.click(screen.getByRole("button", { name: "Ikinyarwanda" }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
        RW_ADMIN.errors.forbidden.title,
      ),
    );
  });
});
