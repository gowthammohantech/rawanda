/**
 * `worker` namespace wiring (one module per app so app tracks never edit the same file).
 * Add an area: create `locales/{en,rw}/worker/<area>.json`, import both below and add `<area>` to each object.
 */
import enWorkerBase from "../locales/en/worker.json";
import enWorkerAuth from "../locales/en/worker/auth.json";
import enWorkerHome from "../locales/en/worker/home.json";
import enWorkerNav from "../locales/en/worker/nav.json";
import enWorkerSettings from "../locales/en/worker/settings.json";
import enWorkerSync from "../locales/en/worker/sync.json";
import enWorkerNetsim from "../locales/en/worker/netsim.json";
import enWorkerPatients from "../locales/en/worker/patients.json";
import enWorkerScreening from "../locales/en/worker/screening.json";
import enWorkerReview from "../locales/en/worker/review.json";
import enWorkerTasks from "../locales/en/worker/tasks.json";
import rwWorkerBase from "../locales/rw/worker.json";
import rwWorkerAuth from "../locales/rw/worker/auth.json";
import rwWorkerHome from "../locales/rw/worker/home.json";
import rwWorkerNav from "../locales/rw/worker/nav.json";
import rwWorkerSettings from "../locales/rw/worker/settings.json";
import rwWorkerSync from "../locales/rw/worker/sync.json";
import rwWorkerNetsim from "../locales/rw/worker/netsim.json";
import rwWorkerPatients from "../locales/rw/worker/patients.json";
import rwWorkerScreening from "../locales/rw/worker/screening.json";
import rwWorkerReview from "../locales/rw/worker/review.json";
import rwWorkerTasks from "../locales/rw/worker/tasks.json";

export const enWorker = {
  ...enWorkerBase,
  auth: enWorkerAuth,
  home: enWorkerHome,
  nav: enWorkerNav,
  settings: enWorkerSettings,
  sync: enWorkerSync,
  netsim: enWorkerNetsim,
  patients: enWorkerPatients,
  screening: enWorkerScreening,
  review: enWorkerReview,
  tasks: enWorkerTasks,
} as const;

export const rwWorker: object = {
  ...rwWorkerBase,
  auth: rwWorkerAuth,
  home: rwWorkerHome,
  nav: rwWorkerNav,
  settings: rwWorkerSettings,
  sync: rwWorkerSync,
  netsim: rwWorkerNetsim,
  patients: rwWorkerPatients,
  screening: rwWorkerScreening,
  review: rwWorkerReview,
  tasks: rwWorkerTasks,
};
