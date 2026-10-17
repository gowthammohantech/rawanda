/**
 * Route guard (CLN-01 task 7): without the capability the route stays in the URL and renders
 * `PermissionDenied`; one `access.denied` audit event is recorded per mount and denied
 * route/persona/facility (StrictMode-safe ref guard — the double effect run records once).
 */
import { useEffect, useRef, type ReactNode } from "react";
import { useLocation } from "react-router";

import { useRepository } from "../app/providers.tsx";
import { PermissionDenied } from "../components/PermissionDenied.tsx";
import type { ClinicalCapability } from "./capabilities.ts";
import { recordRouteDenied } from "./session-audit.ts";
import { useSession } from "./useSession.ts";

export type RequireCapabilityProps = {
  cap: ClinicalCapability;
  children?: ReactNode;
};

export function RequireCapability({ cap, children }: RequireCapabilityProps) {
  const { state, can } = useSession();
  const repo = useRepository();
  const { pathname } = useLocation();
  const allowed = can(cap);
  const recorded = useRef<string | null>(null);

  const denialKey =
    allowed || state === null
      ? null
      : `${pathname}|${cap}|${state.persona.id}|${state.activeFacilityId}`;

  useEffect(() => {
    if (denialKey === null || state === null || recorded.current === denialKey) return;
    recorded.current = denialKey;
    void recordRouteDenied(repo, state, pathname, cap, "ROLE");
  }, [denialKey, state, repo, pathname, cap]);

  if (state === null) return null; // RequireSession redirects
  if (!allowed) return <PermissionDenied capability={cap} />;
  return <>{children}</>;
}
