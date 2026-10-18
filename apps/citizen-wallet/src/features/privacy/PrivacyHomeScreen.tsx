/**
 * Privacy home (More → Privacy, CTZ-07 task 2): three cards — "Who can see my information"
 * (plain-language summary + notice link), "Who has looked at my record" (latest 3 access events
 * + See all) and "Something wrong?" (Ask for a correction + my requests with status chips).
 */
import {
  AppText,
  Button,
  Card,
  ErrorState,
  LoadingState,
  MicroLabel,
  Screen,
  spacing,
  useTx,
  type Palette,
} from "@laif/ui-native";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { ConsentRequiredState } from "../../components/ConsentRequiredState.tsx";
import { WalletHeader } from "../../components/WalletHeader.tsx";
import {
  useAccessEvents,
  useCorrectionRequests,
  useCorrectionTargets,
} from "../../data/queries.ts";
import { usePersona } from "../../providers.tsx";
import { RepresentativeBanner } from "../health/RepresentativeBanner.tsx";
import { resultErrorKind, useActivePatient } from "../health/useResults.ts";
import { AccessEventRow } from "./AccessEventRow.tsx";
import { CorrectionRequestRow } from "./CorrectionRequestRow.tsx";
import { useThemedStyles } from "../../theme/useThemedStyles.ts";

const LATEST = 3;

export function PrivacyHomeScreen() {
  const styles = useThemedStyles(makeStyles);
  const t = useTx();
  const router = useRouter();
  const persona = usePersona();
  const patient = useActivePatient();
  const patientId = patient?.patientId ?? null;
  const events = useAccessEvents(patientId);
  const requests = useCorrectionRequests(patientId);
  const targets = useCorrectionTargets(patientId);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/more"));

  const consentError =
    (events.isError && resultErrorKind(events.error) === "consent") ||
    (requests.isError && resultErrorKind(requests.error) === "consent");

  let looked;
  if (events.isError) {
    looked = <ErrorState message={t("citizen:privacy.error")} onRetry={() => events.refetch()} />;
  } else if (events.data === undefined) {
    looked = <LoadingState variant="skeleton" rows={2} label={t("citizen:privacy.loading")} />;
  } else if (events.data.length === 0) {
    looked = <AppText color="muted">{t("citizen:privacy.access.empty")}</AppText>;
  } else {
    looked = (
      <View testID="privacy-latest-access">
        {events.data.slice(0, LATEST).map((event, index) => (
          <View key={event.id} style={index > 0 ? styles.divider : null}>
            <AccessEventRow
              event={event}
              personaId={persona?.id ?? null}
              ownName={persona?.displayName ?? ""}
              patientName={patient?.displayName ?? ""}
            />
          </View>
        ))}
      </View>
    );
  }

  let mine;
  if (requests.isError) {
    mine = <ErrorState message={t("citizen:privacy.error")} onRetry={() => requests.refetch()} />;
  } else if (requests.data === undefined) {
    mine = <LoadingState variant="skeleton" rows={1} label={t("citizen:privacy.loading")} />;
  } else if (requests.data.length === 0) {
    mine = (
      <AppText color="muted" testID="privacy-no-requests">
        {t("citizen:correction.list.empty")}
      </AppText>
    );
  } else {
    mine = (
      <View style={styles.requests} testID="privacy-requests">
        <MicroLabel>{t("citizen:privacy.myRequests")}</MicroLabel>
        {requests.data.slice(0, LATEST).map((r) => (
          <CorrectionRequestRow
            key={r.id}
            request={r}
            targets={targets.data}
            onPress={() =>
              router.push({
                pathname: "/more/privacy/corrections/[requestId]",
                params: { requestId: r.id },
              })
            }
          />
        ))}
        {requests.data.length > LATEST ? (
          <Button
            variant="ghost"
            onPress={() => router.push("/more/privacy/corrections")}
            testID="privacy-all-requests"
          >
            {t("citizen:privacy.seeAllRequests")}
          </Button>
        ) : null}
      </View>
    );
  }

  return (
    <Screen
      testID="privacy-screen"
      edges={["top", "left", "right"]}
      header={<WalletHeader title={t("citizen:privacy.title")} onBack={back} />}
    >
      <View style={styles.root}>
        <View style={styles.intro}>
          <MicroLabel>{t("citizen:privacy.eyebrow")}</MicroLabel>
          <AppText variant="display" accessibilityRole="header">
            {t("citizen:privacy.title")}
          </AppText>
          <AppText color="muted">{t("citizen:privacy.subtitle")}</AppText>
        </View>
        <RepresentativeBanner patient={patient} />

        <Card title={t("citizen:privacy.whoCanSee.title")} testID="privacy-who-can-see">
          <AppText>{t("citizen:privacy.whoCanSee.body")}</AppText>
          <Button
            variant="secondary"
            icon="file"
            onPress={() => router.push("/more/privacy/notice")}
            testID="privacy-notice-link"
          >
            {t("citizen:privacy.whoCanSee.noticeLink")}
          </Button>
        </Card>

        {consentError ? (
          <ConsentRequiredState />
        ) : (
          <>
            <Card
              title={t("citizen:privacy.whoLooked")}
              meta={
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={() => router.push("/more/privacy/access-history")}
                  testID="privacy-see-all-access"
                >
                  {t("citizen:privacy.seeAll")}
                </Button>
              }
              testID="privacy-who-looked"
            >
              <AppText variant="caption" color="muted">
                {t("citizen:privacy.whoLookedBody")}
              </AppText>
              {looked}
            </Card>

            <Card
              title={t("citizen:privacy.somethingWrong.title")}
              testID="privacy-something-wrong"
            >
              <AppText>{t("citizen:privacy.somethingWrong.body")}</AppText>
              <Button
                icon="file"
                onPress={() => router.push("/more/privacy/corrections/new")}
                testID="privacy-ask-correction"
              >
                {t("citizen:correction.cta")}
              </Button>
              {mine}
            </Card>
          </>
        )}
      </View>
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    root: { gap: spacing.lg },
    intro: { gap: spacing.xs },
    requests: { gap: spacing.sm },
    divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.borderSoft },
  });
