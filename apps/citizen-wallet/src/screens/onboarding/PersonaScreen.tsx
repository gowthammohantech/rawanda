/**
 * Persona picker (CTZ-02 task 3): the five citizen demo personas from `repo.listPersonas()`.
 * Choosing one records `session.started` + `citizen.persona.selected` and routes to verify /
 * recover / consent / consent-withdrawn / tabs. DEMO PERSONA — not real sign-in.
 */
import {
  AppHeader,
  AppText,
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
  spacing,
  useTx,
} from "@laif/ui-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { InlineError } from "../../components/InlineError.tsx";
import { PersonaCard } from "../../components/PersonaCard.tsx";
import { useCitizenPersonas } from "../../data/queries.ts";
import { useDemoTools } from "../../demo-tools.tsx";
import { useWalletActions } from "../../state/useWalletActions.ts";
import { useTitleFocus } from "../../a11y/useTitleFocus.ts";

export function PersonaScreen() {
  const t = useTx();
  const titleRef = useTitleFocus();
  const router = useRouter();
  const personas = useCitizenPersonas();
  const { reset } = useDemoTools();
  const { selectPersona } = useWalletActions();
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const choose = async (personaId: string) => {
    if (busy !== null) return;
    setBusy(personaId);
    setFailed(false);
    try {
      router.replace(await selectPersona(personaId));
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  };

  let body;
  if (personas.isPending) body = <LoadingState variant="skeleton" rows={5} />;
  else if (personas.isError) {
    body = (
      <ErrorState
        message={t("citizen:onboarding.persona.loadError")}
        onRetry={() => personas.refetch()}
      />
    );
  } else if (personas.data.length === 0) {
    body = (
      <EmptyState
        icon="people"
        title={t("citizen:onboarding.persona.emptyTitle")}
        description={t("citizen:onboarding.persona.emptyBody")}
        action={
          <Button variant="danger" icon="refresh" onPress={reset}>
            {t("demo:tools.reset")}
          </Button>
        }
      />
    );
  } else {
    body = (
      <View style={styles.list}>
        {personas.data.map((persona) => (
          <PersonaCard
            key={persona.personaId}
            persona={persona}
            disabled={busy !== null}
            onPress={() => choose(persona.personaId)}
          />
        ))}
      </View>
    );
  }

  return (
    <Screen
      testID="persona-screen"
      header={
        <AppHeader
          titleRef={titleRef}
          title={t("citizen:onboarding.persona.title")}
          onBack={() => router.replace("/welcome")}
        />
      }
    >
      <AppText color="muted">{t("citizen:onboarding.persona.intro")}</AppText>
      <InlineError message={failed ? t("citizen:onboarding.persona.startError") : null} />
      {body}
    </Screen>
  );
}

const styles = StyleSheet.create({ list: { gap: spacing.md } });
