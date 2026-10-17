/**
 * Tab placeholder (CTZ-02 task 10) until CTZ-03..06 deliver the content. Only mounted behind the
 * consent guard; the "Built in CTZ-0x" note shows in development builds only (`__DEV__`).
 */
import { EmptyState, Screen, useTx, type TranslationKey } from "@laif/ui-native";

import { WalletHeader } from "../../components/WalletHeader.tsx";

export type PlaceholderTabScreenProps = { titleKey: TranslationKey; phase: string; testID: string };

export function PlaceholderTabScreen({ titleKey, phase, testID }: PlaceholderTabScreenProps) {
  const t = useTx();
  return (
    <Screen
      testID={testID}
      edges={["top", "left", "right"]}
      header={<WalletHeader title={t(titleKey)} />}
    >
      {__DEV__ ? (
        <EmptyState
          icon="clock"
          title={t("citizen:placeholder.comingSoon", { phase })}
          description={t("citizen:placeholder.description")}
        />
      ) : null}
    </Screen>
  );
}
