/**
 * Offline synthetic registration (HWM-04 tasks 4–9). React Hook Form + the Zod form schema
 * (`registerSchema.ts`, messages are i18n keys → errors re-translate on a language switch while
 * the typed values stay).
 *
 * Save: validate → `findCandidates()` (local, ≥ DEMO_MATCH_THRESHOLD) → if any, the
 * PossibleMatchesSheet (Use this patient = navigate, no write; Register anyway = flagged) →
 * `register()` (patient + `patient.register` sync op + audit in one transaction) → toast
 * "Saved on this device" → patient context.
 *
 * Double-submit guard: Save is disabled while checking / saving, a ref blocks re-entry, and the
 * write is idempotent by the draft key created when the form mounts.
 * Invalid submit: error summary at the top (count, announced), first invalid field focused.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import type { Sex } from "@laif/domain";
import {
  announce,
  AppText,
  Button,
  colors,
  Icon,
  InfoCallout,
  RadioCardGroup,
  radii,
  SegmentedControl,
  spacing,
  TextField,
  useToast,
  useTx,
  type TranslationKey,
} from "@laif/ui-native";
import { useMemo, useRef, useState } from "react";
import { Controller, useForm, useWatch, type FieldErrors } from "react-hook-form";
import { StyleSheet, View } from "react-native";

import type { MatchCandidate } from "../../data/patients.ts";
import { platform } from "../../platform";
import { useRequiredScope } from "../../session/useScope.ts";
import { NationalIdUnavailableNote } from "./NationalIdUnavailableNote.tsx";
import { PossibleMatchesSheet } from "./PossibleMatchesSheet.tsx";
import {
  createRegisterFormSchema,
  emptyRegisterForm,
  formatPhoneInput,
  pilotAgeWarning,
  REGISTER_FORM_FIELDS,
  toRegisterInput,
  type BirthMode,
  type RegisterFormValues,
} from "./registerSchema.ts";
import { useRegisterPatient } from "./usePatients.ts";

export type RegisterPatientFormProps = {
  /** Demo clock instant (DOB / age checks). */
  now: Date;
  /** Prefill from the empty search ("Register 'name'"). */
  initialName?: string;
  onRegistered: (patientId: string) => void;
  onUseExisting: (patientId: string) => void;
};

const FIELD_LABEL: Record<keyof RegisterFormValues, TranslationKey> = {
  givenName: "worker:patients.form.givenName",
  familyName: "worker:patients.form.familyName",
  birthMode: "worker:patients.form.birthMode",
  dateOfBirth: "worker:patients.form.dateOfBirth",
  estimatedAge: "worker:patients.form.estimatedAge",
  sex: "worker:patients.form.sex",
  villageLabel: "worker:patients.form.village",
  phone: "worker:patients.form.phone",
};

type Phase = "idle" | "checking" | "saving";

export function RegisterPatientForm({
  now,
  initialName,
  onRegistered,
  onUseExisting,
}: RegisterPatientFormProps) {
  const t = useTx();
  const { toast } = useToast();
  const { facilityId } = useRequiredScope();
  const { findCandidates, register } = useRegisterPatient();
  const schema = useMemo(() => createRegisterFormSchema(now), [now]);
  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(schema),
    defaultValues: emptyRegisterForm(initialName),
    mode: "onSubmit",
    reValidateMode: "onChange",
    shouldFocusError: false,
  });
  const { control, handleSubmit, formState, setFocus } = form;
  const values = useWatch({ control }) as RegisterFormValues;
  // Draft id created when the form mounts = the registration's idempotency key.
  const [draftKey] = useState(() => platform.createIds()());
  const inFlight = useRef(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [matches, setMatches] = useState<MatchCandidate[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const errorFields = REGISTER_FORM_FIELDS.filter((name) => formState.errors[name] !== undefined);
  const warning = pilotAgeWarning(values, now);

  const save = async (valid: RegisterFormValues, flagged: boolean) => {
    const input = toRegisterInput(valid, {
      facilityId,
      idempotencyKey: draftKey,
      ...(flagged ? { matchDecision: "register_anyway_flagged" as const } : {}),
    });
    setPhase("saving");
    const patient = await register(input, draftKey);
    toast({
      title: (tx) => tx("worker:patients.form.saved"),
      description: (tx) => tx("worker:patients.form.savedHint"),
    });
    onRegistered(patient.id);
  };

  const run = async (task: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setFailed(false);
    try {
      await task();
    } catch {
      setFailed(true);
      announce(t("worker:patients.form.failed"));
    } finally {
      inFlight.current = false;
      setPhase("idle");
    }
  };

  const onValid = (valid: RegisterFormValues) =>
    run(async () => {
      setPhase("checking");
      const input = toRegisterInput(valid, { facilityId, idempotencyKey: draftKey });
      const candidates = await findCandidates(input);
      if (candidates.length > 0) {
        setMatches(candidates);
        return;
      }
      await save(valid, false);
    });

  const onInvalid = (errors: FieldErrors<RegisterFormValues>) => {
    const invalid = REGISTER_FORM_FIELDS.filter((name) => errors[name] !== undefined);
    announce(t("worker:patients.form.errorSummary", { count: invalid.length }));
    const first = invalid[0];
    if (first !== undefined && first !== "birthMode" && first !== "sex") setFocus(first);
  };

  // Blocks a second tap during async validation, before `run` takes over the guard.
  const validating = useRef(false);
  const submit = () => {
    if (validating.current || inFlight.current || phase !== "idle") return;
    validating.current = true;
    setSubmitAttempted(true);
    void handleSubmit(onValid, onInvalid)().finally(() => {
      validating.current = false;
    });
  };

  const registerAnyway = () =>
    run(async () => {
      await save(form.getValues(), true);
      setMatches(null);
    });

  const busy = phase !== "idle";
  const birthMode = values.birthMode;
  const sexOptions: { value: Sex; label: string }[] = [
    { value: "female", label: t("domain:sex.female") },
    { value: "male", label: t("domain:sex.male") },
    { value: "not_recorded", label: t("domain:sex.not_recorded") },
  ];

  return (
    <View style={styles.form} testID="register-form">
      {submitAttempted && errorFields.length > 0 ? (
        <View
          style={styles.summary}
          testID="error-summary"
          accessibilityLiveRegion="polite"
          aria-live="polite"
        >
          <View style={styles.summaryHead}>
            <Icon name="alert" size={18} color={colors.danger} />
            <AppText weight="semibold" colorValue={colors.danger} testID="error-summary-title">
              {t("worker:patients.form.errorSummary", { count: errorFields.length })}
            </AppText>
          </View>
          {errorFields.map((name) => (
            <AppText key={name} variant="caption" colorValue={colors.danger}>
              {`• ${t(FIELD_LABEL[name])}`}
            </AppText>
          ))}
        </View>
      ) : null}
      <InfoCallout icon="info" testID="synthetic-note">
        {t("worker:patients.form.syntheticNote")}
      </InfoCallout>

      <Controller
        control={control}
        name="givenName"
        render={({ field, fieldState }) => (
          <TextField
            ref={field.ref}
            testID="field-givenName"
            label={t(FIELD_LABEL.givenName)}
            required
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            autoCapitalize="words"
            error={fieldState.error}
          />
        )}
      />
      <Controller
        control={control}
        name="familyName"
        render={({ field, fieldState }) => (
          <TextField
            ref={field.ref}
            testID="field-familyName"
            label={t(FIELD_LABEL.familyName)}
            required
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            autoCapitalize="words"
            error={fieldState.error}
          />
        )}
      />
      <Controller
        control={control}
        name="birthMode"
        render={({ field }) => (
          <SegmentedControl<BirthMode>
            label={t(FIELD_LABEL.birthMode)}
            testID="field-birthMode"
            value={field.value}
            onChange={(mode) => {
              field.onChange(mode);
              form.clearErrors(["dateOfBirth", "estimatedAge"]);
            }}
            options={[
              { value: "dob", label: t("worker:patients.form.birthModeDob") },
              { value: "estimated", label: t("worker:patients.form.birthModeEstimated") },
            ]}
          />
        )}
      />
      {birthMode === "dob" ? (
        <Controller
          control={control}
          name="dateOfBirth"
          render={({ field, fieldState }) => (
            <TextField
              ref={field.ref}
              testID="field-dateOfBirth"
              label={t(FIELD_LABEL.dateOfBirth)}
              hint={t("worker:patients.form.dateOfBirthHint")}
              required
              placeholder="YYYY-MM-DD"
              keyboardType="numbers-and-punctuation"
              maxLength={10}
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error}
            />
          )}
        />
      ) : (
        <Controller
          control={control}
          name="estimatedAge"
          render={({ field, fieldState }) => (
            <TextField
              ref={field.ref}
              testID="field-estimatedAge"
              label={t(FIELD_LABEL.estimatedAge)}
              hint={t("worker:patients.form.estimatedAgeHint")}
              required
              keyboardType="number-pad"
              maxLength={3}
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error}
            />
          )}
        />
      )}
      {warning === null ? null : (
        <View style={styles.warning} testID="pilot-age-warning" accessibilityLiveRegion="polite">
          <Icon name="alert" size={16} color={colors.warning} />
          <AppText variant="caption" weight="medium" style={styles.flex}>
            {t("validation:underPilotAge")}
          </AppText>
        </View>
      )}
      <Controller
        control={control}
        name="sex"
        render={({ field, fieldState }) => (
          <RadioCardGroup<Sex>
            legend={t(FIELD_LABEL.sex)}
            testID="field-sex"
            required
            value={field.value}
            onChange={field.onChange}
            options={sexOptions}
            error={fieldState.error}
          />
        )}
      />
      <Controller
        control={control}
        name="villageLabel"
        render={({ field, fieldState }) => (
          <TextField
            ref={field.ref}
            testID="field-villageLabel"
            label={t(FIELD_LABEL.villageLabel)}
            hint={t("worker:patients.form.villageHint")}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error}
          />
        )}
      />
      <Controller
        control={control}
        name="phone"
        render={({ field, fieldState }) => (
          <TextField
            ref={field.ref}
            testID="field-phone"
            label={t(FIELD_LABEL.phone)}
            hint={t("worker:patients.form.phoneHint")}
            placeholder="07X XXX XXXX"
            keyboardType="phone-pad"
            maxLength={12}
            value={field.value}
            onChangeText={(text) => field.onChange(formatPhoneInput(text))}
            onBlur={field.onBlur}
            error={fieldState.error}
          />
        )}
      />
      <NationalIdUnavailableNote />
      <AppText variant="caption" color="muted">
        {t("worker:patients.form.identifierNote")}
      </AppText>
      {failed ? (
        <AppText colorValue={colors.danger} testID="register-failed">
          {t("worker:patients.form.failed")}
        </AppText>
      ) : null}
      <Button
        icon="check"
        fullWidth
        testID="register-save"
        loading={busy}
        disabled={busy}
        onPress={submit}
      >
        {t("worker:patients.form.save")}
      </Button>

      <PossibleMatchesSheet
        candidates={matches}
        now={now}
        busy={busy}
        onClose={() => setMatches(null)}
        onUse={(patientId) => {
          setMatches(null);
          onUseExisting(patientId);
        }}
        onRegisterAnyway={() => void registerAnyway()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.lg },
  summary: {
    gap: spacing.xs,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radii.md,
    backgroundColor: colors.dangerSoft,
  },
  summaryHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  warning: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.warningSoft,
  },
  flex: { flex: 1 },
});
