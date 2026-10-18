/**
 * RequireSession (ADM-01): every `/admin/*` route except the sign-in. Without a session it
 * redirects to `/admin/login?next=<encoded path+search>`. With one, it re-validates the session's
 * AccessGrant on every navigation (grant edits bump `version`; a removed grant ends the session).
 * ADM-09: an expired session ("Expire session now") redirects on the next navigation or failed
 * call to `/admin/login?next=<path+search>&expired=1`.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router";

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
  const expiryNoticed = useAdminSession((s) => s.expiryNoticed);
  const navigate = useNavigate();
  const expired = session?.expired === true;
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
    const current = store.getState().session;
    // ADM-09: the first navigation after "Expire session now" ends the session.
    if (current?.expired === true) store.noticeExpiry();
    else if (current !== null) void refetch();
  }, [location.key, refetch, store]);

  // ADM-09 (T-09): expired + noticed (navigation or a failed call) → sign-in with `next` = this
  // view (path + filters) and the "session expired" notice; drafts stay in sessionStorage.
  useEffect(() => {
    if (!expired || !expiryNoticed) return;
    const personaId = store.getState().session?.personaId;
    // The sign-in page ends the expired session (signing out here would re-render this guard
    // first and redirect without the notice and the persona).
    void navigate(
      loginPathFor(`${location.pathname}${location.search}`, personaId, { expired: true }),
      { replace: true },
    );
  }, [expired, expiryNoticed, navigate, location.pathname, location.search, store]);

  useEffect(() => {
    if (grants.data === undefined) return;
    // ADM-08: an edited grant of the signed-in persona (new version) refreshes every admin view
    // (`adminKeys.all`; the scoped keys carry `grantId@version`, so no stale numbers survive).
    if (store.revalidate(grants.data, clock.nowIso()) === "updated") {
      void queryClient.invalidateQueries({ queryKey: adminKeys.all });
    }
  }, [grants.data, store, clock, queryClient]);

  if (expired && expiryNoticed) return null;
  if (session === null) {
    return <Navigate to={loginPathFor(`${location.pathname}${location.search}`)} replace />;
  }
  return <Outlet />;
}
