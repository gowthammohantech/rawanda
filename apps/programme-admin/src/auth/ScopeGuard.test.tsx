/**
 * ScopeGuard (ADM-01 §10): 403 rendered in place, exactly one `access.denied` per denied
 * navigation (React StrictMode included), guarded children never mounted, unknown id → 404.
 */
import { DISTRICT_IDS, PERSONA_IDS } from "@laif/mock-data";
import { act, render, screen, waitFor } from "@testing-library/react";
import { StrictMode, useEffect } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { AppProviders } from "../app/providers.tsx";
import { auditEvents, bootApp, createTestServices, signIn } from "../test/app.tsx";
import { ScopeGuard } from "./ScopeGuard.tsx";

const BETA = `/admin/overview?district=${DISTRICT_IDS.beta}`;

describe("ScopeGuard", () => {
  it("renders the 403 page in place, keeps the URL and never mounts the guarded child", async () => {
    const { router } = await bootApp({
      path: BETA,
      signInAs: PERSONA_IDS.analystAlpha,
      strict: true,
      waitFor: "forbidden-page",
    });
    expect(screen.getByText("403 · Outside your authorised scope")).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 1, name: "Outside your authorised scope" }),
    ).toBeTruthy();
    expect(screen.getByText(/District: Demo District Beta/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to my scope" }).getAttribute("href")).toBe(
      `/admin/overview?district=${DISTRICT_IDS.alpha}`,
    );
    expect(screen.getByRole("button", { name: "Switch demo persona" })).toBeTruthy();
    expect(router.state.location.pathname + router.state.location.search).toBe(BETA);
    // The overview placeholder (and its scope strip) is not mounted.
    expect(screen.queryByText("Coming in ADM-02")).toBeNull();
    expect(screen.queryByTestId("scope-strip")).toBeNull();
  });

  it("emits exactly one access.denied per denied navigation under StrictMode", async () => {
    const { store, router, services } = await bootApp({
      path: BETA,
      signInAs: PERSONA_IDS.analystAlpha,
      strict: true,
      waitFor: "forbidden-page",
    });
    const correlationId = services.session.getState().session?.correlationId;
    const mine = async () =>
      (await auditEvents(store, "access.denied")).filter((e) => e.correlationId === correlationId);
    await waitFor(async () => expect(await mine()).toHaveLength(1));
    // Re-renders / settling do not add events.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await mine()).toHaveLength(1);
    expect((await mine())[0]).toMatchObject({
      action: "access.denied",
      actorId: PERSONA_IDS.analystAlpha,
      actorRole: "district_analyst",
      outcome: "denied",
      category: "access",
      entityType: "district",
      entityId: "/admin/overview",
      facilityId: null,
      districtId: null,
      correlationId,
      changeSummary: {
        requested: { district: DISTRICT_IDS.beta, facility: null },
        grant: "grant-persona-analyst-alpha",
        reason: "SCOPE",
      },
    });

    // Navigate inside the scope, then back: the same history entry → no new event.
    await act(() => router.navigate(`/admin/overview?district=${DISTRICT_IDS.alpha}`));
    await screen.findByText("Coming in ADM-02");
    await act(() => router.navigate(-1));
    await screen.findByTestId("forbidden-page");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await mine()).toHaveLength(1);

    // A new navigation to the denied URL is a new denied navigation.
    await act(() => router.navigate(BETA));
    await waitFor(async () => expect(await mine()).toHaveLength(2));
  });

  it("does not mount guarded children for out-of-scope or unknown ids (unit)", async () => {
    const mounted = vi.fn();
    await renderGuardUnit(`/admin/overview?district=${DISTRICT_IDS.beta}`, mounted);
    await screen.findByTestId("forbidden-page");
    expect(mounted).not.toHaveBeenCalled();
    expect(screen.queryByText("guarded metrics")).toBeNull();
  });

  it("unknown district id renders the 404 page", async () => {
    const mounted = vi.fn();
    await renderGuardUnit("/admin/overview?district=dist-gamma", mounted);
    await screen.findByRole("heading", { level: 1, name: "Not found" });
    expect(mounted).not.toHaveBeenCalled();
  });

  it("mounts the guarded child inside the grant", async () => {
    const mounted = vi.fn();
    await renderGuardUnit(`/admin/overview?district=${DISTRICT_IDS.alpha}`, mounted);
    await screen.findByText("guarded metrics");
    expect(mounted).toHaveBeenCalled();
  });
});

async function renderGuardUnit(path: string, onMount: () => void) {
  const services = await createTestServices();
  await signIn(services, PERSONA_IDS.analystAlpha, DISTRICT_IDS.alpha);
  function Probe() {
    useEffect(onMount, []);
    return <p>guarded metrics</p>;
  }
  const router = createMemoryRouter(
    [{ element: <ScopeGuard />, children: [{ path: "/admin/overview", element: <Probe /> }] }],
    { initialEntries: [path] },
  );
  render(
    <StrictMode>
      <AppProviders services={services}>
        <RouterProvider router={router} />
      </AppProviders>
    </StrictMode>,
  );
  return { services, router };
}
