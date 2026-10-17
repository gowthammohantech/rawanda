/**
 * Permission-denied state (CLN-01): lock icon, explanation naming the demo role, the "attempt is
 * recorded" hint and a "Switch persona" link (demo sign-in, back to this route afterwards).
 * Never renders any of the requested data.
 */
import { roleLabelKey } from "@laif/auth-demo";
import { PermissionDenied as UiPermissionDenied, useTx } from "@laif/ui-web";
import { Link, useLocation } from "react-router";

import { routes } from "../app/routes.ts";
import type { ClinicalCapability } from "../session/capabilities.ts";
import { useSession } from "../session/useSession.ts";
import { PageHeader } from "./PageHeader.tsx";

export type PermissionDeniedProps = { capability: ClinicalCapability };

export function PermissionDenied({ capability }: PermissionDeniedProps) {
  const t = useTx();
  const { persona } = useSession();
  const location = useLocation();
  const role = persona === null ? "" : t(roleLabelKey(persona.role));
  return (
    <>
      <PageHeader title={t("clinical:errors.permissionDenied.title")} />
      <div data-testid="permission-denied" data-capability={capability}>
        <UiPermissionDenied
          message={t("clinical:errors.permissionDenied.body", { role })}
          action={
            <Link
              to={routes.login(`${location.pathname}${location.search}`)}
              className="text-primary-dark target-min inline-flex items-center text-sm font-semibold underline"
            >
              {t("clinical:errors.permissionDenied.switchPersona")}
            </Link>
          }
        />
      </div>
    </>
  );
}
