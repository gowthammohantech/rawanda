/**
 * Route guard (CLN-01 task 6): no demo session → `/clinical/login?redirect=<path + query>`.
 * Visiting `/` or `/clinical` without a session goes to the plain login page.
 */
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";

import { BASE_PATH } from "../app/config.ts";
import { routes } from "../app/routes.ts";
import { useSession } from "./useSession.ts";

export function RequireSession({ children }: { children?: ReactNode }) {
  const { state } = useSession();
  const location = useLocation();
  if (state !== null) return <>{children}</>;
  const target = `${location.pathname}${location.search}`;
  const isRoot = location.pathname === "/" || location.pathname.replace(/\/$/u, "") === BASE_PATH;
  return <Navigate to={isRoot ? routes.login() : routes.login(target)} replace />;
}
