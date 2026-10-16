import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createI18n } from "./create-i18n.ts";
import { clearMissingKeyReport, getMissingKeyReport, setMissingKeyLogging } from "./missing.ts";
import { createMemoryLanguageStorage, type LanguageStorage } from "./storage.ts";
import { createTestI18n } from "./testing.ts";

beforeEach(() => {
  clearMissingKeyReport();
});
afterEach(() => {
  setMissingKeyLogging(false);
  vi.unstubAllGlobals();
});

describe("createI18n", () => {
  it("starts in English when nothing is stored (no device-locale detection)", async () => {
    const i18n = await createI18n({ appId: "clinical" });
    expect(i18n.language).toBe("en");
    expect(i18n.t("common:actions.save")).toBe("Save");
    expect(i18n.languages).toEqual(["en", "rw"]);
  });

  it("uses initialLanguage only when no preference is stored", async () => {
    const fresh = await createI18n({ appId: "worker", initialLanguage: "rw" });
    expect(fresh.language).toBe("rw");
    const storage = createMemoryLanguageStorage("en");
    const stored = await createI18n({ appId: "worker", storage, initialLanguage: "rw" });
    expect(stored.language).toBe("en");
  });

  it("persists setLanguage('rw'): a new instance with the same storage starts in rw", async () => {
    const storage = createMemoryLanguageStorage();
    const first = await createI18n({ appId: "citizen", storage });
    await first.setLanguage("rw");
    expect(first.language).toBe("rw");
    expect(first.t("common:actions.save")).toBe("Bika");

    const second = await createI18n({ appId: "citizen", storage });
    expect(second.language).toBe("rw");
    expect(second.t("common:actions.save")).toBe("Bika");
  });

  it("writes storage before changing the language", async () => {
    const calls: string[] = [];
    const memory = createMemoryLanguageStorage();
    const i18n = await createI18n({
      appId: "admin",
      storage: {
        get: () => memory.get(),
        set: async (lng) => {
          calls.push(`set:${lng}:${i18nLanguage()}`);
          await memory.set(lng);
        },
      },
    });
    function i18nLanguage(): string {
      return i18n.language;
    }
    await i18n.setLanguage("rw");
    expect(calls).toEqual(["set:rw:en"]);
  });

  it("still switches in memory when storage fails, and starts in en when reading fails", async () => {
    const warn = vi.fn();
    const broken: LanguageStorage = {
      get: () => Promise.reject(new Error("read failed")),
      set: () => Promise.reject(new Error("quota")),
    };
    const i18n = await createI18n({ appId: "clinical", storage: broken, isDev: true, warn });
    expect(i18n.language).toBe("en");
    await i18n.setLanguage("rw");
    expect(i18n.language).toBe("rw");
    expect(warn).toHaveBeenCalledWith(
      "[i18n] could not read language preference",
      expect.any(Error),
    );
    expect(warn).toHaveBeenCalledWith(
      "[i18n] could not save language preference",
      expect.any(Error),
    );
  });

  it("ignores an unsupported stored value", async () => {
    const storage: LanguageStorage = {
      get: () => Promise.resolve("fr" as never),
      set: () => Promise.resolve(),
    };
    const i18n = await createI18n({ appId: "clinical", storage });
    expect(i18n.language).toBe("en");
  });

  it("rejects unsupported languages in setLanguage", async () => {
    const i18n = await createI18n({ appId: "clinical" });
    await expect(i18n.setLanguage("fr" as never)).rejects.toThrow(RangeError);
  });

  it("resolves and translates offline (all network APIs throw)", async () => {
    const boom = () => {
      throw new Error("network access is not allowed");
    };
    vi.stubGlobal("fetch", vi.fn(boom));
    vi.stubGlobal("XMLHttpRequest", vi.fn(boom));
    vi.stubGlobal("WebSocket", vi.fn(boom));
    vi.stubGlobal("EventSource", vi.fn(boom));
    const i18n = await createI18n({ appId: "worker", initialLanguage: "rw", isDev: true });
    expect(i18n.t("demo:banner")).toContain("IGERAGEZA");
    await i18n.setLanguage("en");
    expect(i18n.t("demo:banner")).toBe(
      "DEMONSTRATION — SYNTHETIC PATIENT DATA — NOT FOR CLINICAL USE",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sets document.documentElement.lang on web", async () => {
    const documentElement = { lang: "" };
    vi.stubGlobal("document", { documentElement });
    const i18n = await createI18n({ appId: "clinical" });
    expect(documentElement.lang).toBe("en");
    await i18n.setLanguage("rw");
    expect(documentElement.lang).toBe("rw");
  });

  it("notifies language listeners and unsubscribes", async () => {
    const i18n = await createI18n({ appId: "clinical" });
    const seen: string[] = [];
    const off = i18n.onLanguageChanged((lng) => seen.push(lng));
    await i18n.setLanguage("rw");
    off();
    await i18n.setLanguage("en");
    expect(seen).toEqual(["rw"]);
  });
});

describe("fallback and missing keys", () => {
  it("renders EN for a deleted RW key, warns once and reports it (dev)", async () => {
    const warn = vi.fn();
    const i18n = await createI18n({ appId: "clinical", initialLanguage: "rw", isDev: true, warn });
    const bundle = i18n.i18n.getResourceBundle("rw", "common") as {
      actions: Record<string, string>;
    };
    delete bundle.actions["save"];

    expect(i18n.t("common:actions.save")).toBe("Save");
    expect(i18n.t("common:actions.save")).toBe("Save");
    expect(i18n.t("common:actions.cancel")).toBe("Hagarika");

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("[i18n] missing", "rw", "common", "actions.save");
    expect(getMissingKeyReport()).toEqual([
      { lng: "rw", ns: "common", key: "actions.save", kind: "fallback" },
    ]);
  });

  it("falls back from an empty RW string (returnEmptyString: false)", () => {
    const i18n = createTestI18n("rw");
    i18n.i18n.addResource("rw", "common", "actions.close", "");
    expect(i18n.t("common:actions.close")).toBe("Close");
  });

  it("does not mutate the bundled catalogues across instances", async () => {
    const a = await createI18n({ appId: "clinical", initialLanguage: "rw" });
    const bundle = a.i18n.getResourceBundle("rw", "common") as { actions: Record<string, string> };
    delete bundle.actions["back"];
    const b = await createI18n({ appId: "clinical", initialLanguage: "rw" });
    expect(b.t("common:actions.back")).toBe("Subira inyuma");
  });

  it("records a key missing in every language (never blank)", async () => {
    const warn = vi.fn();
    const i18n = await createI18n({ appId: "clinical", isDev: true, warn });
    const out = (i18n.t as (key: string) => string)("common:noSuchKey");
    expect(out).not.toBe("");
    expect(getMissingKeyReport()).toEqual([
      { lng: "en", ns: "common", key: "noSuchKey", kind: "missing" },
    ]);
  });

  it("is silent in production builds", async () => {
    const warn = vi.fn();
    const i18n = await createI18n({ appId: "clinical", initialLanguage: "rw", warn });
    const bundle = i18n.i18n.getResourceBundle("rw", "common") as {
      actions: Record<string, string>;
    };
    delete bundle.actions["next"];
    expect(i18n.t("common:actions.next")).toBe("Next");
    expect(warn).not.toHaveBeenCalled();
    expect(getMissingKeyReport()).toEqual([]);
  });
});

describe("createTestI18n", () => {
  it("is ready synchronously", () => {
    expect(createTestI18n().t("common:actions.retry")).toBe("Try again");
    expect(createTestI18n("rw").t("common:actions.retry")).toBe("Ongera ugerageze");
  });
});
