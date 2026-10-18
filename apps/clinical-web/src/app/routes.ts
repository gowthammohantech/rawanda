/**
 * Typed route builders (CLN-01 task 2). The ONLY place that spells `/clinical/...` paths: pages,
 * nav and guards call `routes.queue()`, `routes.patient(id)` … and the router registers
 * `ROUTE_PATTERNS`.
 */
import { BASE_PATH } from "./config.ts";

export const ROUTE_PATTERNS = {
  login: `${BASE_PATH}/login`,
  queue: `${BASE_PATH}/queue`,
  patients: `${BASE_PATH}/patients`,
  patient: `${BASE_PATH}/patients/:id`,
  review: `${BASE_PATH}/reviews/:id`,
  decision: `${BASE_PATH}/reviews/:id/decision`,
  referrals: `${BASE_PATH}/referrals`,
  tasks: `${BASE_PATH}/tasks`,
  audit: `${BASE_PATH}/audit`,
  settings: `${BASE_PATH}/settings`,
} as const;

/** Every screen of the app except the demo sign-in. */
export type ClinicalRouteId = Exclude<keyof typeof ROUTE_PATTERNS, "login">;

export const PATIENT_TABS = ["overview", "screenings", "reviews", "referralsTasks"] as const;
export type PatientTab = (typeof PATIENT_TABS)[number];

export type PatientsRouteParams = { q?: string; facility?: string; page?: number };
export type ReferralsRouteParams = { tab?: string; facility?: string; q?: string; id?: string };
export type TasksRouteParams = { tab?: string; id?: string };

const LOGIN = ROUTE_PATTERNS.login;
const enc = encodeURIComponent;

export const routes = {
  root: () => BASE_PATH,
  /** `/clinical/login`, optionally `?redirect=<path incl. query>`. */
  login: (redirect?: string) =>
    redirect === undefined ? LOGIN : `${LOGIN}?redirect=${enc(redirect)}`,
  queue: () => ROUTE_PATTERNS.queue,
  /** `/clinical/patients`, optionally `?q=&facility=&page=` (CLN-03 URL-driven search). */
  patients: (params: PatientsRouteParams = {}) => {
    const search = new URLSearchParams();
    const q = params.q?.trim();
    if (q !== undefined && q !== "") search.set("q", q);
    if (params.facility !== undefined) search.set("facility", params.facility);
    if (params.page !== undefined && params.page > 1) search.set("page", String(params.page));
    const query = search.toString();
    return query === "" ? ROUTE_PATTERNS.patients : `${ROUTE_PATTERNS.patients}?${query}`;
  },
  /** `/clinical/patients/:id`, optionally `?tab=` (CLN-06 links straight to the screenings tab). */
  patient: (id: string, tab?: PatientTab) =>
    `${BASE_PATH}/patients/${enc(id)}${tab === undefined ? "" : `?tab=${tab}`}`,
  review: (id: string) => `${BASE_PATH}/reviews/${enc(id)}`,
  decision: (id: string) => `${BASE_PATH}/reviews/${enc(id)}/decision`,
  /** `/clinical/referrals`, optionally `?tab=&facility=&q=&id=` (CLN-08: `id` opens the drawer). */
  referrals: (params: ReferralsRouteParams = {}) => {
    const search = new URLSearchParams();
    if (params.tab !== undefined && params.tab !== "open") search.set("tab", params.tab);
    if (params.facility !== undefined) search.set("facility", params.facility);
    const q = params.q?.trim();
    if (q !== undefined && q !== "") search.set("q", q);
    if (params.id !== undefined) search.set("id", params.id);
    const query = search.toString();
    return query === "" ? ROUTE_PATTERNS.referrals : `${ROUTE_PATTERNS.referrals}?${query}`;
  },
  /** `/clinical/tasks`, optionally `?tab=&id=` (CLN-09: `id` opens the task drawer). */
  tasks: (params: TasksRouteParams = {}) => {
    const search = new URLSearchParams();
    if (params.tab !== undefined && params.tab !== "dueSoon") search.set("tab", params.tab);
    if (params.id !== undefined) search.set("id", params.id);
    const query = search.toString();
    return query === "" ? ROUTE_PATTERNS.tasks : `${ROUTE_PATTERNS.tasks}?${query}`;
  },
  audit: () => ROUTE_PATTERNS.audit,
  settings: () => ROUTE_PATTERNS.settings,
} as const;

/** Where to go after sign-in: the default landing screen. */
export const HOME_PATH = ROUTE_PATTERNS.queue;

/**
 * Accepts a `?redirect=` value only when it is an in-app path (`/clinical/…`, not the login page,
 * not protocol-relative); otherwise null.
 */
export function safeRedirect(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (!value.startsWith(`${BASE_PATH}/`) || value.startsWith("//") || value.includes("\\")) {
    return null;
  }
  const pathname = value.split(/[?#]/u)[0] ?? "";
  if (pathname === LOGIN || pathname.startsWith(`${LOGIN}/`)) return null;
  return value;
}
