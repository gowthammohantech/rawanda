/**
 * FND-11 / CLN-01 app tests: boots on a memory-adapter repository, DEMONSTRATION banner on
 * every route, no session → demo sign-in (with `?redirect=`), every spec §2.1 route resolves
 * once signed in, EN → RW with persistence and `<html lang>`, demo tools, NotFound, seed failure.
 */
import { createI18n, enResources, rwResources } from "@laif/i18n";
import { createWebLanguageStorage } from "@laif/i18n/web";
import { createSeed, FACILITY_IDS, PERSONA_IDS, SEED_ANCHORS, sliceForApp } from "@laif/mock-data";
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

import { createAppSession, FACILITY_STORAGE_KEY } from "../session/session-store.ts";
import { renderApp as renderTestApp } from "../test/render-app.tsx";
import { App } from "./App.tsx";
import { APP_ID } from "./config.ts";
import { createAppRepository } from "../data/repository.ts";
import { appRoutes } from "./router.tsx";
import { routes } from "./routes.ts";
import { createAppQueryClient } from "./services.ts";

const EN_BANNER = enResources.demo.banner;
const RW_BANNER = (rwResources.demo as { banner: string }).banner;
const CLINICIAN = { personaId: PERSONA_IDS.clinAlpha1, facilityId: FACILITY_IDS.alpha1 };

async function renderApp(
  path = "/clinical/queue",
  store: StoreAdapter = createMemoryStoreAdapter(),
) {
  return renderTestApp({ path, store, signIn: CLINICIAN });
}

describe("clinical-web shell", () => {
  it("boots seeded with the banner, role banner and the signed-in clinician", async () => {
    const { services } = await renderApp();
    expect(screen.getByTestId("demo-banner").textContent).toContain(EN_BANNER);
    expect(services.session.current()?.id).toBe(PERSONA_IDS.clinAlpha1);
    expect(window.localStorage.getItem("laif.clinical.persona")).toBe(PERSONA_IDS.clinAlpha1);
    expect(window.localStorage.getItem(FACILITY_STORAGE_KEY)).toBe(FACILITY_IDS.alpha1);
    expect(screen.getByRole("note").textContent).toContain("Demo role switch — not authentication");
    expect(screen.getByRole("heading", { level: 1, name: "Review queue" })).toBeTruthy();
    expect(screen.getByText("Delivered in CLN-05")).toBeTruthy();
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    // WORKSPACE › Review queue carries the pending-review count badge.
    const pending = (await services.repo.countReviews()).pending;
    expect(pending).toBeGreaterThan(0);
    await waitFor(() =>
      expect(within(nav).getByRole("link", { name: /Review queue/ }).textContent).toContain(
        String(pending),
      ),
    );
    const state = await services.repo.demo.getDemoState();
    expect(state.datasetHash).toBe(
      computeDatasetHash(datasetToRecords(sliceForApp(createSeed(), APP_ID))),
    );
  });

  it("without a session redirects /clinical to the plain login page", async () => {
    const { router } = await renderTestApp({ path: "/clinical" });
    expect(router.state.location.pathname).toBe("/clinical/login");
    expect(router.state.location.search).toBe("");
    expect(screen.getByTestId("public-shell")).toBeTruthy();
    expect(screen.getByTestId("demo-banner")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ikinyarwanda" })).toBeTruthy();
  });

  it("without a session redirects a deep link to login with ?redirect= (query preserved)", async () => {
    const { router } = await renderTestApp({ path: "/clinical/patients?q=ab%20c" });
    expect(router.state.location.pathname).toBe("/clinical/login");
    expect(new URLSearchParams(router.state.location.search).get("redirect")).toBe(
      "/clinical/patients?q=ab%20c",
    );
  });

  it("treats a stored session that violates the facility invariant as signed out", async () => {
    window.localStorage.setItem("laif.clinical.persona", PERSONA_IDS.clinAlpha1);
    window.localStorage.setItem(FACILITY_STORAGE_KEY, FACILITY_IDS.beta1);
    const { router } = await renderTestApp({ path: "/clinical/queue" });
    expect(router.state.location.pathname).toBe("/clinical/login");
    expect(window.localStorage.getItem("laif.clinical.persona")).toBeNull();
  });

  it.each([
    [routes.queue(), "Review queue"],
    [routes.patients(), "Patients"],
    [routes.patient("pat-1"), "Patient overview"],
    [routes.review("rev-1"), "Review detail"],
    [routes.decision("rev-1"), "Record decision"],
    [routes.referrals(), "Referrals"],
    [routes.tasks(), "Care-team tasks"],
    [routes.audit(), "Audit"],
    [routes.settings(), "Settings"],
  ])("resolves %s once signed in", async (path, title) => {
    await renderApp(path);
    expect(screen.getByRole("heading", { level: 1, name: title })).toBeTruthy();
    expect(screen.getByTestId("demo-banner")).toBeTruthy();
    expect(screen.getByRole("note").textContent).toContain("not authentication");
    expect(screen.getByRole("group", { name: /Language/ })).toBeTruthy();
    expect(document.title).toBe(`${title} · CareConnect Clinical Portal (Demo)`);
  });

  it("switches EN → RW, sets <html lang> and keeps RW after a reload", async () => {
    const user = userEvent.setup();
    const first = await renderApp();
    await user.click(screen.getByRole("button", { name: "Ikinyarwanda" }));
    await waitFor(() => expect(screen.getByTestId("demo-banner").textContent).toContain(RW_BANNER));
    expect(document.documentElement.lang).toBe("rw");
    expect(window.localStorage.getItem("laif.clinical.language")).toBe("rw");
    first.unmount();

    // "Reload": a fresh boot reads the stored preference before the first render.
    await renderApp("/clinical/queue", first.store);
    expect(screen.getByTestId("demo-banner").textContent).toContain(RW_BANNER);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      (rwResources.clinical as { nav: { queue: string } }).nav.queue,
    );
  });

  it("Offline shows the OfflineBanner at once; Reset demo restores the seed slice", async () => {
    const user = userEvent.setup();
    const { services } = await renderApp("/clinical/queue");
    const seeded = await services.repo.demo.getDemoState();

    const review = SEED_ANCHORS.WF01_FLAGGED_REVIEW.reviewId;
    await services.repo.startReview({ reviewId: review, expectedVersion: 1 }, crypto.randomUUID());
    expect((await services.repo.demo.getDemoState()).datasetHash).not.toBe(seeded.datasetHash);

    const trigger = screen.getByRole("button", { name: "Demo tools" });
    await user.click(trigger);
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "Offline" }));
    expect(screen.getByText("Simulated offline — changes cannot be saved")).toBeTruthy();
    await waitFor(async () => expect((await services.repo.demo.getFaults()).offline).toBe(true));

    await user.keyboard("{Escape}");
    await user.click(trigger);
    await user.click(await screen.findByRole("menuitem", { name: "Reset demo" }));
    await screen.findByRole("dialog", { name: "Reset demo data?" });
    await user.click(screen.getByRole("button", { name: "Reset demo" }));
    await screen.findByText("Demo data was reset to the baseline.");

    const after = await services.repo.demo.getDemoState();
    expect(after.datasetHash).toBe(seeded.datasetHash);
    expect((await services.repo.demo.getFaults()).offline).toBe(false);
    await waitFor(() =>
      expect(screen.queryByText("Simulated offline — changes cannot be saved")).toBeNull(),
    );
  });

  it("renders NotFound inside the shell for unknown routes", async () => {
    await renderApp("/clinical/does-not-exist");
    expect(screen.getByTestId("demo-banner")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Page not found" })).toBeTruthy();
  });

  it("redirects / to /clinical/login without a session and to the queue with one", async () => {
    const anonymous = await renderTestApp({ path: "/" });
    expect(anonymous.router.state.location.pathname).toBe("/clinical/login");
    anonymous.unmount();
    const { router } = await renderApp("/");
    expect(router.state.location.pathname).toBe("/clinical/queue");
  });

  it("shows an ErrorState with Reset demo when seeding fails", async () => {
    const store = createMemoryStoreAdapter();
    const broken: StoreAdapter = {
      ...store,
      transaction: () => Promise.reject(new Error("disk full")),
    };
    const i18n = await createI18n({ appId: APP_ID, storage: createWebLanguageStorage(APP_ID) });
    const session = createAppSession();
    session.signIn(CLINICIAN.personaId, CLINICIAN.facilityId);
    render(
      <App
        services={{
          i18n,
          session,
          repo: createAppRepository({ session, store: broken, noLatency: true }),
          queryClient: createAppQueryClient(),
        }}
        router={createMemoryRouter(appRoutes, { initialEntries: ["/clinical/queue"] })}
      />,
    );
    expect(await screen.findByText("The demo data could not be prepared")).toBeTruthy();
    expect(screen.getByTestId("demo-banner")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reset demo" })).toBeTruthy();
  });
});
