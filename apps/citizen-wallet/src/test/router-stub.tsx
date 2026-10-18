/**
 * `expo-router` stand-in for Vitest (the real router needs Metro's route context). Records
 * navigation in `routerLog`; `useFocusEffect` = one focus per mount; `params` feeds
 * `useLocalSearchParams`; `Redirect` renders a marker with its href; `Tabs` renders its
 * screens as buttons (translated title / accessibility label); `Stack` renders a marker.
 * Usage: `vi.mock("expo-router", () => import("../test/router-stub.tsx"));`
 */
import { useEffect, type ReactNode } from "react";

export const routerLog: { method: string; href: unknown }[] = [];
export const segments: { current: string[] } = { current: [] };
export const params: { current: Record<string, string> } = { current: {} };

export function resetRouter(next: string[] = [], nextParams: Record<string, string> = {}): void {
  routerLog.length = 0;
  segments.current = next;
  params.current = nextParams;
}

export function lastHref(): unknown {
  return routerLog.at(-1)?.href ?? null;
}

export function useRouter() {
  return {
    push: (href: unknown) => routerLog.push({ method: "push", href }),
    replace: (href: unknown) => routerLog.push({ method: "replace", href }),
    back: () => routerLog.push({ method: "back", href: null }),
    canGoBack: () => false,
  };
}

export function useSegments() {
  return segments.current;
}

export function useLocalSearchParams() {
  return params.current;
}

/** Runs the (memoised) effect on mount and whenever it changes — one "focus" per mount. */
export function useFocusEffect(effect: () => void | (() => void)) {
  useEffect(() => effect(), [effect]);
}

/** The rendered screen is the focused one. */
export function useIsFocused() {
  return true;
}

export function Redirect({ href }: { href: string }) {
  return <span data-testid="redirect" data-href={href} />;
}

export function Stack() {
  return <span data-testid="stack" />;
}

type TabScreenProps = {
  name: string;
  options?: { title?: string; tabBarAccessibilityLabel?: string };
};

export function Tabs({
  children,
  screenOptions,
}: {
  children?: ReactNode;
  screenOptions?: { tabBarItemStyle?: { minHeight?: number; minWidth?: number } };
}) {
  return (
    <nav
      data-testid="tab-bar"
      data-min-height={screenOptions?.tabBarItemStyle?.minHeight}
      data-min-width={screenOptions?.tabBarItemStyle?.minWidth}
    >
      {children}
    </nav>
  );
}

Tabs.Screen = function TabScreen({ name, options }: TabScreenProps) {
  return (
    <button type="button" data-route={name} aria-label={options?.tabBarAccessibilityLabel}>
      {options?.title}
    </button>
  );
};
