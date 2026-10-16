import { AppHeader, Button, EmptyState, Screen, useTx } from "@laif/ui-native";

/** Unknown deep link: still framed by the DemoBanner. */
export function NotFoundScreen({ onHome }: { onHome: () => void }) {
  const t = useTx();
  return (
    <Screen testID="not-found-screen" header={<AppHeader title={t("citizen:notFound.title")} />}>
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
