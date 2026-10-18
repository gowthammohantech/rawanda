/**
 * `admin` namespace wiring (one module per app so app tracks never edit the same file).
 * Add an area: create `locales/{en,rw}/admin/<area>.json`, import both below and add `<area>` to each object.
 */
import enAdminBase from "../locales/en/admin.json";
import enAdminShell from "../locales/en/admin/shell.json";
import enAdminAuth from "../locales/en/admin/auth.json";
import enAdminErrors from "../locales/en/admin/errors.json";
import enAdminFilters from "../locales/en/admin/filters.json";
import enAdminOverview from "../locales/en/admin/overview.json";
import enAdminCharts from "../locales/en/admin/charts.json";
import enAdminPrivacy from "../locales/en/admin/privacy.json";
import enAdminFunnel from "../locales/en/admin/funnel.json";
import enAdminActions from "../locales/en/admin/actions.json";
import enAdminTimeliness from "../locales/en/admin/timeliness.json";
import enAdminWorkload from "../locales/en/admin/workload.json";
import enAdminQuality from "../locales/en/admin/quality.json";
import enAdminReports from "../locales/en/admin/reports.json";
import rwAdminBase from "../locales/rw/admin.json";
import rwAdminShell from "../locales/rw/admin/shell.json";
import rwAdminAuth from "../locales/rw/admin/auth.json";
import rwAdminErrors from "../locales/rw/admin/errors.json";
import rwAdminFilters from "../locales/rw/admin/filters.json";
import rwAdminOverview from "../locales/rw/admin/overview.json";
import rwAdminCharts from "../locales/rw/admin/charts.json";
import rwAdminPrivacy from "../locales/rw/admin/privacy.json";
import rwAdminFunnel from "../locales/rw/admin/funnel.json";
import rwAdminActions from "../locales/rw/admin/actions.json";
import rwAdminTimeliness from "../locales/rw/admin/timeliness.json";
import rwAdminWorkload from "../locales/rw/admin/workload.json";
import rwAdminQuality from "../locales/rw/admin/quality.json";
import rwAdminReports from "../locales/rw/admin/reports.json";

export const enAdmin = {
  ...enAdminBase,
  shell: enAdminShell,
  auth: enAdminAuth,
  errors: enAdminErrors,
  filters: enAdminFilters,
  overview: enAdminOverview,
  charts: enAdminCharts,
  privacy: enAdminPrivacy,
  funnel: enAdminFunnel,
  actions: enAdminActions,
  timeliness: enAdminTimeliness,
  workload: enAdminWorkload,
  quality: enAdminQuality,
  reports: enAdminReports,
} as const;

export const rwAdmin: object = {
  ...rwAdminBase,
  shell: rwAdminShell,
  auth: rwAdminAuth,
  errors: rwAdminErrors,
  filters: rwAdminFilters,
  overview: rwAdminOverview,
  charts: rwAdminCharts,
  privacy: rwAdminPrivacy,
  funnel: rwAdminFunnel,
  actions: rwAdminActions,
  timeliness: rwAdminTimeliness,
  workload: rwAdminWorkload,
  quality: rwAdminQuality,
  reports: rwAdminReports,
};
