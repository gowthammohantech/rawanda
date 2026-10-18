/**
 * CTZ-09 task 12 + tasks 1/3: every leaf route under `app/` (completeness-checked) renders the
 * DEMONSTRATION banner as the FIRST thing on screen, in EN and RW, for each walk persona — and
 * on every route each pressable has a role, an accessible name and a ≥ 44 × 44 target, each
 * selectable control exposes its checked / selected state, and the screen has a header.
 */
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { enResources, rwResources, type Language } from "@laif/i18n";
import { expectAllTouchTargets, walkAllRoutes } from "@laif/test-utils/native";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { REDIRECT_ONLY_ROUTES, ROUTE_CASES, routesFor, WALK_PERSONAS } from "../../test/routes.tsx";
import { renderRoute } from "../../test/walk.tsx";

vi.mock("expo-router", () => import("../../test/router-stub.tsx"));

const BANNER: Record<Language, string> = {
  en: enResources.demo.banner,
  rw: (rwResources.demo as { banner: string }).banner,
};

const APP_DIR = join(import.meta.dirname, "../../../app");

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return routeFiles(path);
    if (!name.endsWith(".tsx") || name === "_layout.tsx") return [];
    return [relative(APP_DIR, path).replace(/\.tsx$/u, "")];
  });
}

describe("route table", () => {
  it("covers every leaf route file under app/", () => {
    expect([...ROUTE_CASES.map((r) => r.route), ...REDIRECT_ONLY_ROUTES].sort()).toEqual(
      routeFiles(APP_DIR).sort(),
    );
  });
});

describe.each(["en", "rw"] as const)("route walk (%s)", (language) => {
  it.each(WALK_PERSONAS)(
    "%s: DemoBanner first, header, labelled ≥ 44pt pressables, exposed states",
    async (walkPersona) => {
      const visited = await walkAllRoutes(routesFor(walkPersona), async (route) => {
        const view = await renderRoute(route, walkPersona, { language });
        const screenRoot =
          view.container.querySelector('[data-testid$="-screen"], [data-testid="screen"]') ??
          view.container;
        // DemoBanner: present, and the first text of the screen.
        const banner = screen.getByText(BANNER[language]);
        expect(banner, route.route).toBeTruthy();
        expect(
          (screenRoot.textContent ?? "").trimStart().startsWith(BANNER[language]),
          route.route,
        ).toBe(true);
        expect(screen.queryAllByRole("heading").length, `${route.route} header`).toBeGreaterThan(0);
        expect(expectAllTouchTargets(view.container), route.route).toBeGreaterThan(0);
        for (const el of view.container.querySelectorAll(
          '[role="switch"], [role="checkbox"], [role="radio"]',
        )) {
          expect(
            el.getAttribute("aria-checked"),
            `${route.route}: state of ${el.getAttribute("aria-label") ?? el.textContent}`,
          ).toMatch(/^(true|false|mixed)$/u);
        }
        for (const el of view.container.querySelectorAll('[role="tab"]')) {
          expect(el.getAttribute("aria-selected"), `${route.route}: tab state`).toMatch(
            /^(true|false)$/u,
          );
        }
        // No raw i18n keys reach the screen.
        expect(view.container.textContent ?? "", route.route).not.toMatch(
          /\b(citizen|common|shell|demo|domain):[a-zA-Z]+\./u,
        );
      });
      expect(visited.length).toBeGreaterThan(20);
    },
    120_000,
  );
});
