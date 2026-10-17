/** `(auth)/sign-in`: DemoBanner + header (EN/RW switcher, network badge) + PersonaPicker. */
import { Screen, useTx } from "@laif/ui-native";

import { AppHeader } from "../../components/AppHeader.tsx";
import { useSessionStore } from "../../providers.tsx";
import { PersonaPicker } from "./PersonaPicker.tsx";

export function SignInScreen({
  onPersonaChosen,
}: {
  onPersonaChosen: (personaId: string) => void;
}) {
  const t = useTx();
  const store = useSessionStore();
  return (
    <Screen testID="sign-in-screen" header={<AppHeader title={t("worker:appName")} />}>
      <PersonaPicker personas={store.available()} onContinue={onPersonaChosen} />
    </Screen>
  );
}
