/**
 * CTZ-09 task 1: on navigation (screen focus) TalkBack / VoiceOver focus moves to the screen
 * title, so a screen-reader user always starts at "where am I". Native only — on the web target
 * the browser keeps its own focus order (and react-native-web has no accessibility events).
 */
import type { AppTextRef } from "@laif/ui-native";
import { useFocusEffect } from "expo-router";
import { useCallback, useRef, type RefObject } from "react";
import { AccessibilityInfo, Platform } from "react-native";

/** Delay so the focus lands after the screen transition finished. */
const FOCUS_DELAY_MS = 350;

export function focusTitle(target: AppTextRef | null, os: string = Platform.OS): boolean {
  if (target === null || os === "web") return false;
  const send = (
    AccessibilityInfo as {
      sendAccessibilityEvent?: (node: AppTextRef, event: "focus") => void;
    }
  ).sendAccessibilityEvent;
  if (typeof send !== "function") return false;
  send(target, "focus");
  return true;
}

/** Ref for an `AppHeader` `titleRef`; focuses it each time the screen gains focus. */
export function useTitleFocus(): RefObject<AppTextRef | null> {
  const ref = useRef<AppTextRef | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS === "web") return undefined;
      const timer = setTimeout(() => focusTitle(ref.current), FOCUS_DELAY_MS);
      return () => clearTimeout(timer);
    }, []),
  );
  return ref;
}
