/**
 * `expo-router` stand-in for Vitest (the real router needs Metro's route context). Records
 * navigation in `routerLog`; `Redirect` renders a marker; `Tabs` renders its screens as buttons
 * with their translated title / accessibility label; `Stack` renders a marker.
 * Usage: `vi.mock("expo-router", () => import("../test/router-stub.tsx"));`
 */
import type { ReactNode } from "react";

export const routerLog: { method: string; href: unknown }[] = [];
export const searchParams: { current: Record<string, string> } = { current: {} };
export const segments: { current: string[] } = { current: [] };

export function useRouter() {
  return {
    push: (href: unknown) => routerLog.push({ method: "push", href }),
    replace: (href: unknown) => routerLog.push({ method: "replace", href }),
    back: () => routerLog.push({ method: "back", href: null }),
    canGoBack: () => false,
  };
}

export function useLocalSearchParams() {
  return searchParams.current;
}

export function useSegments() {
  return segments.current;
}

export function Redirect({ href }: { href: string }) {
  return <span data-testid="redirect" data-href={href} />;
}

export function Stack() {
  return <span data-testid="stack" />;
}

type TabScreenProps = {
  name: string;
  options?: {
    title?: string;
    tabBarAccessibilityLabel?: string;
    tabBarItemStyle?: unknown;
  };
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
