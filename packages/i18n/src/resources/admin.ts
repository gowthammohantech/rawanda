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
};
