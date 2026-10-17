/**
 * Linked referral (HWM-07 task 6): fictional destination facility, clinician-set due date and
 * status, labelled "Set by clinician" — the worker never changes these.
 */
import type { Referral } from "@laif/domain";
import { domainKey, formatDate, useLanguage } from "@laif/i18n";
import { Card, MicroLabel, StatusChip, useTx } from "@laif/ui-native";
import { View } from "react-native";

import { DetailItem, detailStyles } from "./DetailItem.tsx";

export function ReferralContextCard({ referral }: { referral: Referral }) {
  const t = useTx();
  const { language } = useLanguage();
  return (
    <Card
      title={t("worker:tasks.detail.referral.title")}
      meta={
        <MicroLabel testID="referral-set-by-clinician">
          {t("worker:tasks.setByClinician")}
        </MicroLabel>
      }
      testID="referral-context-card"
    >
      <View style={detailStyles.body}>
        <View style={detailStyles.grid}>
          <DetailItem
            label={t("worker:tasks.detail.referral.destination")}
            value={referral.destination}
            testID="referral-destination"
          />
          <DetailItem
            label={t("worker:tasks.detail.referral.dueDate")}
            value={formatDate(referral.dueAt, language)}
            testID="referral-due"
          />
        </View>
        <View style={detailStyles.pills}>
          <StatusChip tone="neutral" testID="referral-status">
            {t(domainKey("status.referral", referral.status))}
          </StatusChip>
        </View>
      </View>
    </Card>
  );
}
