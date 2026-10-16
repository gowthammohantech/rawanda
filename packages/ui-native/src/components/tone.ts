import type { IconName } from "../icons/icon-data.ts";
import { colors, withAlpha } from "../tokens.ts";

/** Semantic tone shared by chips, tiles and callouts. Never the only signal (icon + text). */
export const TONES = ["neutral", "info", "positive", "warning", "danger"] as const;
export type Tone = (typeof TONES)[number];

export type ToneColors = { fg: string; bg: string; border: string };

/** Soft background + strong foreground (AA-checked pairs in ui-web tokens.contrast.test.ts). */
export const TONE_COLORS: Record<Tone, ToneColors> = {
  neutral: { fg: colors.muted, bg: colors.background, border: colors.border },
  info: { fg: colors.info, bg: colors.infoSoft, border: withAlpha(colors.info, 0.25) },
  positive: {
    fg: colors.positive,
    bg: colors.positiveSoft,
    border: withAlpha(colors.positive, 0.25),
  },
  warning: { fg: colors.warning, bg: colors.warningSoft, border: withAlpha(colors.warning, 0.25) },
  danger: { fg: colors.danger, bg: colors.dangerSoft, border: withAlpha(colors.danger, 0.25) },
};

export const TONE_ICON: Record<Tone, IconName> = {
  neutral: "dot",
  info: "info",
  positive: "check",
  warning: "alert",
  danger: "octagon-alert",
};
