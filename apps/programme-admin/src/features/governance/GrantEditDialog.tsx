/**
 * Edit an AccessGrant (ADM-08 task 6; PA-08, PA-01, T-05/T-06): react-hook-form + Zod.
 *
 * Fields: role (one of the four demo admin roles), districts (≥ 1), facilities ("All facilities
 * in selected districts" or a list limited to the selected districts), valid until (optional,
 * today or later, Kigali) and a required justification (10–300 characters). The same rules run
 * in the repository; the UI also checks the lockout rule (`LAST_ADMIN`: the editor cannot remove
 * `roles.configure` from their own grant, and one active administrator must remain).
 *
 * - One idempotency key per opening (reused by retries); `expectedVersion` = the grant's version.
 * - CONFLICT → `ConflictNotice` with the latest grant diff: "Keep latest" (close, refresh) or
 *   "Re-apply on latest" (new key, latest version).
 * - "Revoke now" sets `validTo` to the demo now (grants are never deleted); it needs the
 *   justification too.
 * - A failed save keeps the dialog and the input ("Not saved — retry").
 * - DEMO: "Simulate stale version" arms a one-shot conflict for this grant (`conflictOnce`).
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { isGrantExpired, roleHasPermission, roleLabelKey } from "@laif/auth-demo";
import {
  ACCESS_GRANT_ROLES,
  ALL_IN_DISTRICTS,
  GRANT_JUSTIFICATION_MAX,
  GRANT_JUSTIFICATION_MIN,
  type AccessGrant,
  type AccessGrantRole,
} from "@laif/contracts";
import type { ConflictResolution, Role } from "@laif/domain";
import { kigaliDate } from "@laif/analytics";
import { formatDateTime, useLanguage } from "@laif/i18n";
import { DISTRICTS_REFERENCE, FACILITIES_REFERENCE } from "@laif/mock-data";
import { isRepositoryError, type RepositoryError } from "@laif/repositories";
import {
  Button,
  ConfirmDialog,
  ConflictNotice,
  CONTROL_CLASS,
  cx,
  Icon,
  useToast,
  useTx,
  type TranslationKey,
} from "@laif/ui-web";
import { useId, useMemo, useState, type ReactNode } from "react";
import { useForm, useWatch, type FieldErrors } from "react-hook-form";
import { z } from "zod";

import { districtLabel, facilityLabel } from "../../app/persona-labels.ts";
import { useServices } from "../../app/providers.tsx";
import { findAdminPersona } from "../../auth/personas.ts";
import { emitAdminAudit } from "../../lib/audit.ts";
import { isRetryableWriteError } from "../programme-actions/mutations.ts";
import { useDialogDraft, type DialogDraft } from "../../lib/drafts.ts";
import { scopeText } from "./grantFormat.ts";
import { useRefreshGrants, useUpdateGrant } from "./mutations.ts";

export type GrantFormValues = {
  role: string;
  districtIds: string[];
  facilityMode: "all" | "selected";
  facilityIds: string[];
  /** Kigali `YYYY-MM-DD` or "". */
  validTo: string;
  justification: string;
  /** "Revoke now" was pressed (validTo := now; validTo input ignored). */
  revoke: boolean;
};
type FieldName = "role" | "districtIds" | "facilityIds" | "validTo" | "justification";

const KEY = {
  role: "admin:governance.validation.role",
  scope: "admin:governance.validation.scopeRequired",
  facilities: "admin:governance.validation.facilitiesRequired",
  validTo: "admin:governance.validation.validTo",
  justification: "admin:governance.validation.justification",
  lastAdmin: "admin:governance.validation.lastAdmin",
} as const satisfies Record<string, TranslationKey>;

/** End of a Kigali calendar day as a UTC instant. */
export const endOfKigaliDay = (day: string): string =>
  new Date(`${day}T23:59:59.999+02:00`).toISOString();

const holdsAdmin = (g: Pick<AccessGrant, "role" | "validTo">, nowIso: string) =>
  roleHasPermission(g.role, "roles.configure") && !isGrantExpired(g, nowIso);

/** Client copy of the repository lockout rule (`LAST_ADMIN`). */
export function wouldLockOut(input: {
  grant: AccessGrant;
  grants: readonly AccessGrant[];
  editorPersonaId: string | null;
  role: Role;
  revoke: boolean;
  nowIso: string;
}): boolean {
  const next = {
    role: input.role,
    ...(input.revoke ? { validTo: input.nowIso } : {}),
    ...(!input.revoke && input.grant.validTo !== undefined ? { validTo: input.grant.validTo } : {}),
  };
  const own = input.grant.personaId === input.editorPersonaId;
  if (own && !holdsAdmin(next, input.nowIso)) return true;
  const remaining = input.grants
    .map((g) => (g.id === input.grant.id ? { ...g, ...next } : g))
    .filter((g) => holdsAdmin(g, input.nowIso));
  return remaining.length === 0;
}

export type GrantFormContext = {
  grant: AccessGrant;
  grants: readonly AccessGrant[];
  editorPersonaId: string | null;
  /** Demo now (UTC ISO). */
  nowIso: string;
};

/** Zod schema of the form; messages are `admin:governance.validation.*` keys. */
export function grantFormSchema(ctx: GrantFormContext) {
  const today = kigaliDate(ctx.nowIso);
  return z
    .object({
      role: z.string(),
      districtIds: z.array(z.string()),
      facilityMode: z.enum(["all", "selected"]),
      facilityIds: z.array(z.string()),
      validTo: z.string(),
      justification: z.string(),
      revoke: z.boolean(),
    })
    .superRefine((v, issue) => {
      const add = (path: FieldName, message: TranslationKey) =>
        issue.addIssue({ code: "custom", path: [path], message });
      if (!(ACCESS_GRANT_ROLES as readonly string[]).includes(v.role)) add("role", KEY.role);
      else if (wouldLockOut({ ...ctx, role: v.role as Role, revoke: v.revoke })) {
        add("role", KEY.lastAdmin);
      }
      if (v.districtIds.length === 0) add("districtIds", KEY.scope);
      if (v.facilityMode === "selected") {
        const inDistricts = v.facilityIds.filter((id) =>
          FACILITIES_REFERENCE.some((f) => f.id === id && v.districtIds.includes(f.districtId)),
        );
        if (inDistricts.length === 0 || inDistricts.length !== v.facilityIds.length) {
          add("facilityIds", KEY.facilities);
        }
      }
      if (
        !v.revoke &&
        v.validTo !== "" &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(v.validTo) || v.validTo < today)
      ) {
        add("validTo", KEY.validTo);
      }
      const length = v.justification.trim().length;
      if (length < GRANT_JUSTIFICATION_MIN || length > GRANT_JUSTIFICATION_MAX) {
        add("justification", KEY.justification);
      }
    });
}

export function defaultGrantValues(grant: AccessGrant): GrantFormValues {
  return {
    role: grant.role,
    districtIds: [...grant.districtIds],
    facilityMode: grant.facilityIds === ALL_IN_DISTRICTS ? "all" : "selected",
    facilityIds: grant.facilityIds === ALL_IN_DISTRICTS ? [] : [...grant.facilityIds],
    validTo: grant.validTo === undefined ? "" : kigaliDate(grant.validTo),
    justification: "",
    revoke: false,
  };
}

function Row({
  id,
  label,
  hint,
  error,
  required = false,
  group = false,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string | undefined;
  required?: boolean;
  /** A checkbox / radio group: rendered as a fieldset with a legend. */
  group?: boolean;
  children: (control: {
    id: string;
    "aria-invalid"?: true;
    "aria-describedby"?: string;
  }) => ReactNode;
}) {
  const t = useTx();
  const describedBy = [
    hint === undefined ? null : `${id}-hint`,
    error === undefined ? null : `${id}-error`,
  ]
    .filter((v): v is string => v !== null)
    .join(" ");
  const control = {
    id,
    ...(error === undefined ? {} : { "aria-invalid": true as const }),
    ...(describedBy === "" ? {} : { "aria-describedby": describedBy }),
  };
  const labelContent = (
    <>
      {label}
      {required ? (
        <span className="text-danger ms-1">
          <span aria-hidden="true">*</span>
          <span className="sr-only">{t("common:ui.required")}</span>
        </span>
      ) : null}
    </>
  );
  const tail = (
    <>
      {hint === undefined ? null : (
        <p id={`${id}-hint`} className="text-muted m-0 text-xs">
          {hint}
        </p>
      )}
      {error === undefined ? null : (
        <p
          id={`${id}-error`}
          className="text-danger m-0 flex items-center gap-1 text-xs font-medium"
        >
          <Icon name="alert" size={14} />
          {error}
        </p>
      )}
    </>
  );
  if (group) {
    return (
      <fieldset
        className="m-0 flex flex-col gap-1.5 border-0 p-0"
        {...(describedBy === "" ? {} : { "aria-describedby": describedBy })}
      >
        <legend className="text-ink mb-1 p-0 text-[13px] font-medium">{labelContent}</legend>
        {children(control)}
        {tail}
      </fieldset>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-ink text-[13px] font-medium">
        {labelContent}
      </label>
      {children(control)}
      {tail}
    </div>
  );
}

type Failure = "retry" | "forbidden" | "other" | null;
type ConflictState = {
  latest: AccessGrant;
  changedBy?: string;
  changedAt?: string;
  values: GrantFormValues;
  revoke: boolean;
};

export type GrantEditDialogProps = {
  grant: AccessGrant;
  grants: readonly AccessGrant[];
  onClose: () => void;
  onSaved?: (grant: AccessGrant) => void;
  /** Test seam (default `crypto.randomUUID`). */
  createKey?: () => string;
  /** ADM-09: keep a sessionStorage draft for this context (path + search); null = none. */
  draftContext?: string | null;
  /** ADM-09: a draft left by an expired session (its key and input are reused). */
  restore?: DialogDraft<GrantFormValues> | null;
};

export function GrantEditDialog({
  grant,
  grants,
  onClose: close,
  onSaved,
  createKey,
  draftContext = null,
  restore = null,
}: GrantEditDialogProps) {
  const t = useTx();
  const { language } = useLanguage();
  const { toast } = useToast();
  const services = useServices();
  const baseId = useId();
  const newKey = useMemo(() => createKey ?? (() => crypto.randomUUID()), [createKey]);
  const [key, setKey] = useState(() => restore?.key ?? newKey());
  const [version, setVersion] = useState(grant.version);
  const [failure, setFailure] = useState<Failure>(null);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [resolving, setResolving] = useState<ConflictResolution | null>(null);
  const [revokeMode, setRevokeMode] = useState(false);
  const mutation = useUpdateGrant();
  const refreshGrants = useRefreshGrants();
  const editorPersonaId = services.session.getState().session?.personaId ?? null;
  const persona = findAdminPersona(grant.personaId);
  const nowIso = services.clock.nowIso();
  const today = kigaliDate(nowIso);

  const schema = useMemo(
    () => grantFormSchema({ grant, grants, editorPersonaId, nowIso }),
    [grant, grants, editorPersonaId, nowIso],
  );
  const form = useForm<GrantFormValues>({
    resolver: zodResolver(schema),
    defaultValues: restore === null ? defaultGrantValues(grant) : restore.values,
    shouldFocusError: true,
  });
  const { register, handleSubmit, formState, setError, setValue, control, watch } = form;
  const draft = useDialogDraft<GrantFormValues>({
    kind: "grant",
    context: draftContext,
    key,
    subject: grant.id,
    subscribe: watch,
  });
  // Every way out of the dialog (saved, cancelled, kept the latest) drops the draft.
  const onClose = () => {
    draft.clear();
    close();
  };
  const errors: FieldErrors<GrantFormValues> = formState.errors;
  const districtIds = useWatch({ control, name: "districtIds" });
  const facilityMode = useWatch({ control, name: "facilityMode" });
  const facilityIds = useWatch({ control, name: "facilityIds" });
  const justification = useWatch({ control, name: "justification" });
  const errorText = (field: FieldName): string | undefined => {
    const message = errors[field]?.message;
    if (message === undefined || message === "") return undefined;
    return t(message as TranslationKey, {
      min: GRANT_JUSTIFICATION_MIN,
      max: GRANT_JUSTIFICATION_MAX,
    });
  };

  const save = async (
    values: GrantFormValues,
    revoke: boolean,
    opts?: { key: string; version: number },
  ) => {
    setFailure(null);
    try {
      const result = await mutation.mutateAsync({
        key: opts?.key ?? key,
        input: {
          id: grant.id,
          expectedVersion: opts?.version ?? version,
          role: values.role as AccessGrantRole,
          districtIds: values.districtIds,
          facilityIds: values.facilityMode === "all" ? ALL_IN_DISTRICTS : values.facilityIds,
          ...(revoke
            ? { revoke: true }
            : { validTo: values.validTo === "" ? null : endOfKigaliDay(values.validTo) }),
          justification: values.justification.trim(),
        },
      });
      toast({
        title: revoke
          ? t("admin:governance.roles.toast.revoked")
          : t("admin:governance.roles.toast.saved"),
        tone: "positive",
      });
      onSaved?.(result.data);
      onClose();
    } catch (error) {
      if (isRepositoryError(error)) handleError(error, values, revoke);
      else setFailure("other");
    }
  };

  const handleError = (error: RepositoryError, values: GrantFormValues, revoke: boolean) => {
    if (error.code === "CONFLICT" && error.conflict) {
      const latest = error.conflict.latest as AccessGrant;
      setConflict({
        latest,
        values,
        revoke,
        ...(error.conflict.changedBy === undefined ? {} : { changedBy: error.conflict.changedBy }),
        ...(error.conflict.changedAt === undefined ? {} : { changedAt: error.conflict.changedAt }),
      });
      return;
    }
    if (error.code === "FORBIDDEN" && error.reason === "LAST_ADMIN") {
      setError("role", { type: "server", message: KEY.lastAdmin });
      return;
    }
    if (error.code === "VALIDATION_ERROR" && error.fieldErrors) {
      const map: Record<string, [FieldName, TranslationKey]> = {
        role: ["role", KEY.role],
        districtIds: ["districtIds", KEY.scope],
        facilityIds: ["facilityIds", KEY.facilities],
        validTo: ["validTo", KEY.validTo],
        justification: ["justification", KEY.justification],
      };
      const hits = Object.keys(error.fieldErrors).filter((f) => map[f] !== undefined);
      for (const f of hits) {
        const [field, message] = map[f] as [FieldName, TranslationKey];
        setError(field, { type: "server", message });
      }
      if (hits.length > 0) return;
    }
    if (isRetryableWriteError(error)) setFailure("retry");
    else if (error.code === "FORBIDDEN") setFailure("forbidden");
    else setFailure("other");
  };

  const submit = (revoke: boolean) => {
    setValue("revoke", revoke);
    setRevokeMode(revoke);
    return handleSubmit((values) => save(values, values.revoke))();
  };

  const resolve = async (resolution: ConflictResolution) => {
    if (conflict === null) return;
    setResolving(resolution);
    const session = services.session.getState().session;
    if (session !== null) {
      void emitAdminAudit(services.repo, session, {
        action: "conflict.resolved",
        entityType: "access_grant",
        entityId: grant.id,
        changeSummary: { resolution, latestVersion: conflict.latest.version },
      }).catch(() => undefined);
    }
    try {
      if (resolution === "keep_latest") {
        await refreshGrants();
        onClose();
        return;
      }
      const next = { key: newKey(), version: conflict.latest.version };
      setKey(next.key);
      setVersion(next.version);
      setConflict(null);
      await save(conflict.values, conflict.revoke, next);
    } finally {
      setResolving(null);
    }
  };

  const simulateStale = async () => {
    try {
      await services.repo.demo.setFaults({
        conflictOnce: [{ entityType: "access_grant", entityId: grant.id }],
      });
      toast({ title: t("admin:governance.roles.demo.staleArmed") });
    } catch {
      toast({ title: t("demo:tools.actionFailed"), tone: "danger" });
    }
  };

  const revalidate = { shouldValidate: formState.isSubmitted, shouldDirty: true } as const;
  const toggleDistrict = (id: string, on: boolean) => {
    const selected = on
      ? DISTRICTS_REFERENCE.map((d) => d.id as string).filter(
          (d) => d === id || districtIds.includes(d),
        )
      : districtIds.filter((d) => d !== id);
    setValue("districtIds", selected, revalidate);
    // Facilities outside the selected districts are dropped.
    setValue(
      "facilityIds",
      facilityIds.filter((fid) =>
        FACILITIES_REFERENCE.some((f) => f.id === fid && selected.includes(f.districtId)),
      ),
      revalidate,
    );
  };
  const toggleFacility = (id: string, on: boolean) =>
    setValue(
      "facilityIds",
      on
        ? FACILITIES_REFERENCE.map((f) => f.id as string).filter(
            (f) => f === id || facilityIds.includes(f),
          )
        : facilityIds.filter((f) => f !== id),
      revalidate,
    );

  const facilityChoices = FACILITIES_REFERENCE.filter((f) => districtIds.includes(f.districtId));
  const grantRows = (latest: AccessGrant, values: GrantFormValues) => {
    const yoursFacilities = values.facilityMode === "all" ? ALL_IN_DISTRICTS : values.facilityIds;
    return [
      {
        id: "role",
        label: t("admin:governance.grant.field.role"),
        yours: t(roleLabelKey(values.role as Role)),
        latest: t(roleLabelKey(latest.role)),
      },
      {
        id: "districtIds",
        label: t("admin:governance.grant.field.districtIds"),
        yours: scopeText(values.districtIds, t),
        latest: scopeText(latest.districtIds, t),
      },
      {
        id: "facilityIds",
        label: t("admin:governance.grant.field.facilityIds"),
        yours: scopeText(yoursFacilities, t),
        latest: scopeText(latest.facilityIds, t),
      },
      {
        id: "validTo",
        label: t("admin:governance.grant.field.validTo"),
        yours: values.validTo === "" ? t("admin:governance.grant.openEnded") : values.validTo,
        latest:
          latest.validTo === undefined
            ? t("admin:governance.grant.openEnded")
            : formatDateTime(latest.validTo, language),
      },
      {
        id: "version",
        label: t("admin:governance.grant.field.version"),
        yours: `v${version}`,
        latest: `v${latest.version}`,
      },
    ];
  };

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
      title={t("admin:governance.roles.dialog.title", {
        persona: persona?.displayName ?? grant.personaId,
      })}
      description={t("admin:governance.roles.dialog.description")}
      confirmLabel={
        failure === "retry"
          ? t("admin:governance.roles.dialog.retry")
          : t("admin:governance.roles.dialog.save")
      }
      confirmDisabled={conflict !== null}
      loading={mutation.isPending && !revokeMode}
      onConfirm={() => submit(false)}
    >
      <form
        noValidate
        data-testid="grant-edit-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!mutation.isPending) void submit(false);
        }}
        className="flex flex-col gap-4"
      >
        <p className="border-info/30 bg-info-soft text-ink m-0 rounded-sm border px-3 py-2 font-mono text-[11px] font-semibold tracking-wide uppercase">
          {t("admin:governance.roles.dialog.banner")}
        </p>
        <Row
          id={`${baseId}-role`}
          label={t("admin:governance.grant.field.role")}
          error={errorText("role")}
          required
        >
          {(control) => (
            <select
              {...control}
              {...register("role")}
              className={cx(CONTROL_CLASS, "border-border")}
            >
              {ACCESS_GRANT_ROLES.map((r) => (
                <option key={r} value={r}>
                  {t(roleLabelKey(r))}
                </option>
              ))}
            </select>
          )}
        </Row>
        <Row
          id={`${baseId}-districts`}
          label={t("admin:governance.grant.field.districtIds")}
          error={errorText("districtIds")}
          required
          group
        >
          {() => (
            <div className="flex flex-wrap gap-4">
              {DISTRICTS_REFERENCE.map((d) => (
                <label key={d.id} className="text-ink flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    value={d.id}
                    checked={districtIds.includes(d.id)}
                    className="accent-primary size-[18px]"
                    onChange={(e) => toggleDistrict(d.id, e.target.checked)}
                  />
                  {districtLabel(d.id, t)}
                </label>
              ))}
            </div>
          )}
        </Row>
        <Row
          id={`${baseId}-facilities`}
          label={t("admin:governance.grant.field.facilityIds")}
          error={errorText("facilityIds")}
          hint={t("admin:governance.roles.dialog.facilitiesHint")}
          required
          group
        >
          {() => (
            <div className="flex flex-col gap-2">
              <label className="text-ink flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  value="all"
                  className="accent-primary size-[18px]"
                  {...register("facilityMode")}
                />
                {t("admin:governance.grant.allFacilities")}
              </label>
              <label className="text-ink flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  value="selected"
                  className="accent-primary size-[18px]"
                  {...register("facilityMode")}
                />
                {t("admin:governance.roles.dialog.selectedFacilities")}
              </label>
              {facilityMode === "selected" ? (
                <div className="ms-7 flex flex-wrap gap-4">
                  {facilityChoices.length === 0 ? (
                    <span className="text-muted text-xs">
                      {t("admin:governance.roles.dialog.pickDistrictFirst")}
                    </span>
                  ) : (
                    facilityChoices.map((f) => (
                      <label key={f.id} className="text-ink flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          value={f.id}
                          checked={facilityIds.includes(f.id)}
                          className="accent-primary size-[18px]"
                          onChange={(e) => toggleFacility(f.id, e.target.checked)}
                        />
                        {facilityLabel(f.id, t)}
                      </label>
                    ))
                  )}
                </div>
              ) : null}
            </div>
          )}
        </Row>
        <Row
          id={`${baseId}-validTo`}
          label={t("admin:governance.grant.field.validTo")}
          hint={t("admin:governance.roles.dialog.validToHint")}
          error={errorText("validTo")}
        >
          {(control) => (
            <input
              type="date"
              min={today}
              {...control}
              {...register("validTo")}
              className={cx(CONTROL_CLASS, "border-border")}
            />
          )}
        </Row>
        <Row
          id={`${baseId}-justification`}
          label={t("admin:governance.roles.justification")}
          hint={t("admin:governance.roles.dialog.justificationHint", {
            count: justification.trim().length,
            max: GRANT_JUSTIFICATION_MAX,
          })}
          error={errorText("justification")}
          required
        >
          {(control) => (
            <textarea
              rows={3}
              maxLength={GRANT_JUSTIFICATION_MAX + 50}
              {...control}
              {...register("justification")}
              className={cx(CONTROL_CLASS, "border-border")}
            />
          )}
        </Row>

        {conflict === null ? null : (
          <ConflictNotice
            title={t("admin:governance.roles.conflict.title")}
            description={t("admin:governance.roles.conflict.description")}
            {...(conflict.changedBy === undefined
              ? {}
              : {
                  changedBy:
                    findAdminPersona(conflict.changedBy)?.displayName ?? conflict.changedBy,
                })}
            {...(conflict.changedAt === undefined ? {} : { changedAt: conflict.changedAt })}
            rows={grantRows(conflict.latest, conflict.values)}
            resolving={resolving}
            onResolve={(r) => resolve(r)}
          />
        )}

        {failure === null ? null : (
          <div
            role="alert"
            data-testid="grant-edit-error"
            className="border-danger/30 bg-danger-soft text-ink rounded-sm border px-3 py-2 text-[13px]"
          >
            <p className="m-0 font-semibold">
              {failure === "retry"
                ? t("admin:governance.roles.dialog.notSaved")
                : failure === "forbidden"
                  ? t("admin:governance.roles.dialog.forbidden")
                  : t("admin:governance.roles.dialog.failed")}
            </p>
          </div>
        )}

        <div className="border-border-soft flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <Button
            type="button"
            variant="danger"
            size="sm"
            loading={mutation.isPending && revokeMode}
            disabled={conflict !== null || isGrantExpired(grant, nowIso)}
            onClick={() => submit(true)}
          >
            {t("admin:governance.roles.dialog.revoke")}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => simulateStale()}>
            {t("admin:governance.roles.demo.simulateStale")}
          </Button>
        </div>
        <button type="submit" hidden tabIndex={-1} aria-hidden="true" />
      </form>
    </ConfirmDialog>
  );
}
