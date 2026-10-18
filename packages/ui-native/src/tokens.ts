/**
 * Native design tokens (FND-10 task 2). Colour names and values are IDENTICAL to
 * `@laif/ui-web` `tokens.ts` — `tokens.parity.test.ts` fails on any drift. Everything else
 * (spacing, type scale, touch targets) is native-specific.
 *
 * Dynamic type: font sizes here are the 1× sizes. The OS multiplies them by the user's font
 * scale through `allowFontScaling` (never disabled in this kit); only dense rows cap the
 * multiplier at `maxFontSizeMultiplier.dense`.
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
  /** BrandSplash radial gradient stops (prototype `.loader`). */
  loaderGlow: "#15939E",
  loaderDeep: "#043D45",
  onPrimary: "#FFFFFF",
} as const;

export type ColorToken = keyof typeof colors;

/**
 * High-contrast token set (CTZ-08): the SAME colour names as `colors`, re-valued so every text
 * colour reaches ≥ 7:1 (WCAG AAA) on every surface it is drawn on — ink `#000000` on surface
 * `#FFFFFF`, actions on primary-dark `#075D66`, borders `#18252B`, soft tints flattened to white.
 * Native only (not part of the ui-web parity set). `highContrast.test.ts` checks the ratios.
 */
export const highContrastColors: Readonly<Record<ColorToken, string>> = {
  primary: "#075D66",
  primaryDark: "#04434A",
  primarySoft: "#FFFFFF",
  positive: "#0E5A3C",
  positiveSoft: "#FFFFFF",
  warning: "#6E3F00",
  warningSoft: "#FFFFFF",
  danger: "#8A1A12",
  dangerSoft: "#FFFFFF",
  info: "#17497A",
  infoSoft: "#FFFFFF",
  ink: "#000000",
  muted: "#18252B",
  subtle: "#18252B",
  background: "#FFFFFF",
  canvas: "#FFFFFF",
  surface: "#FFFFFF",
  border: "#18252B",
  borderSoft: "#18252B",
  demoBannerBg: "#FFFFFF",
  demoBannerFg: "#5A3A06",
  demoBannerBorder: "#18252B",
  sun: "#F4C54E",
  loaderGlow: "#15939E",
  loaderDeep: "#043D45",
  onPrimary: "#FFFFFF",
};

/** Text colours and the backgrounds they sit on in the high-contrast set (≥ 7:1 each pair). */
export const HIGH_CONTRAST_TEXT_PAIRS: readonly (readonly [ColorToken, ColorToken])[] = [
  ...(
    [
      "ink",
      "muted",
      "subtle",
      "primary",
      "primaryDark",
      "positive",
      "warning",
      "danger",
      "info",
    ] as const
  ).flatMap((fg) =>
    (
      [
        "surface",
        "background",
        "primarySoft",
        "positiveSoft",
        "warningSoft",
        "dangerSoft",
        "infoSoft",
      ] as const
    ).map((bg) => [fg, bg] as const),
  ),
  ["demoBannerFg", "demoBannerBg"],
  ["onPrimary", "primary"],
  ["onPrimary", "primaryDark"],
  ["onPrimary", "danger"],
];

/** WCAG 2.x relative luminance of `#RRGGBB`. */
function relativeLuminance(hex: string): number {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (match === null) throw new RangeError(`Expected #RRGGBB, got ${hex}`);
  const [r, g, b] = [match[1], match[2], match[3]].map((part) => {
    const c = parseInt(part ?? "0", 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

/** WCAG contrast ratio of two `#RRGGBB` colours (1–21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

/** Semantic aliases → base colour token (same map as ui-web). */
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

/** `#RRGGBB` + opacity → `rgba(...)` (hairline tinted borders, overlays). */
export function withAlpha(hex: string, alpha: number): string {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (match === null) throw new RangeError(`Expected #RRGGBB, got ${hex}`);
  const [r, g, b] = [match[1], match[2], match[3]].map((part) => parseInt(part ?? "0", 16));
  return `rgba(${r ?? 0}, ${g ?? 0}, ${b ?? 0}, ${alpha})`;
}

/** Visible focus ring (keyboard / switch access on Android & Expo web): same as ui-web. */
export const focusRing = { width: 3, color: withAlpha(colors.primary, 0.24), offset: 2 } as const;

/** 4-pt spacing scale. */
export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;
export type SpacingToken = keyof typeof spacing;

/** Radii in pt: same scale as ui-web (8 / 12 / 16 / 24, pill). */
export const radii = { sm: 8, md: 12, lg: 16, xl: 24, shell: 24, pill: 999 } as const;

/** Minimum touch target (pt) for every pressable in the kit (≥ 44 × 44, tech spec §7). */
export const minTouchTarget = 44;

/** Extra touch slop around compact controls (chips, icon buttons, switches). */
export const hitSlop = { top: 8, bottom: 8, left: 8, right: 8 } as const;

/** Type scale (1× sizes; the OS scales them with the user's font size). */
export const typeScale = {
  micro: { fontSize: 11, lineHeight: 15, letterSpacing: 0.6 },
  caption: { fontSize: 12, lineHeight: 16, letterSpacing: 0 },
  body: { fontSize: 15, lineHeight: 21, letterSpacing: 0 },
  bodyLarge: { fontSize: 17, lineHeight: 24, letterSpacing: 0 },
  title: { fontSize: 20, lineHeight: 26, letterSpacing: -0.2 },
  display: { fontSize: 26, lineHeight: 32, letterSpacing: -0.4 },
} as const;
export type TypeVariant = keyof typeof typeScale;

/** Font-size multiplier caps: dense rows and bottom-tab labels only (everything else is free). */
export const maxFontSizeMultiplier = { dense: 1.6, tabLabel: 3 } as const;

/**
 * App-level text size presets (CTZ-08: Standard / Large / Larger / Largest), applied ON TOP of
 * the OS dynamic type (`allowFontScaling` stays on): rendered size = token × preset × OS scale.
 */
export const TEXT_SCALES = [1, 1.15, 1.3, 1.5] as const;
export type TextScale = (typeof TEXT_SCALES)[number];

/**
 * Font family names as registered by `useLaifFonts()` (`@expo-google-fonts/*`, bundled).
 * On native a custom family carries its own weight, so pick the family, not `fontWeight`.
 */
export const fontFamilies = {
  sans: "DMSans_400Regular",
  sansMedium: "DMSans_500Medium",
  sansSemiBold: "DMSans_600SemiBold",
  sansBold: "DMSans_700Bold",
  displaySemiBold: "Manrope_600SemiBold",
  display: "Manrope_700Bold",
  displayExtraBold: "Manrope_800ExtraBold",
  mono: "JetBrainsMono_400Regular",
  monoMedium: "JetBrainsMono_500Medium",
} as const;
export type FontFamilyToken = keyof typeof fontFamilies;

/** RN shadow presets (iOS shadow* + Android elevation), mirroring ui-web `shadows`. */
export const shadows = {
  card: {
    shadowColor: colors.ink,
    shadowOpacity: 0.04,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  raised: {
    shadowColor: colors.ink,
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  overlay: {
    shadowColor: colors.ink,
    shadowOpacity: 0.18,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 22 },
    elevation: 12,
  },
} as const;

export const tokens = {
  colors,
  semanticColors,
  spacing,
  radii,
  typeScale,
  fontFamilies,
  shadows,
  focusRing,
  minTouchTarget,
  hitSlop,
  maxFontSizeMultiplier,
} as const;
