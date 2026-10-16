/**
 * FND-11 smoke test: the clinical shell boots on a memory-adapter repository (injected through
 * the services the providers receive), shows the DEMONSTRATION banner, switches EN → RW with
 * persistence and `<html lang>`, drives the demo tools and survives an unknown route.
 */
import { createI18n, enResources, rwResources } from "@laif/i18n";
import { createWebLanguageStorage } from "@laif/i18n/web";
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

import { App } from "./App.tsx";
import { APP_ID } from "./config.ts";
import { createAppRepository } from "./repository.ts";
import { routes } from "./routes.tsx";
import { createAppQueryClient, type AppServices } from "./services.ts";
import { createAppSession } from "./session.ts";

const EN_BANNER = enResources.demo.banner;
const RW_BANNER = (rwResources.demo as { banner: string }).banner;

async function renderApp(
  path = "/clinical/login",
  store: StoreAdapter = createMemoryStoreAdapter(),
) {
  const i18n = await createI18n({ appId: APP_ID, storage: createWebLanguageStorage(APP_ID) });
  const session = createAppSession();
  const services: AppServices = {
    i18n,
    session,
    repo: createAppRepository({ session, store, noLatency: true }),
    queryClient: createAppQueryClient(),
  };
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const view = render(<App services={services} router={router} />);
  await screen.findByTestId("app-shell", {}, { timeout: 10_000 });
  return { ...view, services, router, store };
}

describe("clinical-web shell", () => {
  it("boots seeded with the banner, role banner and the default clinician persona", async () => {
    const { services } = await renderApp();
    expect(screen.getByTestId("demo-banner").textContent).toContain(EN_BANNER);
    expect(services.session.current()?.id).toBe(PERSONA_IDS.clinAlpha1);
    expect(window.localStorage.getItem("laif.clinical.persona")).toBe(PERSONA_IDS.clinAlpha1);
    expect(screen.getByRole("note").textContent).toContain("Demo role switch — not authentication");
    expect(screen.getByRole("heading", { level: 1, name: "Demo access" })).toBeTruthy();
    expect(screen.getByText("Built in CLN-01")).toBeTruthy();
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    // WORK › Review queue carries the pending-review count badge.
    const pending = (await services.repo.countReviews()).pending;
    expect(pending).toBeGreaterThan(0);
    await waitFor(() =>
      expect(within(nav).getByRole("link", { name: /Review queue/ }).textContent).toContain(
        String(pending),
      ),
    );
    expect(within(nav).getByText("Oversight")).toBeTruthy();
    const state = await services.repo.demo.getDemoState();
    expect(state.datasetHash).toBe(
      computeDatasetHash(datasetToRecords(sliceForApp(createSeed(), APP_ID))),
    );
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
    expect(screen.getByText("You are offline. Changes are saved on this device.")).toBeTruthy();
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
      expect(screen.queryByText("You are offline. Changes are saved on this device.")).toBeNull(),
    );
  });

  it("renders NotFound inside the shell for unknown routes", async () => {
    await renderApp("/clinical/does-not-exist");
    expect(screen.getByTestId("demo-banner")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Page not found" })).toBeTruthy();
  });

  it("redirects / to /clinical/login", async () => {
    const { router } = await renderApp("/");
    expect(router.state.location.pathname).toBe("/clinical/login");
  });

  it("shows an ErrorState with Reset demo when seeding fails", async () => {
    const store = createMemoryStoreAdapter();
    const broken: StoreAdapter = {
      ...store,
      transaction: () => Promise.reject(new Error("disk full")),
    };
    const i18n = await createI18n({ appId: APP_ID, storage: createWebLanguageStorage(APP_ID) });
    const session = createAppSession();
    render(
      <App
        services={{
          i18n,
          session,
          repo: createAppRepository({ session, store: broken, noLatency: true }),
          queryClient: createAppQueryClient(),
        }}
        router={createMemoryRouter(routes, { initialEntries: ["/clinical/login"] })}
      />,
    );
    expect(await screen.findByText("The demo data could not be prepared")).toBeTruthy();
    expect(screen.getByTestId("demo-banner")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reset demo" })).toBeTruthy();
  });
});
