/**
 * 403 page rendered IN PLACE (the URL is kept): "403 · Outside your authorised scope", the
 * requested resource, the persona's scope, and "Back to my scope" / "Switch demo persona". It
 * never renders any of the requested data — guarded children are not mounted.
 */
import { permissionLabelKey, type Permission } from "@laif/auth-demo";
import { Button, Card, KeyValueList, MicroLabel, PageHeader, useTx } from "@laif/ui-web";
import { Link, useLocation, useNavigate } from "react-router";

import { NAV_SECTIONS } from "../../app/nav.ts";
import { districtLabel, facilityLabel, grantScopeLabel } from "../../app/persona-labels.ts";
import { useAdminSession, useServices } from "../../app/providers.tsx";
import { endAdminSession, homePathFor, loginPathFor } from "../../auth/signIn.ts";
import { useDocumentTitle } from "../useDocumentTitle.ts";

export type ForbiddenReason =
  | { reason: "SCOPE"; kind: "district" | "facility"; id: string }
  | { reason: "ROLE"; permission: Permission };

export type ForbiddenPageProps = { denial?: ForbiddenReason | null };

export function ForbiddenPage({ denial = null }: ForbiddenPageProps) {
  const t = useTx();
  const services = useServices();
  const navigate = useNavigate();
  const location = useLocation();
  const persona = useAdminSession((s) => s.persona);
  const grant = useAdminSession((s) => s.grant);
  const session = useAdminSession((s) => s.session);
  const title = t("admin:errors.forbidden.title");
  useDocumentTitle(title);

  const navItem = NAV_SECTIONS.flatMap((s) => s.items).find((item) =>
    location.pathname.startsWith(item.to),
  );
  const requested: string[] = [];
  if (navItem !== undefined) {
    requested.push(t("admin:errors.forbidden.page", { name: t(navItem.labelKey) }));
  }
  if (denial?.reason === "SCOPE") {
    requested.push(
      denial.kind === "district"
        ? t("admin:errors.forbidden.district", { name: districtLabel(denial.id, t) })
        : t("admin:errors.forbidden.facility", { name: facilityLabel(denial.id, t) }),
    );
  }
  if (denial?.reason === "ROLE") {
    requested.push(
      t("admin:errors.forbidden.requires", {
        permission: t(permissionLabelKey(denial.permission)),
      }),
    );
  }
  const home =
    persona === null
      ? "/admin/overview"
      : homePathFor(persona, grant, session?.reportingDistrictId ?? null);

  return (
    <>
      <PageHeader
        title={title}
        titleAdornment={
          <MicroLabel tone="danger" className="font-mono">
            {t("admin:errors.forbidden.status")}
          </MicroLabel>
        }
      />
      <Card as="section">
        <div data-testid="forbidden-page" role="alert" className="space-y-4">
          <p className="text-ink text-sm">{t("admin:errors.forbidden.description")}</p>
          <KeyValueList
            items={[
              ...(requested.length === 0
                ? []
                : [{ label: t("admin:errors.forbidden.requested"), value: requested.join(" · ") }]),
              ...(persona === null
                ? []
                : [
                    {
                      label: t("admin:errors.forbidden.yourScope"),
                      value: grantScopeLabel(persona, grant, t),
                    },
                  ]),
            ]}
          />
          <div className="flex flex-wrap gap-2">
            <Link
              to={home}
              className="target-min bg-primary text-on-primary hover:bg-primary-dark inline-flex items-center rounded-md px-4 text-sm font-semibold"
            >
              {t("admin:errors.forbidden.back")}
            </Link>
            <Button
              variant="secondary"
              icon="user"
              onClick={async () => {
                await endAdminSession(services);
                void navigate(loginPathFor(null), { replace: true });
              }}
            >
              {t("admin:errors.forbidden.switch")}
            </Button>
          </div>
        </div>
      </Card>
    </>
  );
}
