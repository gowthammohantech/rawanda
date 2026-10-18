/**
 * RequireSession (ADM-01): every `/admin/*` route except the sign-in. Without a session it
 * redirects to `/admin/login?next=<encoded path+search>`. With one, it re-validates the session's
 * AccessGrant on every navigation (grant edits bump `version`; a removed grant ends the session).
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Navigate, Outlet, useLocation } from "react-router";

import { useAdminSession, useRepository, useServices, useSessionStore } from "../app/providers.tsx";
import { adminKeys } from "../lib/queryKeys.ts";
import { loginPathFor } from "./signIn.ts";

/** `adminKeys.grants()` (ADM-08 grant table + session re-validation share it). */
export const ACCESS_GRANTS_QUERY_KEY = adminKeys.grants();

export function RequireSession() {
  const location = useLocation();
  const repo = useRepository();
  const store = useSessionStore();
  const { clock } = useServices();
  const queryClient = useQueryClient();
  const session = useAdminSession((s) => s.session);
  const grants = useQuery({
    queryKey: ACCESS_GRANTS_QUERY_KEY,
    queryFn: () => repo.listAccessGrants(),
    enabled: session !== null,
    staleTime: 0,
  });
  const { refetch } = grants;

  // Re-validate on every navigation after the first render (the query itself covers that one).
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (store.getState().session !== null) void refetch();
  }, [location.key, refetch, store]);

  useEffect(() => {
    if (grants.data === undefined) return;
    // ADM-08: an edited grant of the signed-in persona (new version) refreshes every admin view
    // (`adminKeys.all`; the scoped keys carry `grantId@version`, so no stale numbers survive).
    if (store.revalidate(grants.data, clock.nowIso()) === "updated") {
      void queryClient.invalidateQueries({ queryKey: adminKeys.all });
    }
  }, [grants.data, store, clock, queryClient]);

  if (session === null) {
    return <Navigate to={loginPathFor(`${location.pathname}${location.search}`)} replace />;
  }
  return <Outlet />;
}
