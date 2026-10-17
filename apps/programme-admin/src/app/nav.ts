/**
 * Admin routes and sidebar sections (ref-image grouping, ADM-01): MONITOR — Overview, Pathway
 * funnel, Timeliness, Worker workload; ASSURE — Safety & quality, Reports; GOVERN — Governance;
 * bottom: Settings. Each item names its route id, so the shell can lock items the persona's
 * role lacks (FND-06 permissions via `auth/capabilities.ts`). Labels are i18n keys.
 */
import type { ActorContext } from "@laif/auth-demo";
import type { IconName, SidebarSection, TranslationKey } from "@laif/ui-web";

import { canOpenRoute, type AdminRouteId } from "../auth/capabilities.ts";
import { filterSearchOf } from "../features/filters/filterSchema.ts";
import { BASE_PATH, LOGIN_PATH } from "./config.ts";

export const paths = {
  login: LOGIN_PATH,
  overview: `${BASE_PATH}/overview`,
  funnel: `${BASE_PATH}/funnel`,
  funnelStage: (stage: string) => `${BASE_PATH}/funnel/${encodeURIComponent(stage)}`,
  timeliness: `${BASE_PATH}/timeliness`,
  workload: `${BASE_PATH}/workload`,
  quality: `${BASE_PATH}/quality`,
  reports: `${BASE_PATH}/reports`,
  governance: `${BASE_PATH}/governance`,
  settings: `${BASE_PATH}/settings`,
  forbidden: `${BASE_PATH}/forbidden`,
} as const;

type NavItem = { route: AdminRouteId; to: string; labelKey: TranslationKey; icon: IconName };
type NavSection = { id: string; labelKey?: TranslationKey; items: readonly NavItem[] };

export const NAV_SECTIONS: readonly NavSection[] = [
  {
    id: "monitor",
    labelKey: "admin:nav.section.monitor",
    items: [
      { route: "overview", to: paths.overview, labelKey: "admin:nav.overview", icon: "home" },
      { route: "funnel", to: paths.funnel, labelKey: "admin:nav.funnel", icon: "filter" },
      {
        route: "timeliness",
        to: paths.timeliness,
        labelKey: "admin:nav.timeliness",
        icon: "clock",
      },
      { route: "workload", to: paths.workload, labelKey: "admin:nav.workload", icon: "people" },
    ],
  },
  {
    id: "assure",
    labelKey: "admin:nav.section.assure",
    items: [
      { route: "quality", to: paths.quality, labelKey: "admin:nav.quality", icon: "shield" },
      { route: "reports", to: paths.reports, labelKey: "admin:nav.reports", icon: "download" },
    ],
  },
  {
    id: "govern",
    labelKey: "admin:nav.section.govern",
    items: [
      {
        route: "governance",
        to: paths.governance,
        labelKey: "admin:nav.governance",
        icon: "lock",
      },
    ],
  },
  {
    id: "bottom",
    items: [
      {
        route: "settings",
        to: paths.settings,
        labelKey: "admin:shell.nav.settings",
        icon: "settings",
      },
    ],
  },
];

/**
 * Sidebar sections for an actor: links keep the scope query (`?district` / `?facility`), and
 * items the role cannot open are disabled with a lock icon and `lockedReason`.
 */
export function sidebarSections(
  actor: ActorContext | null,
  scopeSearch: string,
  lockedReason: string,
): SidebarSection[] {
  return NAV_SECTIONS.map((section) => ({
    id: section.id,
    ...(section.labelKey === undefined ? {} : { labelKey: section.labelKey }),
    items: section.items.map((item) => {
      const allowed = canOpenRoute(actor, item.route).allowed;
      return {
        to: `${item.to}${scopeSearch}`,
        labelKey: item.labelKey,
        icon: item.icon,
        ...(allowed ? {} : { disabled: true, disabledReason: lockedReason }),
      };
    }),
  }));
}

/**
 * The global filter params of a search string (ADM-02: `preset`, `from`, `to`, `district`,
 * `facility`, `type`), so sidebar links carry the filters across pages; other params are
 * page-specific and dropped.
 */
export function scopeSearchOf(search: string): string {
  return filterSearchOf(search);
}
