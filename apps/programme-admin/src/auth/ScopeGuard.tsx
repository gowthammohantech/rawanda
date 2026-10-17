/**
 * ScopeGuard (ADM-01 task 6): validates the URL scope (`?district`, `?facility`) against the
 * signed-in persona's AccessGrant BEFORE any guarded child mounts — no metric query runs for an
 * out-of-scope request.
 * - unknown id → the 404 page (in place);
 * - known id outside the grant → `ForbiddenPage` in place (URL kept) + one `access.denied`.
 */
import type { ReactNode } from "react";
import { Outlet, useLocation } from "react-router";

import { useAdminSession } from "../app/providers.tsx";
import { ForbiddenPage } from "../routes/errors/ForbiddenPage.tsx";
import { NotFoundPage } from "../routes/errors/NotFoundPage.tsx";
import { checkScopeRequest, resolveScopeFromSearch, type ScopeCheck } from "./scope.ts";
import { useDeniedAudit } from "./useDeniedAudit.ts";

export type ScopeGuardProps = {
  /** Guarded content; defaults to the nested routes (`<Outlet />`). */
  children?: ReactNode;
};

export function ScopeGuard({ children }: ScopeGuardProps) {
  const location = useLocation();
  const persona = useAdminSession((s) => s.persona);
  const grant = useAdminSession((s) => s.grant);
  const request = resolveScopeFromSearch(location.search);
  const check: ScopeCheck =
    persona === null ? { status: "ok" } : checkScopeRequest(persona, grant, request);

  useDeniedAudit(
    check.status === "forbidden"
      ? {
          pathname: location.pathname,
          search: location.search,
          reason: "SCOPE",
          resource: { kind: check.kind, id: check.id },
          requested: { district: request.districtId, facility: request.facilityId },
        }
      : null,
  );

  if (check.status === "not_found") return <NotFoundPage variant="unknownScope" />;
  if (check.status === "forbidden") {
    return <ForbiddenPage denial={{ reason: "SCOPE", kind: check.kind, id: check.id }} />;
  }
  return <>{children ?? <Outlet />}</>;
}
