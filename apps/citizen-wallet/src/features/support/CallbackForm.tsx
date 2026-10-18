/**
 * Callback request form (CTZ-08 task 7): topic (radio, required), preferred time window
 * (morning / afternoon, required) and an optional note ≤ 300. Errors are stored as KEYS and
 * translated at render, so an error on screen follows a language switch. The note is the
 * citizen's own words (stored verbatim, never translated).
 */
import {
  AppText,
  RadioCardGroup,
  TextField,
  spacing,
  useTx,
  type TranslationKey,
} from "@laif/ui-native";
import { StyleSheet, View } from "react-native";

import { InlineError } from "../../components/InlineError.tsx";
import {
  CALLBACK_NOTE_MAX,
  CALLBACK_TOPICS,
  CALLBACK_WINDOWS,
  type CallbackDraft,
  type CallbackErrors,
  type CallbackTopic,
  type CallbackWindow,
} from "./callbackSchema.ts";

export type CallbackFormProps = {
  values: CallbackDraft;
  onChange: (patch: Partial<CallbackDraft>) => void;
  errors: CallbackErrors;
  disabled?: boolean;
};

export function CallbackForm({ values, onChange, errors, disabled = false }: CallbackFormProps) {
  const t = useTx();
  const tr = (key: string | undefined) => (key === undefined ? null : t(key as TranslationKey));
  const noteLength = values.note.trim().length;
  return (
    <View style={styles.root} testID="callback-form">
      <View>
        <RadioCardGroup<CallbackTopic>
          legend={t("citizen:support.callback.topicLegend")}
          required
          options={CALLBACK_TOPICS.map((topic) => ({
            value: topic,
            label: t(`citizen:support.callback.topics.${topic}`),
            ...(disabled ? { disabled: true } : {}),
          }))}
          value={values.topic}
          onChange={(topic) => onChange({ topic })}
          testID="callback-topic"
        />
        <InlineError message={tr(errors.topic)} testID="error-topic" />
      </View>
      <View>
        <RadioCardGroup<CallbackWindow>
          legend={t("citizen:support.callback.windowLegend")}
          required
          options={CALLBACK_WINDOWS.map((window) => ({
            value: window,
            label: t(`citizen:support.callback.windows.${window}`),
            ...(disabled ? { disabled: true } : {}),
          }))}
          value={values.window}
          onChange={(window) => onChange({ window })}
          testID="callback-window"
        />
        <InlineError message={tr(errors.window)} testID="error-window" />
      </View>
      <View>
        <TextField
          label={t("citizen:support.callback.note")}
          hint={t("citizen:support.callback.noteHint")}
          multiline
          editable={!disabled}
          value={values.note}
          onChangeText={(note) => onChange({ note })}
          aside={
            <AppText
              variant="caption"
              color={noteLength > CALLBACK_NOTE_MAX ? "danger" : "subtle"}
              testID="callback-note-counter"
            >
              {t("citizen:support.callback.counter", { count: noteLength, max: CALLBACK_NOTE_MAX })}
            </AppText>
          }
          testID="callback-note"
        />
        <InlineError message={tr(errors.note)} testID="error-note" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({ root: { gap: spacing.lg } });
