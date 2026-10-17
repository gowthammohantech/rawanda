/** The five worker tabs (HWM-01): route name, label key, kit icon. */
import type { IconName, TranslationKey } from "@laif/ui-native";

export const WORKER_TABS = [
  { name: "index", label: "worker:nav.today", icon: "home" },
  { name: "patients/index", label: "worker:nav.find", icon: "search" },
  { name: "screen", label: "worker:nav.screen", icon: "plus" },
  { name: "tasks/index", label: "worker:nav.tasks", icon: "clipboard" },
  { name: "sync/index", label: "worker:nav.sync", icon: "sync" },
] as const satisfies readonly { name: string; label: TranslationKey; icon: IconName }[];
