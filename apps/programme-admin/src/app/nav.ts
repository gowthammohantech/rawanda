/**
 * Admin routes and sidebar sections (ref-image grouping, ADM-01): MONITOR — Overview, Pathway
 * funnel, Timeliness, Worker workload; ASSURE — Safety & quality, Reports; GOVERN — Governance.
 * Labels are i18n keys.
 */
import type { SidebarSection } from "@laif/ui-web";

import { BASE_PATH } from "./config.ts";

export const paths = {
  overview: `${BASE_PATH}/overview`,
  funnel: `${BASE_PATH}/funnel`,
  timeliness: `${BASE_PATH}/timeliness`,
  workload: `${BASE_PATH}/workload`,
  quality: `${BASE_PATH}/quality`,
  reports: `${BASE_PATH}/reports`,
  governance: `${BASE_PATH}/governance`,
} as const;

export const NAV_SECTIONS: readonly SidebarSection[] = [
  {
    id: "monitor",
    labelKey: "admin:nav.section.monitor",
    items: [
      { to: paths.overview, labelKey: "admin:nav.overview", icon: "home" },
      { to: paths.funnel, labelKey: "admin:nav.funnel", icon: "filter" },
      { to: paths.timeliness, labelKey: "admin:nav.timeliness", icon: "clock" },
      { to: paths.workload, labelKey: "admin:nav.workload", icon: "people" },
    ],
  },
  {
    id: "assure",
    labelKey: "admin:nav.section.assure",
    items: [
      { to: paths.quality, labelKey: "admin:nav.quality", icon: "shield" },
      { to: paths.reports, labelKey: "admin:nav.reports", icon: "download" },
    ],
  },
  {
    id: "govern",
    labelKey: "admin:nav.section.govern",
    items: [{ to: paths.governance, labelKey: "admin:nav.governance", icon: "lock" }],
  },
];
