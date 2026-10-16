/**
 * Clinical routes and sidebar sections (ref-image grouping): WORK — Review queue (count),
 * Patients, Referrals, Care-team tasks; OVERSIGHT — Audit. Labels are i18n keys.
 */
import type { SidebarSection } from "@laif/ui-web";

import { BASE_PATH } from "./config.ts";

export const paths = {
  login: `${BASE_PATH}/login`,
  queue: `${BASE_PATH}/queue`,
  patients: `${BASE_PATH}/patients`,
  patient: (id: string) => `${BASE_PATH}/patients/${encodeURIComponent(id)}`,
  review: (id: string) => `${BASE_PATH}/reviews/${encodeURIComponent(id)}`,
  decision: (id: string) => `${BASE_PATH}/reviews/${encodeURIComponent(id)}/decision`,
  referrals: `${BASE_PATH}/referrals`,
  tasks: `${BASE_PATH}/tasks`,
  audit: `${BASE_PATH}/audit`,
} as const;

export const NAV_SECTIONS: readonly SidebarSection[] = [
  {
    id: "work",
    labelKey: "clinical:nav.section.work",
    items: [
      { to: paths.queue, labelKey: "clinical:nav.queue", icon: "clipboard", countTone: "warning" },
      { to: paths.patients, labelKey: "clinical:nav.patients", icon: "people" },
      { to: paths.referrals, labelKey: "clinical:nav.referrals", icon: "external" },
      { to: paths.tasks, labelKey: "clinical:nav.tasks", icon: "check" },
    ],
  },
  {
    id: "oversight",
    labelKey: "clinical:nav.section.oversight",
    items: [{ to: paths.audit, labelKey: "clinical:nav.audit", icon: "shield" }],
  },
];

/** Sidebar item that shows the pending-review count. */
export const COUNT_ITEM_PATH = paths.queue;
