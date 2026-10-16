/**
 * Design tokens (FND-09 task 2) as a TypeScript object. The SAME values are declared as CSS
 * custom properties in `styles/tokens.css` (`tokens.contrast.test.ts` fails on drift) and are the
 * reference for the native parity test in `@laif/ui-native` (FND-10).
 *
 * Palette: clinical teal from the tech spec §7 / prototype `index.css` soft tints.
 * Deviation: `subtle` is `#66737A` (spec `#7B898F` is 3.6:1 on white, below WCAG AA 4.5:1).
 */

export const colors = {
  primary: "#087F8C",
  primaryDark: "#075D66",
  primarySoft: "#E8F5F5",
  positive: "#1B7653",
  positiveSoft: "#EAF6F0",
  warning: "#A15D00",
  warningSoft: "#FFF4DF",
  danger: "#B42318",
  dangerSoft: "#FFF0EE",
  info: "#2463A0",
  infoSoft: "#EDF5FC",
  ink: "#18252B",
  muted: "#5B6870",
  subtle: "#66737A",
  background: "#F7FAFA",
  canvas: "#E9ECEC",
  surface: "#FFFFFF",
  border: "#D9E2E4",
  borderSoft: "#E8EDEF",
  demoBannerBg: "#FFF7E7",
  demoBannerFg: "#79500C",
  demoBannerBorder: "#EEDDBD",
  /** RwandaMark sun (prototype `.sun-core`). */
  sun: "#F4C54E",
  /** BrandLoader radial gradient stops (prototype `.loader`). */
  loaderGlow: "#15939E",
  loaderDeep: "#043D45",
  onPrimary: "#FFFFFF",
} as const;

export type ColorToken = keyof typeof colors;

/** Semantic aliases → base colour token (components use these names for meaning). */
export const semanticColors = {
  riskWarning: "warning",
  riskWarningSoft: "warningSoft",
  riskDanger: "danger",
  riskDangerSoft: "dangerSoft",
  stateSuccess: "positive",
  stateSuccessSoft: "positiveSoft",
  stateInfo: "info",
  stateInfoSoft: "infoSoft",
  syncPending: "info",
  syncPendingSoft: "infoSoft",
  syncConflict: "danger",
  syncConflictSoft: "dangerSoft",
} as const satisfies Record<string, ColorToken>;

export type SemanticColorToken = keyof typeof semanticColors;

/** Resolves a semantic alias to its hex value. */
export function semanticColor(token: SemanticColorToken): string {
  return colors[semanticColors[token]];
}

/** Radii in px: 8 / 12 / 16 / 24; the app shell uses 24. */
export const radii = { sm: 8, md: 12, lg: 16, xl: 24, shell: 24, pill: 999 } as const;

export const fonts = {
  sans: '"DM Sans", ui-sans-serif, system-ui, sans-serif',
  display: 'Manrope, "DM Sans", ui-sans-serif, system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
} as const;

export const shadows = {
  card: "0 1px 2px rgba(24, 37, 43, 0.04)",
  raised: "0 8px 28px rgba(24, 37, 43, 0.08)",
  overlay: "0 22px 65px rgba(18, 43, 48, 0.18)",
} as const;

/** Visible focus ring: 3px teal at 24 % opacity with a 2px offset. */
export const focusRing = { width: 3, color: "rgba(8, 127, 140, 0.24)", offset: 2 } as const;

/** Minimum interactive target sizes (web pointer / touch breakpoints). */
export const minTarget = { pointer: 32, touch: 44 } as const;

/** Breakpoints used by the shell (sidebar → drawer) and tables (rows → stacked cards). */
export const breakpoints = { mobile: 390, tablet: 768, desktop: 1024, wide: 1280 } as const;

/** Foreground/background pairs that render text; each must reach WCAG AA (≥ 4.5:1). */
export const TEXT_CONTRAST_PAIRS: ReadonlyArray<readonly [ColorToken, ColorToken]> = [
  ["ink", "surface"],
  ["ink", "background"],
  ["ink", "canvas"],
  ["muted", "surface"],
  ["muted", "background"],
  ["muted", "canvas"],
  ["muted", "primarySoft"],
  ["muted", "infoSoft"],
  ["subtle", "surface"],
  ["subtle", "background"],
  ["primary", "surface"],
  ["primary", "background"],
  ["primaryDark", "primarySoft"],
  ["onPrimary", "primary"],
  ["onPrimary", "primaryDark"],
  ["onPrimary", "danger"],
  ["positive", "positiveSoft"],
  ["warning", "warningSoft"],
  ["danger", "dangerSoft"],
  ["danger", "surface"],
  ["info", "infoSoft"],
  ["info", "surface"],
  ["demoBannerFg", "demoBannerBg"],
];

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.x relative luminance of a `#RRGGBB` colour. */
export function relativeLuminance(hex: string): number {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (match === null) throw new RangeError(`Expected #RRGGBB, got ${hex}`);
  const [r, g, b] = [match[1], match[2], match[3]].map((part) =>
    channel(parseInt(part ?? "0", 16)),
  );
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

/** WCAG 2.x contrast ratio between two `#RRGGBB` colours (1–21). */
export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** CSS custom property name for a colour token: `primaryDark` → `--color-primary-dark`. */
export function cssColorVar(token: ColorToken | SemanticColorToken): string {
  return `--color-${token.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

export const tokens = {
  colors,
  semanticColors,
  radii,
  fonts,
  shadows,
  focusRing,
  minTarget,
  breakpoints,
} as const;
