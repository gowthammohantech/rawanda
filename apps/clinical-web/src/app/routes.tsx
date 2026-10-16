/**
 * `/clinical/*` route tree (tech spec §2.1) with placeholder pages; CLN phases replace the
 * placeholders in place. `/` and `/clinical` → `/clinical/login`; anything else → NotFound,
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
        path: paths.login,
        element: <PlaceholderPage titleKey="clinical:nav.login" phase="CLN-01" />,
      },
      {
        path: paths.queue,
        element: <PlaceholderPage titleKey="clinical:nav.queue" phase="CLN-05" />,
      },
      {
        path: paths.patients,
        element: <PlaceholderPage titleKey="clinical:nav.patients" phase="CLN-03" />,
      },
      {
        path: `${BASE_PATH}/patients/:id`,
        element: <PlaceholderPage titleKey="clinical:nav.patient" phase="CLN-03" />,
      },
      {
        path: `${BASE_PATH}/reviews/:id`,
        element: <PlaceholderPage titleKey="clinical:nav.review" phase="CLN-06" />,
      },
      {
        path: `${BASE_PATH}/reviews/:id/decision`,
        element: <PlaceholderPage titleKey="clinical:nav.decision" phase="CLN-07" />,
      },
      {
        path: paths.referrals,
        element: <PlaceholderPage titleKey="clinical:nav.referrals" phase="CLN-08" />,
      },
      {
        path: paths.tasks,
        element: <PlaceholderPage titleKey="clinical:nav.tasks" phase="CLN-09" />,
      },
      {
        path: paths.audit,
        element: <PlaceholderPage titleKey="clinical:nav.audit" phase="CLN-10" />,
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];
