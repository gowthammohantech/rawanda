import { useLocalSearchParams } from "expo-router";

import { TaskDetailScreen } from "../../../../src/features/tasks/TaskDetailScreen.tsx";

/** Task detail (HWM-07). The id is re-checked against the signed-in worker + facility. */
export default function TaskDetailRoute() {
  const { followUpId } = useLocalSearchParams<{ followUpId: string }>();
  return <TaskDetailScreen key={followUpId ?? ""} followUpId={followUpId ?? ""} />;
}
