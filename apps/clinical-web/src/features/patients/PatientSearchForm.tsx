/**
 * Patient search form (CLN-03 task 1–3): react-hook-form + the `@laif/contracts`
 * `PatientSearchSchema` rule for `q` (blank = no query, otherwise 2–60 characters, inline
 * `validation:minLength`). Typing is debounced 300 ms before it reaches the URL (`replace`, so
 * keystrokes do not flood the history); Enter / "Search" applies at once (`push`). The facility
 * filter only lists the persona's permitted facilities.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { PatientSearchSchema } from "@laif/contracts";
import { Button, Select, TextInput, useTx, type SelectOption } from "@laif/ui-web";
import { useEffect, useRef } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { useDebouncedValue } from "./hooks.ts";

/** The form's `q` (a string) checked with the contract's `q` rule (`validation:*` messages). */
const PatientSearchFormSchema = z.object({ q: z.string() }).transform((values, ctx) => {
  const parsed = PatientSearchSchema.shape.q.safeParse(values.q);
  if (parsed.success) return { q: parsed.data };
  for (const issue of parsed.error.issues) {
    ctx.addIssue({ code: "custom", path: ["q"], message: issue.message });
  }
  return z.NEVER;
});

export type PatientSearchFormProps = {
  /** The `q` currently in the URL (undefined = none). */
  urlQ: string | undefined;
  /** `location.key` of the current URL. */
  navigationKey: string;
  /**
   * True when the current URL was written by this form (not back / forward). Only OTHER
   * navigations (top-bar search, back, clear filters, links) copy `urlQ` into the input, so a
   * late URL echo never overwrites newer typing.
   */
  fromForm: boolean;
  facilityOptions: readonly SelectOption[];
  facilityId: string;
  /** `mode: "replace"` while typing (debounced), `"push"` on submit. */
  onQueryChange: (q: string | undefined, mode: "replace" | "push") => void;
  onFacilityChange: (facilityId: string) => void;
};

const normalize = (value: string): string | undefined => {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
};

export function PatientSearchForm({
  urlQ,
  navigationKey,
  fromForm,
  facilityOptions,
  facilityId,
  onQueryChange,
  onFacilityChange,
}: PatientSearchFormProps) {
  const t = useTx();
  const form = useForm({
    resolver: zodResolver(PatientSearchFormSchema),
    mode: "onChange",
    defaultValues: { q: urlQ ?? "" },
  });
  const { register, handleSubmit, control, reset, getValues, formState } = form;
  const value = useWatch({ control, name: "q" });
  const debounced = useDebouncedValue(value);
  /** The last q this form wrote to the URL (no duplicate writes). */
  const pushed = useRef<string | undefined>(urlQ);

  // URL → form (only for navigations this form did not make).
  useEffect(() => {
    if (fromForm) return;
    pushed.current = urlQ;
    if (normalize(getValues("q")) !== urlQ) reset({ q: urlQ ?? "" });
  }, [navigationKey, fromForm, urlQ, getValues, reset]);

  // Debounced typing → URL (only valid queries).
  useEffect(() => {
    const parsed = PatientSearchFormSchema.safeParse({ q: debounced });
    if (!parsed.success) return;
    const next = parsed.data.q;
    if (next === pushed.current) return;
    pushed.current = next;
    onQueryChange(next, "replace");
  }, [debounced, onQueryChange]);

  return (
    <form
      role="search"
      aria-label={t("clinical:patients.search.label")}
      noValidate
      onSubmit={(event) => {
        void handleSubmit((values) => {
          pushed.current = values.q;
          onQueryChange(values.q, "push");
        })(event);
      }}
      className="border-border-soft bg-surface shadow-card flex flex-col gap-4 rounded-lg border p-4 md:flex-row md:items-start"
    >
      <TextInput
        type="search"
        label={t("clinical:patients.search.label")}
        placeholder={t("clinical:patients.search.placeholder")}
        autoComplete="off"
        error={formState.errors.q}
        fieldClassName="min-w-0 flex-1"
        data-testid="patient-search-input"
        {...register("q")}
      />
      <Select
        label={t("clinical:patients.search.facilityFilter")}
        hint={t("clinical:patients.search.facilityHint")}
        options={facilityOptions}
        value={facilityId}
        disabled={facilityOptions.length < 2}
        onChange={(event) => onFacilityChange(event.target.value)}
        fieldClassName="md:w-72"
      />
      <Button type="submit" icon="search" className="md:mt-7">
        {t("clinical:patients.search.submit")}
      </Button>
    </form>
  );
}
