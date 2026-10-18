import { AppHeader, Button, EmptyState, Screen, useTx } from "@laif/ui-native";
import { useTitleFocus } from "../a11y/useTitleFocus.ts";

/** Unknown deep link: still framed by the DemoBanner. */
export function NotFoundScreen({ onHome }: { onHome: () => void }) {
  const t = useTx();
  const titleRef = useTitleFocus();
  return (
    <Screen
      testID="not-found-screen"
      header={<AppHeader titleRef={titleRef} title={t("citizen:notFound.title")} />}
    >
      <EmptyState
        icon="search"
        title={t("citizen:notFound.title")}
        description={t("citizen:notFound.description")}
        action={
          <Button variant="secondary" onPress={onHome}>
            {t("citizen:notFound.home")}
          </Button>
        }
      />
    </Screen>
  );
}
