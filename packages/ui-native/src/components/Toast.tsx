import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { StyleSheet, View } from "react-native";

import { announce } from "../a11y.ts";
import { useTx } from "../i18n.ts";
import { Icon } from "../icons/Icon.tsx";
import { colors, radii, shadows, spacing } from "../tokens.ts";
import { AppText } from "./AppText.tsx";
import { IconButton } from "./IconButton.tsx";
import { TONE_COLORS, TONE_ICON, type Tone } from "./tone.ts";

/**
 * Toast copy: a translated string, or `(t) => string` resolved at render time with the current
 * language — so a toast still on screen re-translates when the user switches EN ⇄ RW.
 */
export type ToastText = string | ((t: ReturnType<typeof useTx>) => string);

export type ToastInput = {
  /** Translated title, or a resolver (preferred: follows language switches). */
  title: ToastText;
  description?: ToastText;
  tone?: Tone;
  /** ms before auto-dismiss; 0 keeps it until dismissed. Default 5000. */
  duration?: number;
};

export type ToastRecord = ToastInput & { id: number };

export type ToastApi = { toast: (input: ToastInput) => number; dismiss: (id: number) => void };

const ToastContext = createContext<ToastApi | null>(null);

/** Hosts toasts above the content: polite live region (Android) + explicit announcement (iOS). */
export function ToastProvider({ children }: { children?: ReactNode }) {
  const t = useTx();
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id));
    const timer = timers.current.get(id);
    if (timer !== undefined) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const resolve = useCallback(
    (text: ToastText): string => (typeof text === "function" ? text(t) : text),
    [t],
  );

  const toast = useCallback(
    (input: ToastInput) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { ...input, id }]);
      const title = resolve(input.title);
      announce(input.description === undefined ? title : `${title}. ${resolve(input.description)}`);
      const duration = input.duration ?? 5000;
      if (duration > 0)
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      return id;
    },
    [dismiss, resolve],
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const timer of map.values()) clearTimeout(timer);
      map.clear();
    };
  }, []);

  const api = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      <View style={styles.root}>
        {children}
        <View
          pointerEvents="box-none"
          accessibilityLiveRegion="polite"
          aria-live="polite"
          accessibilityLabel={t("common:ui.notifications")}
          style={styles.stack}
          testID="toast-region"
        >
          {toasts.map((item) => {
            const tone = item.tone ?? "positive";
            const palette = TONE_COLORS[tone];
            return (
              <View
                key={item.id}
                accessibilityRole="alert"
                style={[styles.toast, { borderColor: palette.border }]}
              >
                <Icon name={TONE_ICON[tone]} size={18} color={palette.fg} />
                <View style={styles.text}>
                  <AppText weight="semibold">{resolve(item.title)}</AppText>
                  {item.description === undefined ? null : (
                    <AppText variant="caption" color="muted">
                      {resolve(item.description)}
                    </AppText>
                  )}
                </View>
                <IconButton
                  icon="close"
                  labelKey="common:ui.dismiss"
                  onPress={() => dismiss(item.id)}
                />
              </View>
            );
          })}
        </View>
      </View>
    </ToastContext.Provider>
  );
}

/** `const { toast } = useToast(); toast({ title: t('common:sync.savedOnDevice') })`. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (api === null) throw new Error("useToast must be used inside <ToastProvider>");
  return api;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  stack: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.xxxl,
    gap: spacing.sm,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingLeft: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    ...shadows.raised,
  },
  text: { flex: 1, gap: spacing.xxs },
});
