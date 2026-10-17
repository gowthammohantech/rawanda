/**
 * `(auth)/scope`: confirms the persona's district / facility and signs in. Success → toast
 * "Signed in to {facility}" (announced) and the Today tab; a scope refusal → `/denied`.
 */
import { Button, EmptyState, Screen, useToast, useTx } from "@laif/ui-native";

import { AppHeader } from "../../components/AppHeader.tsx";
import { useSessionStore } from "../../providers.tsx";
import { useSession } from "../../session/useSession.ts";
import { facilityName } from "./labels.ts";
import { ScopeConfirm } from "./ScopeConfirm.tsx";

export type ScopeScreenProps = {
  personaId: string | undefined;
  onBack: () => void;
  onSignedIn: () => void;
  onDenied: () => void;
  /** Overrides the dev / E2E test-hook visibility (tests). */
  showTestHook?: boolean;
};

export function ScopeScreen({
  personaId,
  onBack,
  onSignedIn,
  onDenied,
  showTestHook,
}: ScopeScreenProps) {
  const t = useTx();
  const { toast } = useToast();
  const store = useSessionStore();
  const { signIn } = useSession();
  const persona = store.available().find((p) => p.id === personaId);

  return (
    <Screen
      testID="scope-screen"
      header={<AppHeader title={t("worker:appName")} onBack={onBack} />}
    >
      {persona === undefined ? (
        <EmptyState
          icon="people"
          title={t("worker:auth.scope.unknownPersona")}
          action={
            <Button variant="secondary" onPress={onBack}>
              {t("common:actions.back")}
            </Button>
          }
        />
      ) : (
        <ScopeConfirm
          persona={persona}
          {...(showTestHook === undefined ? {} : { showTestHook })}
          onConfirm={async (facilityId) => {
            const result = await signIn(persona.id, facilityId);
            if (result.ok) {
              const facilityId = result.session.facilityId;
              // Resolved at render time: re-translates if the language switches while visible.
              toast({
                title: (tx) =>
                  tx("worker:auth.signedIn", { facility: facilityName(facilityId, tx) }),
                tone: "positive",
              });
              onSignedIn();
            } else if (result.code === "FORBIDDEN") {
              onDenied();
            } else {
              toast({ title: t("worker:auth.signInFailed"), tone: "danger" });
            }
          }}
        />
      )}
    </Screen>
  );
}
