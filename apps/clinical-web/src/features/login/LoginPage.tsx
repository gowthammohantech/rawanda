/**
 * `/clinical/login` — demo access (CLN-01 task 5). Persona cards (name, role, permitted
 * facilities, DEMO PERSONA pill) + active facility select limited to the persona's permitted
 * facilities. Submit starts the demo session, records `session.started` and goes to
 * `?redirect=` (in-app paths only) or the review queue. Nothing is preselected; focus starts on
 * the first persona card; Enter / Space on a card selects it.
 * DEMO ONLY — NOT AUTHENTICATION.
 */
import { roleLabelKey } from "@laif/auth-demo";
import { vMsg } from "@laif/contracts";
import { Button, Icon, InfoCallout, Select, cx, useTx } from "@laif/ui-web";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { facilityLabel, personaFacilitiesLabel } from "../../app/persona-labels.ts";
import { useRepository } from "../../data/useRepository.ts";
import { HOME_PATH, safeRedirect } from "../../app/routes.ts";
import { PageHeader } from "../../components/PageHeader.tsx";
import { PublicShell } from "../../components/shell/PublicShell.tsx";
import { recordSessionEnded, recordSessionStarted } from "../../session/session-audit.ts";
import { permittedFacilityIdsFor } from "../../session/session-store.ts";
import { useSession } from "../../session/useSession.ts";

type Errors = { persona?: boolean; facility?: boolean };

export function LoginPage() {
  const t = useTx();
  const repo = useRepository();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { store, state } = useSession();
  const personas = store.available();

  const [personaId, setPersonaId] = useState<string>("");
  const [facilityId, setFacilityId] = useState<string>("");
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const firstCard = useRef<HTMLButtonElement>(null);
  const facilityRef = useRef<HTMLSelectElement>(null);
  const personaErrorId = useId();

  useEffect(() => {
    firstCard.current?.focus();
  }, []);

  const selected = personas.find((persona) => persona.id === personaId);
  const permitted = selected === undefined ? [] : permittedFacilityIdsFor(selected);

  const choosePersona = (id: string) => {
    setPersonaId(id);
    setErrors((previous) => ({ ...previous, persona: false }));
    const next = personas.find((persona) => persona.id === id);
    const allowed = next === undefined ? [] : permittedFacilityIdsFor(next);
    // Keep a still-permitted choice; preselect when the persona has exactly one facility.
    setFacilityId((current) =>
      allowed.some((fid) => fid === current) ? current : allowed.length === 1 ? allowed[0]! : "",
    );
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors: Errors = {
      persona: selected === undefined,
      facility: facilityId === "" || !permitted.some((fid) => fid === facilityId),
    };
    setErrors(nextErrors);
    if (nextErrors.persona === true) {
      firstCard.current?.focus();
      return;
    }
    if (nextErrors.facility === true) {
      facilityRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      if (state !== null) await recordSessionEnded(repo, state, "persona_switch");
      const result = store.signIn(personaId, facilityId);
      if (!result.ok) {
        setErrors({ facility: true });
        facilityRef.current?.focus();
        return;
      }
      queryClient.clear();
      await recordSessionStarted(repo, result.state);
      await Promise.resolve(
        navigate(safeRedirect(params.get("redirect")) ?? HOME_PATH, { replace: true }),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <PublicShell>
      <PageHeader title={t("clinical:login.title")} subtitle={t("clinical:login.subtitle")} />
      <InfoCallout icon="shield">{t("clinical:login.demoOnlyNotice")}</InfoCallout>
      <form noValidate onSubmit={(event) => void submit(event)} className="space-y-5">
        <fieldset
          className="m-0 space-y-2 border-0 p-0"
          {...(errors.persona ? { "aria-describedby": personaErrorId } : {})}
        >
          <legend className="text-ink mb-2 text-[13px] font-medium">
            {t("clinical:login.selectPersona")}
            <span className="text-danger ms-1" aria-hidden="true">
              *
            </span>
          </legend>
          <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
            {personas.map((persona, index) => {
              const isSelected = persona.id === personaId;
              return (
                <li key={persona.id}>
                  <button
                    ref={index === 0 ? firstCard : undefined}
                    type="button"
                    aria-pressed={isSelected}
                    data-testid={`persona-card-${persona.id}`}
                    onClick={() => choosePersona(persona.id)}
                    className={cx(
                      "bg-surface flex h-full w-full flex-col items-start gap-1.5 rounded-lg border p-4 text-start transition-colors",
                      isSelected
                        ? "border-primary shadow-card ring-primary ring-2"
                        : "border-border-soft hover:border-border",
                      errors.persona && "border-danger",
                    )}
                  >
                    <span className="flex w-full items-center justify-between gap-2">
                      <span className="text-ink font-display text-base font-semibold">
                        {persona.displayName}
                      </span>
                      <span className="micro-label rounded-pill bg-demo-banner-bg text-demo-banner-fg px-2 py-0.5 font-mono">
                        {t("clinical:login.personaPill")}
                      </span>
                    </span>
                    <span className="text-ink text-sm">{t(roleLabelKey(persona.role))}</span>
                    <span className="text-muted text-xs">
                      {t("clinical:login.permittedFacilities", {
                        facilities: personaFacilitiesLabel(persona, t),
                      })}
                    </span>
                    {isSelected ? (
                      <span className="text-primary-dark inline-flex items-center gap-1 text-xs font-semibold">
                        <Icon name="check" size={14} />
                        {t("clinical:login.selected")}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
          {errors.persona ? (
            <p
              id={personaErrorId}
              className="text-danger flex items-center gap-1 text-xs font-medium"
            >
              <Icon name="alert" size={14} />
              {t("clinical:login.errors.personaRequired")}
            </p>
          ) : null}
        </fieldset>

        <Select
          ref={facilityRef}
          fieldClassName="max-w-md"
          label={t("clinical:login.selectFacility")}
          required
          placeholder={t("clinical:login.facilityPlaceholder")}
          hint={
            selected === undefined
              ? t("clinical:login.facilityNeedsPersona")
              : t("clinical:login.facilityHint")
          }
          options={permitted.map((fid) => ({ value: fid, label: facilityLabel(fid, t) }))}
          value={facilityId}
          onChange={(event) => {
            setFacilityId(event.target.value);
            setErrors((previous) => ({ ...previous, facility: false }));
          }}
          {...(errors.facility ? { error: vMsg("required") } : {})}
        />

        <Button type="submit" icon="arrow" iconPosition="end" disabled={busy}>
          {t("clinical:login.submit")}
        </Button>
      </form>
    </PublicShell>
  );
}
