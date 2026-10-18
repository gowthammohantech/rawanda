import { useLocalSearchParams } from "expo-router";

import { OpDetailScreen } from "../../../src/features/sync/OpDetail.tsx";

/** Sync item detail (HWM-09): ids, attempt history from the audit trail, payload summary. */
export default function OpDetailRoute() {
  const { opId } = useLocalSearchParams<{ opId: string }>();
  return <OpDetailScreen key={opId ?? ""} opId={opId ?? ""} />;
}
