/**
 * Audit filters (CLN-10): react-hook-form + the `@laif/contracts` `AuditExplorerFilterSchema`
 * (inline translated `validation:dateRangeOrder` when From > To). "Apply" writes the URL (the
 * page re-reads it); quick chips toggle at once (`aria-pressed`). Dates are Africa/Kigali days.
 * Actor / entity / patient / correlation values outside the facility are simply not found: the
 * repository decides scope (and audits an out-of-scope entity id).
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { roleLabelKey } from "@laif/auth-demo";
import {
  AUDIT_ACTION_FAMILIES,
  AUDIT_QUICK_FILTERS,
  AuditExplorerFilterSchema,
  type AuditExplorerFilter,
  type AuditQuickFilter,
} from "@laif/contracts";
import { ROLES, type EntityType } from "@laif/domain";
import { domainKey } from "@laif/i18n";
import { DEMO_PERSONAS } from "@laif/mock-data";
import { Button, Select, TextInput, cx, useTx, type SelectOption } from "@laif/ui-web";
import { useEffect } from "react";
import { useForm, type Resolver } from "react-hook-form";

/** Entity types that occur in the clinical audit log. */
export const AUDIT_ENTITY_TYPES = [
  "patient",
  "screening",
  "review",
  "referral",
  "follow_up",
  "care_task",
  "persona",
  "audit_event",
  "export_audit",
] as const satisfies readonly EntityType[];

type FormValues = {
  actionFamily: string;
  actorId: string;
  role: string;
  entityType: string;
  entityId: string;
  patient: string;
  correlationId: string;
  from: string;
  to: string;
};

const toForm = (f: AuditExplorerFilter): FormValues => ({
  actionFamily: f.actionFamily,
  actorId: f.actorId ?? "",
  role: f.role ?? "",
  entityType: f.entityType ?? "",
  entityId: f.entityId ?? "",
  patient: f.patient ?? "",
  correlationId: f.correlationId ?? "",
  from: f.from ?? "",
  to: f.to ?? "",
});

export type AuditFiltersProps = {
  value: AuditExplorerFilter;
  /** Full new filter (page reset to 1). */
  onApply: (next: AuditExplorerFilter) => void;
  onReset: () => void;
};

export function AuditFilters({ value, onApply, onReset }: AuditFiltersProps) {
  const t = useTx();
  const form = useForm<FormValues, unknown, AuditExplorerFilter>({
    // Form values are the raw strings of the inputs; the schema parses / validates them.
    resolver: zodResolver(AuditExplorerFilterSchema) as unknown as Resolver<
      FormValues,
      unknown,
      AuditExplorerFilter
    >,
    mode: "onSubmit",
    reValidateMode: "onChange",
    defaultValues: toForm(value),
  });
  const { register, handleSubmit, reset, formState } = form;

  // URL → form (back / forward, chip, correlation link, clear).
  const serialized = JSON.stringify(toForm(value));
  useEffect(() => {
    reset(JSON.parse(serialized) as FormValues);
  }, [serialized, reset]);

  const familyOptions: SelectOption[] = AUDIT_ACTION_FAMILIES.map((family) => ({
    value: family,
    label: t(`clinical:audit.filters.familyOption.${family}`),
  }));
  const actorOptions: SelectOption[] = DEMO_PERSONAS.filter((p) => p.appIds.includes("clinical"))
    .map((p) => ({ value: p.id, label: `${p.displayName} · ${t(roleLabelKey(p.role))}` }))
    .concat(
      DEMO_PERSONAS.filter(
        (p) => !p.appIds.includes("clinical") && p.role === "community_health_worker",
      ).map((p) => ({ value: p.id, label: `${p.displayName} · ${t(roleLabelKey(p.role))}` })),
    );
  const roleOptions: SelectOption[] = ROLES.map((role) => ({
    value: role,
    label: t(roleLabelKey(role)),
  }));
  const entityOptions: SelectOption[] = AUDIT_ENTITY_TYPES.map((type) => ({
    value: type,
    label: t(domainKey("entityType", type)),
  }));

  const toggleChip = (chip: AuditQuickFilter) => {
    const { chip: current, ...rest } = value;
    onApply(current === chip ? { ...rest, page: 1 } : { ...rest, chip, page: 1 });
  };

  return (
    <div className="space-y-3" data-testid="audit-filters">
      <div
        role="group"
        aria-label={t("clinical:audit.filters.chipsLabel")}
        className="flex flex-wrap gap-2"
      >
        {AUDIT_QUICK_FILTERS.map((chip) => {
          const pressed = value.chip === chip;
          return (
            <button
              key={chip}
              type="button"
              aria-pressed={pressed}
              data-testid={`audit-chip-${chip}`}
              onClick={() => toggleChip(chip)}
              className={cx(
                "rounded-pill target-min inline-flex items-center border px-3 text-sm font-medium",
                pressed
                  ? "bg-primary text-on-primary border-primary"
                  : "bg-surface text-ink border-border hover:bg-background",
              )}
            >
              {t(`clinical:audit.chips.${chip}`)}
            </button>
          );
        })}
      </div>
      <form
        aria-label={t("clinical:audit.filters.label")}
        noValidate
        onSubmit={(event) => {
          void handleSubmit((parsed) => {
            onApply({
              ...parsed,
              page: 1,
              ...(value.chip === undefined ? {} : { chip: value.chip }),
            });
          })(event);
        }}
        className="border-border-soft bg-surface shadow-card grid gap-4 rounded-lg border p-4 md:grid-cols-2 xl:grid-cols-4"
      >
        <Select
          label={t("clinical:audit.filters.family")}
          options={familyOptions}
          {...register("actionFamily")}
        />
        <Select
          label={t("clinical:audit.filters.actor")}
          placeholder={t("clinical:audit.filters.actorPlaceholder")}
          options={actorOptions}
          {...register("actorId")}
        />
        <Select
          label={t("clinical:audit.filters.role")}
          placeholder={t("clinical:audit.filters.rolePlaceholder")}
          options={roleOptions}
          {...register("role")}
        />
        <Select
          label={t("clinical:audit.filters.entityType")}
          placeholder={t("clinical:audit.filters.entityTypePlaceholder")}
          options={entityOptions}
          {...register("entityType")}
        />
        <TextInput
          label={t("clinical:audit.filters.entityId")}
          autoComplete="off"
          error={formState.errors.entityId}
          {...register("entityId")}
        />
        <TextInput
          label={t("clinical:audit.filters.patient")}
          hint={t("clinical:audit.filters.patientHint")}
          autoComplete="off"
          error={formState.errors.patient}
          {...register("patient")}
        />
        <TextInput
          label={t("clinical:audit.filters.correlationId")}
          autoComplete="off"
          error={formState.errors.correlationId}
          {...register("correlationId")}
        />
        <div className="grid grid-cols-2 gap-3">
          <TextInput
            type="date"
            label={t("clinical:audit.filters.from")}
            error={formState.errors.from}
            {...register("from")}
          />
          <TextInput
            type="date"
            label={t("clinical:audit.filters.to")}
            error={formState.errors.to}
            data-testid="audit-filter-to"
            {...register("to")}
          />
        </div>
        <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-4">
          <Button type="submit" icon="filter">
            {t("clinical:audit.filters.apply")}
          </Button>
          <Button type="button" variant="secondary" onClick={onReset}>
            {t("clinical:audit.filters.clear")}
          </Button>
        </div>
      </form>
    </div>
  );
}
