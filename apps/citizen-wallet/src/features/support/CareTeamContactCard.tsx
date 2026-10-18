/**
 * Care team contact (CTZ-08 task 6): "Who to contact: your care team at <facility>" + the CTZ-04
 * facility card (synthetic phone, hours, address; "Call" opens a demo sheet and NEVER dials).
 * The facility is the linked patient's care facility; before a persona is chosen, the demo's
 * first facility.
 */
import type { FacilityId } from "@laif/domain";
import { FACILITY_IDS, facilityLabelKey } from "@laif/mock-data";
import { AppText, spacing, useTx, type TranslationKey } from "@laif/ui-native";
import { StyleSheet, View } from "react-native";

import { useCitizenSession } from "../../data/queries.ts";
import { usePersona } from "../../providers.tsx";
import { FacilityContactCard } from "../next-steps/FacilityContactCard.tsx";

export function useCareTeamFacilityId(): FacilityId {
  const persona = usePersona();
  const session = useCitizenSession();
  const active = session.data?.patients.find((p) => p.patientId === session.data?.activePatientId);
  return (persona === null ? null : active?.facilityId) ?? FACILITY_IDS.alpha1;
}

export function CareTeamContactCard() {
  const t = useTx();
  const facilityId = useCareTeamFacilityId();
  const facility = t(facilityLabelKey(facilityId) as TranslationKey);
  return (
    <View style={styles.root} testID="care-team-contact">
      <AppText weight="semibold" testID="care-team-who">
        {t("citizen:support.careTeam.whoToContact", { facility })}
      </AppText>
      <FacilityContactCard facilityId={facilityId} facilityName={facility} />
    </View>
  );
}

const styles = StyleSheet.create({ root: { gap: spacing.sm } });
