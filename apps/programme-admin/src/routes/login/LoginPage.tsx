/**
 * Demo sign-in (ADM-01 task 5, FRD Scenario 1 steps 1–2). Step 1: a labelled DEMO PERSONA card
 * per admin persona (role, scope summary, capability chips). Step 2 — only when the grant covers
 * more than one district and the role can narrow reporting — "Choose reporting scope": all
 * districts in my scope, or one district. Submit starts the session (`session.started`) and goes
 * to `next` or the persona's overview. Real authentication / MFA / OIDC are NOT provided.
 */
import { actorForPersona, isGrantExpired, permissionLabelKey, roleLabelKey } from "@laif/auth-demo";
import { asId, type DistrictId } from "@laif/domain";
import {
  Button,
  Card,
  DemoBanner,
  ErrorState,
  Icon,
  InfoCallout,
  LanguageSwitcher,
  LoadingSkeleton,
  MicroLabel,
  RadioCardGroup,
  RwandaMark,
  SkipLink,
  StatusChip,
  useTx,
  type RadioCardOption,
} from "@laif/ui-web";
import { useQuery } from "@tanstack/react-query";
import { useId, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { districtLabel, grantScopeSummary } from "../../app/persona-labels.ts";
import { useServices } from "../../app/providers.tsx";
import { heldCapabilities } from "../../auth/capabilities.ts";
import { ADMIN_PERSONAS, findAdminPersona } from "../../auth/personas.ts";
import { ACCESS_GRANTS_QUERY_KEY } from "../../auth/RequireSession.tsx";
import { grantDistrictIds } from "../../auth/scope.ts";
import {
  defaultReportingDistrict,
  endAdminSession,
  homePathFor,
  needsScopeChoice,
  safeNext,
  startAdminSession,
} from "../../auth/signIn.ts";
import { useDocumentTitle } from "../useDocumentTitle.ts";

const ALL = "all" as const;

export function LoginPage() {
  const t = useTx();
  const services = useServices();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const errorId = useId();
  useDocumentTitle(t("admin:auth.title"));

  const grantsQuery = useQuery({
    queryKey: ACCESS_GRANTS_QUERY_KEY,
    queryFn: () => services.repo.listAccessGrants(),
  });
  // ADM-08: a revoked / expired grant no longer signs in (shown as "no grant").
  const grants = useMemo(
    () => (grantsQuery.data ?? []).filter((g) => !isGrantExpired(g, services.clock.nowIso())),
    [grantsQuery.data, services.clock],
  );

  const [personaId, setPersonaId] = useState<string | null>(
    findAdminPersona(params.get("persona"))?.id ?? null,
  );
  const [scope, setScope] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [error, setError] = useState<"personaRequired" | "scopeRequired" | "noGrant" | null>(null);
  const [submitError, setSubmitError] = useState<unknown>(null);

  const persona = findAdminPersona(personaId);
  const grant = persona === null ? undefined : grants.find((g) => g.personaId === persona.id);
  const twoSteps = persona !== null && grant !== undefined && needsScopeChoice(persona, grant);

  const personaOptions: RadioCardOption[] = ADMIN_PERSONAS.map((p) => {
    const g = grants.find((x) => x.personaId === p.id) ?? null;
    const capabilities = g === null ? [] : heldCapabilities(actorForPersona(p, { grant: g }));
    return {
      value: p.id,
      label: (
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{p.displayName}</span>
          <MicroLabel tone="warning">{t("admin:auth.demoPersona")}</MicroLabel>
        </span>
      ),
      description: (
        <span className="mt-1 block space-y-1.5">
          <span className="text-ink block">{t(roleLabelKey(g?.role ?? p.role))}</span>
          <span className="block">
            {g === null ? t("admin:auth.noGrant") : grantScopeSummary(p, g, t)}
          </span>
          <span className="sr-only">{t("admin:auth.capabilities")}</span>
          <span className="flex flex-wrap gap-1">
            {capabilities.map((permission) => (
              <span
                key={permission}
                className="border-border-soft bg-background text-ink rounded-sm border px-1.5 py-0.5 font-mono text-[11px]"
              >
                {t(permissionLabelKey(permission))}
              </span>
            ))}
          </span>
        </span>
      ),
    };
  });

  const scopeOptions: RadioCardOption[] =
    persona === null || grant === undefined
      ? []
      : [
          {
            value: ALL,
            label: t("admin:auth.scopeAll"),
            description: t("admin:auth.scopeAllHint", {
              list: grantDistrictIds(persona, grant)
                .map((id) => districtLabel(id, t))
                .join(", "),
            }),
          },
          ...grantDistrictIds(persona, grant).map((id) => ({
            value: id,
            label: districtLabel(id, t),
            description: t("admin:auth.scopeDistrictHint"),
          })),
        ];

  const submit = async () => {
    setSubmitError(null);
    if (persona === null) {
      setError("personaRequired");
      return;
    }
    if (grant === undefined) {
      setError("noGrant");
      return;
    }
    if (twoSteps && step === 1) {
      setError(null);
      setStep(2);
      return;
    }
    if (twoSteps && scope === null) {
      setError("scopeRequired");
      return;
    }
    setError(null);
    const reportingDistrictId = twoSteps
      ? scope === ALL || scope === null
        ? null
        : asId<DistrictId>(scope)
      : defaultReportingDistrict(persona, grant);
    try {
      if (services.session.getState().session !== null) await endAdminSession(services);
      await startAdminSession(services, { persona, grant, reportingDistrictId });
      void navigate(next ?? homePathFor(persona, grant, reportingDistrictId), { replace: true });
    } catch (caught) {
      setSubmitError(caught);
    }
  };

  const errorText =
    error === null
      ? undefined
      : t(
          error === "noGrant"
            ? "admin:auth.noGrant"
            : error === "personaRequired"
              ? "admin:auth.validation.personaRequired"
              : "admin:auth.validation.scopeRequired",
        );

  return (
    <div className="bg-canvas min-h-dvh">
      <SkipLink />
      <DemoBanner />
      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 sm:p-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <RwandaMark />
          <LanguageSwitcher />
        </header>
        <p
          role="note"
          className="border-border-soft bg-primary-soft text-ink flex items-center gap-2 rounded-md border px-4 py-2 text-[13px]"
        >
          <Icon name="user" size={16} className="text-primary-dark" />
          <span className="micro-label text-primary-dark">{t("admin:auth.demoRoleBanner")}</span>
          <span className="text-muted">{t("demo:roleSwitchDisclaimer")}</span>
        </p>
        <main id="main" tabIndex={-1} className="space-y-4 outline-none">
          <div className="space-y-1">
            <h1 className="font-display text-ink text-2xl font-semibold">
              {t("admin:auth.title")}
            </h1>
            <p className="text-muted text-sm">{t("admin:auth.intro")}</p>
            {params.get("next") === null ? null : (
              <p className="text-muted text-sm">{t("admin:auth.redirectNotice")}</p>
            )}
          </div>
          <InfoCallout icon="lock">{t("admin:auth.notProvided")}</InfoCallout>
          <Card as="section">
            {grantsQuery.isPending ? (
              <LoadingSkeleton variant="card" lines={4} />
            ) : grantsQuery.isError ? (
              <ErrorState onRetry={() => grantsQuery.refetch()} />
            ) : (
              <form
                noValidate
                aria-describedby={errorText === undefined ? undefined : errorId}
                onSubmit={(event) => {
                  event.preventDefault();
                  void submit();
                }}
                className="space-y-4"
              >
                {twoSteps ? (
                  <StatusChip tone="info" icon="info">
                    {t("admin:auth.step", { current: step, total: 2 })}
                  </StatusChip>
                ) : null}
                {step === 1 ? (
                  <RadioCardGroup
                    legend={t("admin:auth.choosePersona")}
                    name="persona"
                    options={personaOptions}
                    value={personaId}
                    onChange={(value) => {
                      setPersonaId(value);
                      setScope(null);
                      setError(null);
                    }}
                    required
                    columns={2}
                  />
                ) : (
                  <>
                    <p className="text-muted text-[13px]">{t("admin:auth.chooseScopeHint")}</p>
                    <RadioCardGroup
                      legend={t("admin:auth.chooseScope")}
                      name="scope"
                      options={scopeOptions}
                      value={scope}
                      onChange={(value) => {
                        setScope(value);
                        setError(null);
                      }}
                      required
                      columns={1}
                    />
                  </>
                )}
                {errorText === undefined ? null : (
                  <p id={errorId} role="alert" className="text-risk-danger text-[13px] font-medium">
                    {errorText}
                  </p>
                )}
                {submitError === null ? null : <ErrorState onRetry={submit} />}
                <div className="flex flex-wrap gap-2">
                  {step === 2 ? (
                    <Button
                      type="button"
                      variant="secondary"
                      icon="chevron-left"
                      onClick={() => {
                        setStep(1);
                        setError(null);
                      }}
                    >
                      {t("admin:auth.back")}
                    </Button>
                  ) : null}
                  <Button type="submit" variant="primary">
                    {twoSteps && step === 1 ? t("admin:auth.continue") : t("admin:auth.submit")}
                  </Button>
                </div>
              </form>
            )}
          </Card>
        </main>
      </div>
    </div>
  );
}
