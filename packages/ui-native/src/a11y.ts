/**
 * Accessibility helpers shared by every pressable in the kit (FND-10 task 3 / 5).
 *
 * `a11yState` emits BOTH React Native's `accessibilityState` (what TalkBack / VoiceOver read)
 * and the equivalent `aria-*` props (RN ≥ 0.71 maps them too; react-native-web — Expo web and
 * the Vitest runner — only understands `aria-*`).
 */
import { useEffect, useState } from "react";
import { AccessibilityInfo, Platform } from "react-native";

import { hitSlop, minTouchTarget } from "./tokens.ts";

export type A11yState = {
  disabled?: boolean;
  selected?: boolean;
  checked?: boolean | "mixed";
  busy?: boolean;
  expanded?: boolean;
};

export type A11yStateProps = {
  accessibilityState: A11yState;
  "aria-disabled"?: boolean;
  "aria-selected"?: boolean;
  "aria-checked"?: boolean | "mixed";
  "aria-busy"?: boolean;
  "aria-expanded"?: boolean;
};

export function a11yState(state: A11yState): A11yStateProps {
  const props: A11yStateProps = { accessibilityState: state };
  if (state.disabled !== undefined) props["aria-disabled"] = state.disabled;
  if (state.selected !== undefined) props["aria-selected"] = state.selected;
  if (state.checked !== undefined) props["aria-checked"] = state.checked;
  if (state.busy !== undefined) props["aria-busy"] = state.busy;
  if (state.expanded !== undefined) props["aria-expanded"] = state.expanded;
  return props;
}

/** Layout floor applied to every pressable: the visible box itself is ≥ 44 × 44 pt. */
export const touchTarget = { minHeight: minTouchTarget, minWidth: minTouchTarget } as const;

/** Extra slop for compact controls (react-native-web ignores it; the 44 pt floor still holds). */
export const compactHitSlop = hitSlop;

/**
 * Announces a save / sync result to screen readers. iOS VoiceOver needs the explicit
 * announcement; Android TalkBack already reads the `accessibilityLiveRegion="polite"` region,
 * so it is skipped there to avoid double speech.
 */
export function announce(message: string): void {
  if (message.trim() === "") return;
  if (Platform.OS === "android") return;
  AccessibilityInfo.announceForAccessibility(message);
}

/** `true` when the OS "Reduce motion" setting is on (loader/splash render statically). */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then(
      (value) => {
        if (active) setReduce(value);
      },
      () => undefined,
    );
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", (value) =>
      setReduce(Boolean(value)),
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return reduce;
}
