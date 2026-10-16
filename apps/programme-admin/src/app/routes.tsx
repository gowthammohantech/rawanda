/**
 * `/admin/*` route tree (tech spec §2.3) with placeholder pages; ADM phases replace the
 * placeholders in place. `/` and `/admin` → `/admin/overview`; anything else → NotFound,
 * always inside the shell (DemoBanner + EN/RW switcher on every route).
 */
import { Navigate, type RouteObject } from "react-router";

import { BASE_PATH, START_PATH } from "./config.ts";
import { paths } from "./nav.ts";
import { NotFoundPage } from "./pages/NotFoundPage.tsx";
import { PlaceholderPage } from "./pages/PlaceholderPage.tsx";
import { RouteErrorPage } from "./pages/RouteErrorPage.tsx";
import { ShellLayout } from "./ShellLayout.tsx";

export const routes: RouteObject[] = [
  { path: "/", element: <Navigate to={START_PATH} replace /> },
  {
    element: <ShellLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { path: BASE_PATH, element: <Navigate to={START_PATH} replace /> },
      {
        path: paths.overview,
        element: <PlaceholderPage titleKey="admin:nav.overview" phase="ADM-02" />,
      },
      {
        path: paths.funnel,
        element: <PlaceholderPage titleKey="admin:nav.funnel" phase="ADM-03" />,
      },
      {
        path: paths.timeliness,
        element: <PlaceholderPage titleKey="admin:nav.timeliness" phase="ADM-04" />,
      },
      {
        path: paths.workload,
        element: <PlaceholderPage titleKey="admin:nav.workload" phase="ADM-05" />,
      },
      {
        path: paths.quality,
        element: <PlaceholderPage titleKey="admin:nav.quality" phase="ADM-06" />,
      },
      {
        path: paths.reports,
        element: <PlaceholderPage titleKey="admin:nav.reports" phase="ADM-07" />,
      },
      {
        path: paths.governance,
        element: <PlaceholderPage titleKey="admin:nav.governance" phase="ADM-08" />,
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];
