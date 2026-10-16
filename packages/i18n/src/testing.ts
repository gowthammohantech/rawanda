/**
 * Test helper: a fully initialised instance, synchronously, with in-memory storage.
 * Re-exported later from `@laif/test-utils`.
 */
import type { AppId } from "@laif/domain";

import { buildI18nInstance, type CreateI18nOptions, type I18nInstance } from "./create-i18n.ts";
import type { Language } from "./languages.ts";
import { createMemoryLanguageStorage } from "./storage.ts";

export function createTestI18n(
  language: Language = "en",
  options: Partial<Omit<CreateI18nOptions, "storage" | "initialLanguage">> & {
    appId?: AppId;
  } = {},
): I18nInstance {
  const storage = createMemoryLanguageStorage(language);
  return buildI18nInstance({ appId: "clinical", ...options, storage }, language, storage);
}
