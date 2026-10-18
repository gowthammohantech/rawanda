/**
 * Access simulator (ADM-08 task 5): "Can persona X see resource Y?". Persona, resource type
 * (`district`, `facility`, `page`, `export`, `drilldown`) and a resource id limited to the seed
 * entities. Submit runs `evaluateAccess(grant, ROLE_PERMISSIONS, resource)` — the SAME function
 * ScopeGuard, `RequireCapability` and `assertScope` call — and shows ALLOWED / DENIED with the
 * reason code and the rule text; each run records `admin.access_simulation.run`.
 *
 * "Try as {persona}: open District Beta overview" switches the demo session to that persona and
 * opens the forbidden URL: the real 403 + `access.denied`; a banner offers "Return to …".
 * DEMO ROLE SWITCH — NOT AUTHENTICATION.
 */
import {
  ACCESS_RESOURCE_TYPES,
  evaluateAccess,
  ROLE_PERMISSIONS,
  roleLabelKey,
  type AccessEvaluation,
  type AccessResource,
  type AccessResourceType,
} from "@laif/auth-demo";
import { DISTRICTS_REFERENCE, FACILITIES_REFERENCE, FACILITY_TO_DISTRICT } from "@laif/mock-data";
import {
  Button,
  Card,
  Icon,
  MicroLabel,
  Select,
  StatusChip,
  useToast,
  useTx,
  type TranslationKey,
} from "@laif/ui-web";
import { useState, type FormEvent } from "react";

import { districtLabel, facilityLabel } from "../../app/persona-labels.ts";
import { useAdminSession, useServices } from "../../app/providers.tsx";
import { ADMIN_ROUTE_IDS, ROUTE_CAPABILITIES, type AdminRouteId } from "../../auth/capabilities.ts";
import { ADMIN_PERSONAS, findAdminPersona } from "../../auth/personas.ts";
import { useSimulationAudit, useTryAsPersona } from "./mutations.ts";
import { useGrants } from "./queries.ts";

type Option = { value: string; label: string };

/** The seed entities offered per resource type. */
export function resourceOptions(
  type: AccessResourceType,
  t: (key: TranslationKey) => string,
): Option[] {
  const districts = DISTRICTS_REFERENCE.map((d) => ({
    value: d.id,
    label: districtLabel(d.id, t),
  }));
  const facilities = FACILITIES_REFERENCE.map((f) => ({
    value: f.id,
    label: facilityLabel(f.id, t),
  }));
  switch (type) {
    case "district":
    case "export":
      return districts;
    case "facility":
    case "drilldown":
      return facilities;
    case "page":
      return ADMIN_ROUTE_IDS.map((id) => ({
        value: id,
        label: t(`admin:governance.sim.page.${id}` as TranslationKey),
      }));
  }
}

/** Simulator input → `evaluateAccess` resource (capabilities from the route / type map). */
export function simulatorResource(type: AccessResourceType, id: string): AccessResource {
  switch (type) {
    case "page":
      return { type, id, permissions: ROUTE_CAPABILITIES[id as AdminRouteId] ?? [] };
    case "export":
      return { type, id, districtId: id };
    case "drilldown":
      return { type, id, facilityId: id, districtId: FACILITY_TO_DISTRICT[id] ?? null };
    default:
      return { type, id };
  }
}

type Result = { personaId: string; resource: AccessResource; evaluation: AccessEvaluation };

export function AccessSimulator() {
  const t = useTx();
  const { toast } = useToast();
  const { clock } = useServices();
  const grants = useGrants();
  const record = useSimulationAudit();
  const tryAs = useTryAsPersona();
  const currentPersonaId = useAdminSession((s) => s.session?.personaId ?? null);
  const [personaId, setPersonaId] = useState<string>(ADMIN_PERSONAS[1]?.id ?? "");
  const [type, setType] = useState<AccessResourceType>("district");
  const [resourceId, setResourceId] = useState<string>("dist-beta");
  const [result, setResult] = useState<Result | null>(null);
  const [trying, setTrying] = useState(false);

  const options = resourceOptions(type, t);
  const persona = findAdminPersona(personaId);

  const run = async (event: FormEvent) => {
    event.preventDefault();
    if (persona === null) return;
    const grant = grants.data?.find((g) => g.personaId === persona.id) ?? null;
    const resource = simulatorResource(type, resourceId);
    const evaluation = evaluateAccess(grant, ROLE_PERMISSIONS, resource, {
      persona,
      now: clock.nowIso(),
      facilityToDistrict: FACILITY_TO_DISTRICT,
    });
    setResult({ personaId: persona.id, resource, evaluation });
    try {
      await record(persona.id, resource, evaluation);
    } catch {
      toast({ title: t("demo:tools.actionFailed"), tone: "danger" });
    }
  };

  const tryIt = async () => {
    setTrying(true);
    try {
      await tryAs(personaId);
    } catch {
      toast({ title: t("demo:tools.actionFailed"), tone: "danger" });
      setTrying(false);
    }
  };

  const resultPersona = result === null ? null : findAdminPersona(result.personaId);
  return (
    <Card title={t("admin:governance.sim.title")}>
      <div data-testid="access-simulator" className="flex flex-col gap-4">
        <p className="text-muted m-0 text-[13px]">{t("admin:governance.sim.subtitle")}</p>
        <form onSubmit={(e) => void run(e)} className="grid gap-3 sm:grid-cols-3" noValidate>
          <Select
            label={t("admin:governance.sim.persona")}
            value={personaId}
            onChange={(e) => {
              setPersonaId(e.target.value);
              setResult(null);
            }}
            options={ADMIN_PERSONAS.map((p) => ({
              value: p.id,
              label: `${p.displayName} · ${t(roleLabelKey(p.role))}`,
            }))}
          />
          <Select
            label={t("admin:governance.sim.resourceType")}
            value={type}
            onChange={(e) => {
              const next = e.target.value as AccessResourceType;
              setType(next);
              setResourceId(resourceOptions(next, t)[0]?.value ?? "");
              setResult(null);
            }}
            options={ACCESS_RESOURCE_TYPES.map((value) => ({
              value,
              label: t(`admin:governance.sim.type.${value}` as TranslationKey),
            }))}
          />
          <Select
            label={t("admin:governance.sim.resource")}
            value={resourceId}
            onChange={(e) => {
              setResourceId(e.target.value);
              setResult(null);
            }}
            options={options}
          />
          <div className="flex flex-wrap gap-2 sm:col-span-3">
            <Button type="submit" icon="shield" disabled={grants.isPending}>
              {t("admin:governance.sim.run")}
            </Button>
          </div>
        </form>

        {result === null ? null : (
          <div
            role="status"
            data-testid="simulation-result"
            data-decision={result.evaluation.allowed ? "allowed" : "denied"}
            className="border-border-soft rounded-md border p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip tone={result.evaluation.allowed ? "positive" : "danger"}>
                {result.evaluation.allowed
                  ? t("admin:governance.sim.allowed")
                  : t("admin:governance.sim.denied")}
              </StatusChip>
              <span className="text-ink font-mono text-[13px]" data-testid="simulation-reason">
                {result.evaluation.reasonCode}
              </span>
            </div>
            <p className="text-ink m-0 mt-2 text-[13px]">
              {t(`admin:governance.sim.reason.${result.evaluation.reasonCode}` as TranslationKey)}
            </p>
            <p className="text-muted m-0 mt-1 text-xs">
              {t("admin:governance.sim.rule", {
                persona: resultPersona?.displayName ?? result.personaId,
                role:
                  result.evaluation.role === null ? "—" : t(roleLabelKey(result.evaluation.role)),
                permission: result.evaluation.permission ?? "—",
              })}
            </p>
          </div>
        )}

        <div className="border-border-soft flex flex-col gap-2 border-t pt-3">
          <MicroLabel as="p" tone="warning">
            {t("admin:governance.sim.tryItLabel")}
          </MicroLabel>
          <p className="text-muted m-0 text-xs">{t("admin:governance.sim.tryItHint")}</p>
          <div>
            <Button
              variant="secondary"
              icon="external"
              loading={trying}
              disabled={persona === null}
              onClick={() => tryIt()}
              data-testid="simulation-try-it"
              className="h-auto max-w-full py-2 text-start whitespace-normal!"
            >
              {t("admin:governance.sim.tryIt", { persona: persona?.displayName ?? "" })}
            </Button>
          </div>
          {personaId === currentPersonaId ? (
            <p className="text-muted m-0 flex items-center gap-1 text-xs">
              <Icon name="info" size={14} />
              {t("admin:governance.sim.tryItSelf")}
            </p>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
