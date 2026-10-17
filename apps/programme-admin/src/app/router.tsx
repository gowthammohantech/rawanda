/**
 * `/admin/*` route tree (tech spec §2.3, ADM-01 task 1). `/` and `/admin` → `/admin/overview`.
 * Public: `/admin/login`. Everything else sits inside RequireSession → AdminShell → ScopeGuard,
 * and each page inside `<RequireCapability>`. Unknown paths → NotFound inside the shell. Page
 * modules are `lazy()` so later chart code is split per page.
 */
import { LoadingSkeleton } from "@laif/ui-web";
import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { createBrowserRouter, Navigate, type RouteObject } from "react-router";

import type { AdminRouteId } from "../auth/capabilities.ts";
import { RequireCapability } from "../auth/RequireCapability.tsx";
import { RequireSession } from "../auth/RequireSession.tsx";
import { ScopeGuard } from "../auth/ScopeGuard.tsx";
import { ForbiddenPage } from "../routes/errors/ForbiddenPage.tsx";
import { NotFoundPage } from "../routes/errors/NotFoundPage.tsx";
import { RouteErrorPage } from "../routes/errors/RouteErrorPage.tsx";
import { LoginPage } from "../routes/login/LoginPage.tsx";
import { AdminShell } from "./AdminShell.tsx";
import { BASE_PATH, START_PATH } from "./config.ts";
import { paths } from "./nav.ts";

const page = <M extends Record<string, unknown>>(
  load: () => Promise<M>,
  name: keyof M & string,
): ComponentType => lazy(async () => ({ default: (await load())[name] as ComponentType }));

const OverviewPage = page(() => import("../routes/overview/OverviewPage.tsx"), "OverviewPage");
const FunnelPage = page(() => import("../routes/funnel/FunnelPage.tsx"), "FunnelPage");
const FunnelStagePage = page(
  () => import("../routes/funnel/FunnelStagePage.tsx"),
  "FunnelStagePage",
);
const TimelinessPage = page(
  () => import("../routes/timeliness/TimelinessPage.tsx"),
  "TimelinessPage",
);
const WorkloadPage = page(() => import("../routes/workload/WorkloadPage.tsx"), "WorkloadPage");
const QualityPage = page(() => import("../routes/quality/QualityPage.tsx"), "QualityPage");
const ReportsPage = page(() => import("../routes/reports/ReportsPage.tsx"), "ReportsPage");
const GovernancePage = page(
  () => import("../routes/governance/GovernancePage.tsx"),
  "GovernancePage",
);
const SettingsPage = page(() => import("../routes/settings/SettingsPage.tsx"), "SettingsPage");

function guarded(route: AdminRouteId, Page: ComponentType): ReactNode {
  return (
    <RequireCapability route={route}>
      <Suspense fallback={<LoadingSkeleton variant="card" lines={4} />}>
        <Page />
      </Suspense>
    </RequireCapability>
  );
}

export const routes: RouteObject[] = [
  { path: "/", element: <Navigate to={START_PATH} replace /> },
  {
    errorElement: <RouteErrorPage />,
    children: [
      { path: BASE_PATH, element: <Navigate to={START_PATH} replace /> },
      { path: paths.login, element: <LoginPage /> },
      {
        element: <RequireSession />,
        children: [
          {
            element: <AdminShell />,
            children: [
              {
                element: <ScopeGuard />,
                children: [
                  { path: paths.overview, element: guarded("overview", OverviewPage) },
                  { path: paths.funnel, element: guarded("funnel", FunnelPage) },
                  {
                    path: `${paths.funnel}/:stage`,
                    element: guarded("funnelStage", FunnelStagePage),
                  },
                  { path: paths.timeliness, element: guarded("timeliness", TimelinessPage) },
                  { path: paths.workload, element: guarded("workload", WorkloadPage) },
                  { path: paths.quality, element: guarded("quality", QualityPage) },
                  { path: paths.reports, element: guarded("reports", ReportsPage) },
                  { path: paths.governance, element: guarded("governance", GovernancePage) },
                  { path: paths.settings, element: guarded("settings", SettingsPage) },
                  { path: paths.forbidden, element: <ForbiddenPage /> },
                ],
              },
              { path: "*", element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
];

export function createAppRouter(): ReturnType<typeof createBrowserRouter> {
  return createBrowserRouter(routes);
}
