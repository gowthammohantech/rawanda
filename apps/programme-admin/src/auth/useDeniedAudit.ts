/**
 * Emits `access.denied` ONCE per denied navigation: the key is
 * `makeIdempotencyKey([personaId, pathname, search, location.key, correlationId])`, claimed in
 * the session's once-registry, so StrictMode double effects, re-renders and back/forward to the
 * same history entry never duplicate the event; a new navigation (new `location.key`) does.
 */
import { useToast, useTx } from "@laif/ui-web";
import { useEffect } from "react";
import { useLocation } from "react-router";

import { useServices } from "../app/providers.tsx";
import { emitAccessDenied, type DeniedAccess } from "../lib/audit.ts";
import { makeIdempotencyKey } from "../lib/idempotency.ts";

export function useDeniedAudit(denied: DeniedAccess | null): void {
  const services = useServices();
  const location = useLocation();
  const { toast } = useToast();
  const t = useTx();
  const session = services.session.getState().session;
  const key =
    denied === null || session === null
      ? null
      : makeIdempotencyKey([
          session.personaId,
          denied.pathname,
          denied.search,
          location.key,
          session.correlationId,
        ]);

  useEffect(() => {
    if (key === null || denied === null) return;
    const current = services.session.getState().session;
    if (current === null || !services.session.once.claim(key)) return;
    emitAccessDenied(services.repo, current, denied).catch(() => {
      toast({ title: t("demo:tools.actionFailed"), tone: "danger" });
    });
    // `denied` is described completely by `key`; re-runs are no-ops thanks to `claim`.
  }, [key, denied, services, toast, t]);
}
