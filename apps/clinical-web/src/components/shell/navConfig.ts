/**
 * Sidebar navigation (CLN-01, ref-image grouping): WORKSPACE — Review queue, Patients,
 * Referrals, Care-team tasks; GOVERNANCE — Audit; footer — Settings, Help. Each item names the
 * route capability it needs (disabled with a tooltip when the persona lacks it) and an id for
 * its count-badge slot (`badgeCounts`, wired in CLN-05/08/09).
 */
import type { IconName, TranslationKey } from "@laif/ui-web";

import { routes, type ClinicalRouteId } from "../../app/routes.ts";
import { ROUTE_CAPABILITY, type ClinicalCapability } from "../../session/capabilities.ts";

export type NavItemId = "queue" | "patients" | "referrals" | "tasks" | "audit" | "settings";

export type NavItemConfig = {
  id: NavItemId;
  to: string;
  labelKey: TranslationKey;
  icon: IconName;
  capability: ClinicalCapability | null;
  countTone?: "warning" | "danger" | "info" | "neutral";
};

export type NavSectionConfig = {
  id: "workspace" | "governance";
  labelKey: TranslationKey;
  items: readonly NavItemConfig[];
};

const item = (
  id: NavItemId & ClinicalRouteId,
  icon: IconName,
  extra: Partial<Pick<NavItemConfig, "countTone">> = {},
): NavItemConfig => ({
  id,
  to: routes[id](),
  labelKey: `clinical:nav.${id}`,
  icon,
  capability: ROUTE_CAPABILITY[id],
  ...extra,
});

export const NAV_SECTIONS: readonly NavSectionConfig[] = [
  {
    id: "workspace",
    labelKey: "clinical:nav.section.workspace",
    items: [
      item("queue", "clipboard", { countTone: "warning" }),
      item("patients", "people"),
      item("referrals", "external", { countTone: "danger" }),
      item("tasks", "check", { countTone: "info" }),
    ],
  },
  {
    id: "governance",
    labelKey: "clinical:nav.section.governance",
    items: [item("audit", "shield")],
  },
];

/** Bottom of the sidebar. Help opens the in-app demo help drawer (no route). */
export const NAV_FOOTER: readonly NavItemConfig[] = [item("settings", "settings")];
