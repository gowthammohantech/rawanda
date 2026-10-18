/**
 * Ask for a callback (CTZ-08 task 7). Send → `repo.createCallbackRequest(input, key)` → one
 * `careTasks` record `kind: callback_request`, status `open`, + `citizen.support.callback_requested`
 * and `task.created`. Double tap / Retry reuse ONE key per screen mount (exactly one task).
 * Without consent the form is disabled with the reason (task 11). Server error → banner + Retry
 * (same key). Success: "Your care team will try to call you. This is a demo — no one will
 * actually call."
 */
import {
  AppText,
  Button,
  Icon,
  InfoCallout,
  LoadingState,
  Screen,
  announce,
  spacing,
  useTx,
  usePalette,
  type Palette,
} from "@laif/ui-native";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { ConsentFreeHeader } from "../../components/ConsentFreeHeader.tsx";
import { InlineError } from "../../components/InlineError.tsx";
import { CallbackForm } from "./CallbackForm.tsx";
import { validateCallback, type CallbackDraft, type CallbackErrors } from "./callbackSchema.ts";
import { NotAnEmergencyCard } from "./NotAnEmergencyCard.tsx";
import { useCallbackAccess, useCallbackSend } from "./useSupport.ts";
import { useThemedStyles } from "../../theme/useThemedStyles.ts";

export function CallbackScreen() {
  const palette = usePalette();
  const styles = useThemedStyles(makeStyles);
  const t = useTx();
  const router = useRouter();
  const access = useCallbackAccess();
  const sender = useCallbackSend();
  const [draft, setDraft] = useState<CallbackDraft>({ topic: null, window: null, note: "" });
  const [errors, setErrors] = useState<CallbackErrors>({});

  const announced = useRef(false);
  useEffect(() => {
    if (sender.status === "success" && !announced.current) {
      announced.current = true;
      announce(t("citizen:support.callback.successTitle"));
    }
  }, [sender.status, t]);

  const submit = async () => {
    if (access.status !== "allowed") return;
    const result = validateCallback(draft);
    if (!result.ok) {
      setErrors(result.errors);
      const first = result.errors.topic ?? result.errors.window ?? result.errors.note;
      if (first !== undefined) announce(t(first));
      return;
    }
    setErrors({});
    await sender.send({
      patientId: access.patientId,
      topic: result.value.topic,
      window: result.value.window,
      ...(result.value.note === "" ? {} : { note: result.value.note }),
    });
  };

  let body;
  if (sender.status === "success") {
    body = (
      <View style={styles.success} testID="callback-success">
        <View style={styles.successIcon}>
          <Icon name="check" size={32} strokeWidth={2.6} color={palette.onPrimary} />
        </View>
        <AppText variant="display" accessibilityRole="header" align="center">
          {t("citizen:support.callback.successTitle")}
        </AppText>
        <AppText variant="bodyLarge" align="center" testID="callback-success-body">
          {t("citizen:support.callback.successBody")}
        </AppText>
        <NotAnEmergencyCard />
        <Button
          fullWidth
          variant="secondary"
          onPress={() => router.replace("/more/support")}
          testID="callback-done"
        >
          {t("citizen:support.callback.done")}
        </Button>
      </View>
    );
  } else if (access.status === "loading") {
    body = <LoadingState label={t("common:state.loading")} />;
  } else {
    const allowed = access.status === "allowed";
    body = (
      <View style={styles.flow}>
        <AppText color="muted">{t("citizen:support.callback.intro")}</AppText>
        {allowed ? null : (
          <InfoCallout icon="lock" testID="callback-disabled">
            {access.status === "noPersona"
              ? t("citizen:support.callback.noPersona")
              : t("citizen:support.callback.disabled")}
          </InfoCallout>
        )}
        <CallbackForm
          values={draft}
          onChange={(patch) => {
            setDraft((d) => ({ ...d, ...patch }));
            setErrors((e) => {
              const next = { ...e };
              for (const field of Object.keys(patch) as (keyof CallbackDraft)[]) delete next[field];
              return next;
            });
          }}
          errors={errors}
          disabled={!allowed || sender.status === "pending"}
        />
        <InlineError
          testID="callback-send-error"
          message={sender.status === "error" ? t("citizen:support.callback.sendError") : null}
        />
        <Button
          fullWidth
          icon="check"
          disabled={!allowed}
          loading={sender.status === "pending"}
          accessibilityHint={t("citizen:support.callback.sendHint")}
          onPress={submit}
          testID="callback-send"
        >
          {sender.status === "error"
            ? t("citizen:support.callback.retry")
            : t("citizen:support.callback.send")}
        </Button>
      </View>
    );
  }

  return (
    <Screen
      testID="callback-screen"
      edges={["top", "left", "right"]}
      header={
        <ConsentFreeHeader title={t("citizen:support.callback.title")} fallback="/more/support" />
      }
    >
      {body}
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    flow: { gap: spacing.lg },
    success: { gap: spacing.lg, alignItems: "stretch" },
    successIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignSelf: "center",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.positive,
    },
  });
