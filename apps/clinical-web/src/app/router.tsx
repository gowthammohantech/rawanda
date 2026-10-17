/**
 * The clinical data router (CLN-01): every spec §2.1 route + `/clinical/settings`. `/` and
 * `/clinical` → the review queue (or the demo sign-in when there is no session); every screen
 * sits behind `RequireSession` (no session → `/clinical/login?redirect=…`) and its route
 * capability (`RequireCapability`, audited denial). Unknown paths → NotFound inside the shell.
 * Later CLN phases replace the placeholder pages in place.
 */
import type { ReactNode } from "react";
import { createBrowserRouter, Navigate, type RouteObject } from "react-router";

import { ClinicalShell } from "../components/shell/ClinicalShell.tsx";
import { AuditPage } from "../features/audit/AuditPage.tsx";
import { LoginPage } from "../features/login/LoginPage.tsx";
import { PatientPage } from "../features/patients/PatientPage.tsx";
import { PatientSearchPage } from "../features/patients/PatientSearchPage.tsx";
import { QueuePage } from "../features/queue/QueuePage.tsx";
import { ReferralsPage } from "../features/referrals/ReferralsPage.tsx";
import { DecisionPage } from "../features/reviews/DecisionPage.tsx";
import { ReviewPage } from "../features/reviews/ReviewPage.tsx";
import { SettingsPage } from "../features/settings/SettingsPage.tsx";
import { TasksPage } from "../features/tasks/TasksPage.tsx";
import { ROUTE_CAPABILITY } from "../session/capabilities.ts";
import { RequireCapability } from "../session/RequireCapability.tsx";
import { RequireSession } from "../session/RequireSession.tsx";
import { BASE_PATH } from "./config.ts";
import { NotFoundPage } from "./pages/NotFoundPage.tsx";
import { RouteErrorPage } from "./pages/RouteErrorPage.tsx";
import { HOME_PATH, ROUTE_PATTERNS, type ClinicalRouteId } from "./routes.ts";

function screen(id: ClinicalRouteId, element: ReactNode): RouteObject {
  const cap = ROUTE_CAPABILITY[id];
  return {
    path: ROUTE_PATTERNS[id],
    element: cap === null ? element : <RequireCapability cap={cap}>{element}</RequireCapability>,
  };
}

export const appRoutes: RouteObject[] = [
  {
    errorElement: <RouteErrorPage />,
    children: [
      { path: "/", element: <Navigate to={BASE_PATH} replace /> },
      { path: ROUTE_PATTERNS.login, element: <LoginPage /> },
      {
        element: (
          <RequireSession>
            <ClinicalShell />
          </RequireSession>
        ),
        children: [
          { path: BASE_PATH, element: <Navigate to={HOME_PATH} replace /> },
          screen("queue", <QueuePage />),
          screen("patients", <PatientSearchPage />),
          screen("patient", <PatientPage />),
          screen("review", <ReviewPage />),
          screen("decision", <DecisionPage />),
          screen("referrals", <ReferralsPage />),
          screen("tasks", <TasksPage />),
          screen("audit", <AuditPage />),
          screen("settings", <SettingsPage />),
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
];

export function createAppRouter(): ReturnType<typeof createBrowserRouter> {
  return createBrowserRouter(appRoutes);
}
