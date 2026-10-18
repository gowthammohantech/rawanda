/**
 * `<RequireCapability route>` (ADM-01 task 3): the route itself checks the FND-06 permission —
 * the disabled nav item is only an affordance. Missing → `ForbiddenPage` in place + one
 * `access.denied` (reason ROLE); the guarded page is not mounted.
 */
import type { ReactNode } from "react";
import { useLocation } from "react-router";

import { useAdminSession, useServices } from "../app/providers.tsx";
import { ForbiddenPage } from "../routes/errors/ForbiddenPage.tsx";
import { canOpenRoute, type AdminRouteId } from "./capabilities.ts";
import { resolveScopeFromSearch } from "./scope.ts";
import { useDeniedAudit } from "./useDeniedAudit.ts";

export type RequireCapabilityProps = { route: AdminRouteId; children?: ReactNode };

export function RequireCapability({ route, children }: RequireCapabilityProps) {
  const location = useLocation();
  const { clock } = useServices();
  // Re-render when the persona or its grant changes.
  const persona = useAdminSession((s) => s.persona);
  const grant = useAdminSession((s) => s.grant);
  const decision = canOpenRoute(
    persona === null ? null : { persona, grant },
    route,
    clock.nowIso(),
  );
  const request = resolveScopeFromSearch(location.search);

  useDeniedAudit(
    decision.allowed
      ? null
      : {
          pathname: location.pathname,
          search: location.search,
          reason: "ROLE",
          resource: null,
          requested: { district: request.districtId, facility: request.facilityId },
          permission: decision.permission,
        },
  );

  if (!decision.allowed) {
    return <ForbiddenPage denial={{ reason: "ROLE", permission: decision.permission }} />;
  }
  return <>{children}</>;
}
