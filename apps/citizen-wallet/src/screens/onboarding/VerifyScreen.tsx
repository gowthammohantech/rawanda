/**
 * Simulated identity verification (CTZ-02 task 4, T-07, T-09). The labelled demo code verifies;
 * a wrong code is a recorded attempt (lock after 5 → recover); `DEPENDENCY_UNAVAILABLE` shows
 * an ErrorState and NEVER verifies. Retrying a failed/unanswered attempt reuses its idempotency
 * key; a new attempt (after a definite answer) gets a new key.
 */
import { MAX_VERIFICATION_ATTEMPTS, VerifyIdentityInputSchema } from "@laif/contracts";
import { CITIZEN_DEMO_VERIFICATION_CODE } from "@laif/mock-data";
import { RepositoryError } from "@laif/repositories";
import {
  AppHeader,
  AppText,
  Button,
  Card,
  ErrorState,
  LoadingState,
  Screen,
  spacing,
  useTx,
} from "@laif/ui-native";
import { Redirect, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { CodeInput } from "../../components/CodeInput.tsx";
import { InlineError } from "../../components/InlineError.tsx";
import { newIdempotencyKey } from "../../data/keys.ts";
import { useCitizenSession, useVerifyIdentity } from "../../data/queries.ts";
import { usePersona } from "../../providers.tsx";
import { accountGate, HREFS } from "../../state/access.ts";
import { useWalletActions } from "../../state/useWalletActions.ts";

type ServiceError = "unavailable" | "generic" | null;

export function VerifyScreen() {
  const t = useTx();
  const router = useRouter();
  const persona = usePersona();
  const session = useCitizenSession();
  const verify = useVerifyIdentity();
  const { endSession } = useWalletActions();
  const [code, setCode] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [serviceError, setServiceError] = useState<ServiceError>(null);
  const keyRef = useRef(newIdempotencyKey());
  const submitting = useRef(false);

  if (persona === null) return <Redirect href="/welcome" />;
  if (session.isPending) {
    return (
      <Screen testID="verify-screen">
        <LoadingState />
      </Screen>
    );
  }
  if (session.isError) {
    return (
      <Screen testID="verify-screen">
        <ErrorState onRetry={() => session.refetch()} />
      </Screen>
    );
  }
  const gate = accountGate(session.data);
  if (gate !== HREFS.verify) return <Redirect href={gate ?? "/consent"} />;
  const attempts = session.data?.verification?.attempts ?? 0;

  const submit = async () => {
    if (submitting.current) return;
    if (!VerifyIdentityInputSchema.shape.code.safeParse(code).success) {
      setFieldError(t("citizen:validation.codeSixDigits"));
      return;
    }
    submitting.current = true;
    setFieldError(null);
    setServiceError(null);
    try {
      const result = await verify.mutateAsync({ input: { code }, key: keyRef.current });
      keyRef.current = newIdempotencyKey();
      const status = result.data.status;
      if (status === "verified") router.replace(HREFS.consent);
      else if (status === "locked") router.replace(HREFS.recover);
      else {
        setCode("");
        setFieldError(
          t("citizen:onboarding.verify.wrongCode", {
            count: Math.max(0, MAX_VERIFICATION_ATTEMPTS - result.data.attempts),
          }),
        );
      }
    } catch (error) {
      if (error instanceof RepositoryError && error.code === "DEPENDENCY_UNAVAILABLE") {
        setServiceError("unavailable");
      } else if (error instanceof RepositoryError && error.code === "VALIDATION_ERROR") {
        // Already verified / locked elsewhere: the session decides where to go.
        keyRef.current = newIdempotencyKey();
        await session.refetch();
      } else {
        setServiceError("generic");
      }
    } finally {
      submitting.current = false;
    }
  };

  return (
    <Screen
      testID="verify-screen"
      header={
        <AppHeader
          title={t("citizen:onboarding.verify.title")}
          onBack={() => {
            router.replace(HREFS.persona);
            void endSession();
          }}
        />
      }
      footer={
        <Button fullWidth onPress={submit} loading={verify.isPending} testID="verify-submit">
          {t("citizen:onboarding.verify.submit")}
        </Button>
      }
    >
      <AppText>{t("citizen:onboarding.verify.intro")}</AppText>
      {serviceError === null ? null : (
        <ErrorState
          {...(serviceError === "unavailable"
            ? {
                title: t("citizen:onboarding.verify.unavailableTitle"),
                code: "DEPENDENCY_UNAVAILABLE",
                message: t("citizen:onboarding.verify.unavailable"),
              }
            : { message: t("citizen:onboarding.verify.error") })}
          onRetry={submit}
        />
      )}
      <View style={styles.field}>
        <AppText weight="semibold" nativeID="verify-code-label">
          {t("citizen:onboarding.verify.codeLabel")}
        </AppText>
        <CodeInput
          label={t("citizen:onboarding.verify.codeLabel")}
          value={code}
          onChange={(next) => {
            setCode(next);
            if (fieldError !== null) setFieldError(null);
          }}
          onSubmit={() => void submit()}
          invalid={fieldError !== null}
          disabled={verify.isPending}
        />
        <InlineError message={fieldError} testID="verify-field-error" />
        <AppText variant="caption" color="muted">
          {t("citizen:onboarding.verify.attempts", {
            used: attempts,
            max: MAX_VERIFICATION_ATTEMPTS,
          })}
        </AppText>
      </View>
      <Card
        variant="muted"
        eyebrow={t("citizen:onboarding.verify.hintEyebrow")}
        title={t("citizen:onboarding.verify.hintTitle")}
        testID="demo-code-hint"
      >
        <AppText>
          {t("citizen:onboarding.verify.hintBody", { code: CITIZEN_DEMO_VERIFICATION_CODE })}
        </AppText>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({ field: { gap: spacing.sm } });
