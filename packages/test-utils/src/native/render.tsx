/**
 * `renderNative` for React Native component tests (FND-10 task 6): wraps the UI in
 * `I18nProvider` (synchronous test i18n, app `worker` by default) and `SafeAreaProvider` with
 * mocked initial metrics (iPhone-sized frame, notch insets).
 *
 * Runner decision (FND-10 §10): Vitest + jsdom with `react-native` aliased to
 * `react-native-web`, rendered with `@testing-library/react` — one test runner repo-wide.
 * The consuming package's vitest config supplies the alias (see packages/ui-native).
 *
 * Peer dependencies (provided by the consuming native package): react, react-dom,
 * react-native(-web), react-native-safe-area-context, @testing-library/react.
 */
import type { AppId } from "@laif/domain";
import { createTestI18n, I18nProvider, type I18nInstance, type Language } from "@laif/i18n";
import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { SafeAreaProvider, type Metrics } from "react-native-safe-area-context";

/** Mocked safe-area metrics: 390 × 844 pt frame with a 47 pt top / 34 pt bottom inset. */
export const TEST_SAFE_AREA_METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

export type RenderNativeOptions = Omit<RenderOptions, "wrapper"> & {
  /** UI language (default `en`). */
  language?: Language;
  /** App whose language storage key is used (default `worker`). */
  appId?: AppId;
  /** Reuse an i18n instance (e.g. to assert language persistence). */
  i18n?: I18nInstance;
  safeAreaMetrics?: Metrics;
};

export type RenderNativeResult = RenderResult & { i18n: I18nInstance };

export function renderNative(
  ui: ReactElement,
  options: RenderNativeOptions = {},
): RenderNativeResult {
  const {
    language = "en",
    appId = "worker",
    i18n: given,
    safeAreaMetrics = TEST_SAFE_AREA_METRICS,
    ...rest
  } = options;
  const i18n = given ?? createTestI18n(language, { appId });

  function Wrapper({ children }: { children?: ReactNode }) {
    return (
      <I18nProvider i18n={i18n}>
        <SafeAreaProvider initialMetrics={safeAreaMetrics}>{children}</SafeAreaProvider>
      </I18nProvider>
    );
  }

  const result = render(ui, { wrapper: Wrapper, ...rest });
  return Object.assign(result, { i18n });
}
