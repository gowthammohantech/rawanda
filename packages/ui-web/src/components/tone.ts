import type { IconName } from "../icons/icon-data.ts";

/** Semantic tone shared by chips, KPIs, bars and callouts. Never the only signal (icon + text). */
export const TONES = ["neutral", "info", "positive", "warning", "danger"] as const;
export type Tone = (typeof TONES)[number];

/** Soft background + strong foreground (AA-checked pairs in tokens.contrast.test.ts). */
export const TONE_CHIP_CLASS: Record<Tone, string> = {
  neutral: "bg-background text-muted border-border",
  info: "bg-state-info-soft text-state-info border-state-info/25",
  positive: "bg-state-success-soft text-state-success border-state-success/25",
  warning: "bg-risk-warning-soft text-risk-warning border-risk-warning/25",
  danger: "bg-risk-danger-soft text-risk-danger border-risk-danger/25",
};

export const TONE_TEXT_CLASS: Record<Tone, string> = {
  neutral: "text-muted",
  info: "text-state-info",
  positive: "text-state-success",
  warning: "text-risk-warning",
  danger: "text-risk-danger",
};

export const TONE_FILL_CLASS: Record<Tone | "primary", string> = {
  primary: "bg-primary",
  neutral: "bg-ink",
  info: "bg-state-info",
  positive: "bg-state-success",
  warning: "bg-risk-warning",
  danger: "bg-risk-danger",
};

export const TONE_STROKE_CLASS: Record<Tone | "primary", string> = {
  primary: "stroke-primary",
  neutral: "stroke-ink",
  info: "stroke-state-info",
  positive: "stroke-state-success",
  warning: "stroke-risk-warning",
  danger: "stroke-risk-danger",
};

export const TONE_ICON: Record<Tone, IconName> = {
  neutral: "dot",
  info: "info",
  positive: "check",
  warning: "alert",
  danger: "octagon-alert",
};
