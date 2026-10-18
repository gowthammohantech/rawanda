/**
 * Global filter bar (ADM-02): date range (preset or custom), district, facility, screening type
 * and "Reset filters". Every change goes to the URL (`useAdminFilters`). A custom range is
 * applied with "Apply"; `from > to` (and the other range rules) show an inline field error and
 * nothing is applied. The bar stays interactive while data loads.
 * ADM-09 (390 px): below 640 px the controls collapse behind a "Filters (n)" button (a disclosure
 * "sheet"; n = filters that differ from the defaults), so the page starts with the figures.
 */
import { Button, cx, Icon, Select, TextInput, useTx, type TranslationKey } from "@laif/ui-web";
import { useId, useState, type FormEvent } from "react";

import { districtLabel, facilityLabel } from "../../app/persona-labels.ts";
import {
  customRangeIssue,
  DATE_PRESETS,
  DEFAULT_PRESET,
  type DatePreset,
  type FilterIssue,
} from "./filterSchema.ts";
import type { AdminFiltersApi } from "./useAdminFilters.ts";
import type { ScreeningTypeFilter } from "@laif/analytics";

const ALL = "__all__";

export function FilterBar({ api }: { api: AdminFiltersApi }) {
  const t = useTx();
  const { filters, period } = api;
  // "Custom range" picked but not applied yet: open for the current URL only.
  const [customFor, setCustomFor] = useState<string | null>(null);
  const customOpen = filters.preset === "custom" || customFor === api.searchString;
  const setCustomOpen = (open: boolean) => setCustomFor(open ? api.searchString : null);

  const districtValue = api.lockedDistrict ?? filters.district ?? ALL;
  const facilityValue = api.lockedFacility ?? filters.facility ?? ALL;
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetId = useId();
  const active = [
    filters.preset !== DEFAULT_PRESET,
    api.lockedDistrict === null && filters.district !== null,
    api.lockedFacility === null && filters.facility !== null,
    filters.type !== "all",
  ].filter(Boolean).length;

  return (
    <div
      role="group"
      aria-label={t("admin:filters.label")}
      data-testid="filter-bar"
      className="flex flex-col gap-3"
    >
      <Button
        variant="secondary"
        icon="filter"
        className="self-start sm:hidden"
        aria-expanded={sheetOpen}
        aria-controls={sheetId}
        onClick={() => setSheetOpen((open) => !open)}
        data-testid="filters-toggle"
      >
        {t("admin:filters.sheetToggle", { n: active })}
      </Button>
      <div
        id={sheetId}
        className={cx(
          "gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[repeat(4,minmax(0,1fr))_auto] xl:items-end",
          sheetOpen
            ? "border-border-soft bg-surface grid grid-cols-1 rounded-md border p-3 sm:border-0 sm:bg-transparent sm:p-0"
            : "hidden",
        )}
      >
        <Select
          label={t("admin:filters.dateRange")}
          value={customOpen ? "custom" : filters.preset}
          options={DATE_PRESETS.map((p) => ({
            value: p,
            label: t(`admin:filters.preset.${p}` as TranslationKey),
          }))}
          onChange={(event) => {
            const preset = event.target.value as DatePreset;
            if (preset === "custom") {
              setCustomOpen(true);
              return;
            }
            setCustomOpen(false);
            api.setFilter({ preset });
          }}
        />
        <Select
          label={t("admin:filters.district")}
          value={districtValue}
          disabled={api.lockedDistrict !== null}
          {...(api.lockedDistrict === null ? {} : { hint: t("admin:filters.lockedToScope") })}
          options={[
            ...(api.lockedDistrict === null
              ? [{ value: ALL, label: t("admin:filters.allDistricts") }]
              : []),
            ...api.districtOptions.map((id) => ({ value: id, label: districtLabel(id, t) })),
          ]}
          onChange={(event) =>
            api.setFilter({ district: event.target.value === ALL ? null : event.target.value })
          }
        />
        <Select
          label={t("admin:filters.facility")}
          value={facilityValue}
          disabled={api.lockedFacility !== null}
          {...(api.lockedFacility === null ? {} : { hint: t("admin:filters.lockedToScope") })}
          options={[
            ...(api.lockedFacility === null
              ? [{ value: ALL, label: t("admin:filters.allFacilities") }]
              : []),
            ...api.facilityOptions.map((id) => ({ value: id, label: facilityLabel(id, t) })),
          ]}
          onChange={(event) =>
            api.setFilter({ facility: event.target.value === ALL ? null : event.target.value })
          }
        />
        <Select
          label={t("admin:filters.type")}
          value={filters.type}
          options={(["all", "bp", "glucose"] as const).map((type) => ({
            value: type,
            label: t(`admin:filters.typeOption.${type}` as TranslationKey),
          }))}
          onChange={(event) => api.setFilter({ type: event.target.value as ScreeningTypeFilter })}
        />
        <Button variant="ghost" icon="refresh" onClick={api.reset}>
          {t("admin:filters.reset")}
        </Button>
      </div>
      {customOpen ? (
        <CustomRangeForm
          key={`${period.from}:${period.to}`}
          api={api}
          initialFrom={period.from}
          initialTo={period.to}
        />
      ) : null}
    </div>
  );
}

function CustomRangeForm({
  api,
  initialFrom,
  initialTo,
}: {
  api: AdminFiltersApi;
  initialFrom: string;
  initialTo: string;
}) {
  const t = useTx();
  const { today } = api;
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [error, setError] = useState<FilterIssue | null>(null);
  const errorId = useId();

  const applyCustom = (event: FormEvent) => {
    event.preventDefault();
    const issue = customRangeIssue(from === "" ? null : from, to === "" ? null : to, today);
    setError(issue);
    if (issue === null) api.setFilter({ preset: "custom", from, to });
  };

  return (
    <form
      onSubmit={applyCustom}
      noValidate
      aria-label={t("admin:filters.customRange")}
      data-testid="custom-range"
      className="flex flex-wrap items-end gap-3"
    >
      <TextInput
        type="date"
        label={t("admin:filters.from")}
        value={from}
        max={today}
        onChange={(event) => setFrom(event.target.value)}
        {...(error === null ? {} : { "aria-invalid": true, "aria-describedby": errorId })}
      />
      <TextInput
        type="date"
        label={t("admin:filters.to")}
        value={to}
        max={today}
        onChange={(event) => setTo(event.target.value)}
        {...(error === null ? {} : { "aria-invalid": true, "aria-describedby": errorId })}
      />
      <Button type="submit" variant="primary">
        {t("admin:filters.apply")}
      </Button>
      {error === null ? null : (
        <p
          id={errorId}
          role="alert"
          className="text-danger flex basis-full items-center gap-1 text-xs font-medium"
        >
          <Icon name="alert" size={14} />
          {t(`admin:filters.validation.${error}` as TranslationKey)}
        </p>
      )}
    </form>
  );
}

/** Dismissible notice after invalid URL filters were replaced with defaults. */
export function FilterNotice({ api }: { api: AdminFiltersApi }) {
  const t = useTx();
  if (api.notice.length === 0) return null;
  return (
    <div
      role="status"
      data-testid="filter-notice"
      className="border-warning/30 bg-warning-soft text-ink flex items-start justify-between gap-3 rounded-md border px-4 py-3 text-[13px]"
    >
      <div>
        <p className="m-0 font-semibold">{t("admin:filters.notice.title")}</p>
        <ul className="m-0 mt-1 list-disc ps-5">
          {api.notice.map((issue) => (
            <li key={issue}>{t(`admin:filters.validation.${issue}` as TranslationKey)}</li>
          ))}
        </ul>
      </div>
      <Button variant="ghost" size="sm" onClick={api.dismissNotice}>
        {t("admin:filters.notice.dismiss")}
      </Button>
    </div>
  );
}
