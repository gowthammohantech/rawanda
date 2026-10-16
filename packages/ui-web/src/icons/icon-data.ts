/**
 * Icon set as data (24×24, stroke 1.8, round caps): the prototype's paths ported verbatim plus
 * the FND-09 additions. Data, not JSX, so `@laif/ui-native` (FND-10) renders the same set with
 * react-native-svg.
 */

export type IconNode =
  | readonly ["path", { readonly d: string }]
  | readonly ["circle", { readonly cx: number; readonly cy: number; readonly r: number }];

/** Icons ported from `PrototypeFourApplications-main/src/App.tsx`. */
export const PROTOTYPE_ICON_NAMES = [
  "activity",
  "arrow",
  "bell",
  "calendar",
  "check",
  "chevron",
  "clipboard",
  "close",
  "download",
  "heart",
  "home",
  "menu",
  "more",
  "people",
  "plus",
  "search",
  "settings",
  "shield",
  "sync",
  "trend",
  "user",
  "wallet",
] as const;

/** New in FND-09 (phase list) plus kit-internal helpers (chevron-left/up, sort, dot, octagon). */
export const ADDED_ICON_NAMES = [
  "alert",
  "info",
  "filter",
  "globe",
  "lock",
  "clock",
  "wifi-off",
  "refresh",
  "eye",
  "file",
  "chevron-down",
  "external",
  "chevron-left",
  "chevron-up",
  "sort",
  "dot",
  "octagon-alert",
  "minus",
] as const;

export const ICON_NAMES = [...PROTOTYPE_ICON_NAMES, ...ADDED_ICON_NAMES] as const;
export type IconName = (typeof ICON_NAMES)[number];

const p = (d: string): IconNode => ["path", { d }] as const;
const c = (cx: number, cy: number, r: number): IconNode => ["circle", { cx, cy, r }] as const;

export const ICON_DATA: Readonly<Record<IconName, readonly IconNode[]>> = {
  // ── Prototype set ──────────────────────────────────────────────────────────
  activity: [p("M3 12h4l2.2-6 4 12 2.3-6H21")],
  arrow: [p("M5 12h14M13 6l6 6-6 6")],
  bell: [p("M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4")],
  calendar: [p("M4 5h16v16H4zM8 3v4M16 3v4M4 10h16")],
  check: [p("m5 12 4 4L19 6")],
  chevron: [p("m9 18 6-6-6-6")],
  clipboard: [p("M9 5H6v16h12V5h-3M9 3h6v4H9zM9 12h6M9 16h4")],
  close: [p("m6 6 12 12M18 6 6 18")],
  download: [p("M12 3v12m-5-5 5 5 5-5M5 21h14")],
  heart: [
    p(
      "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z",
    ),
  ],
  home: [p("m3 11 9-8 9 8v10h-6v-7H9v7H3z")],
  menu: [p("M4 7h16M4 12h16M4 17h16")],
  more: [c(5, 12, 1), c(12, 12, 1), c(19, 12, 1)],
  people: [
    p(
      "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
    ),
  ],
  plus: [p("M12 5v14M5 12h14")],
  search: [c(11, 11, 7), p("m20 20-4-4")],
  settings: [
    c(12, 12, 3),
    p(
      "M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z",
    ),
  ],
  shield: [p("M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"), p("m9 12 2 2 4-4")],
  sync: [p("M20 7h-5V2M4 17h5v5M19 12a7 7 0 0 0-12-5l-3 3M5 12a7 7 0 0 0 12 5l3-3")],
  trend: [p("m3 17 6-6 4 4 8-9M15 6h6v6")],
  user: [c(12, 8, 4), p("M4 21a8 8 0 0 1 16 0")],
  wallet: [p("M3 6h16v14H3zM3 6l3-3h11v3M15 12h6v4h-6z")],

  // ── FND-09 additions ───────────────────────────────────────────────────────
  alert: [
    p("M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"),
    p("M12 9v4M12 17h.01"),
  ],
  info: [c(12, 12, 9), p("M12 16v-5M12 8h.01")],
  filter: [p("M3 5h18l-7 8.5V19l-4 2v-7.5z")],
  globe: [c(12, 12, 9), p("M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18")],
  lock: [p("M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4")],
  clock: [c(12, 12, 9), p("M12 7v5l3 2")],
  "wifi-off": [
    p(
      "m2 2 20 20M8.5 16.4a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 5.2-2.8M19 12.9a10 10 0 0 0-2.3-1.6M2 8.8a15 15 0 0 1 4.2-2.6M22 8.8A15 15 0 0 0 11 4.6M12 20h.01",
    ),
  ],
  refresh: [p("M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7")],
  eye: [p("M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"), c(12, 12, 3)],
  file: [p("M14 3H6v18h12V7zM14 3v4h4M9 13h6M9 17h4")],
  "chevron-down": [p("m6 9 6 6 6-6")],
  external: [p("M14 4h6v6M20 4l-9 9M18 14v6H4V6h6")],
  "chevron-left": [p("m15 18-6-6 6-6")],
  "chevron-up": [p("m18 15-6-6-6 6")],
  sort: [p("M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4")],
  dot: [c(12, 12, 4)],
  "octagon-alert": [p("M8 2h8l6 6v8l-6 6H8l-6-6V8z"), p("M12 8v4M12 16h.01")],
  minus: [p("M5 12h14")],
};
