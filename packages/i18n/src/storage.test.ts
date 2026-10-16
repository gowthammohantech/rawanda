import { describe, expect, it } from "vitest";

import { createI18n } from "./create-i18n.ts";
import { createNativeLanguageStorage, type KeyValueStoreLike } from "./storage.native.ts";
import { createMemoryLanguageStorage, languageStorageKey, parseStoredLanguage } from "./storage.ts";
import { createWebLanguageStorage, type WebStorageLike } from "./storage.web.ts";

function fakeWebStorage(): WebStorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

describe("language storage", () => {
  it("uses the key laif.<appId>.language", () => {
    expect(languageStorageKey("clinical")).toBe("laif.clinical.language");
    expect(languageStorageKey("citizen")).toBe("laif.citizen.language");
  });

  it("parses only supported values", () => {
    expect(parseStoredLanguage("rw")).toBe("rw");
    expect(parseStoredLanguage("en")).toBe("en");
    expect(parseStoredLanguage("fr")).toBeNull();
    expect(parseStoredLanguage(null)).toBeNull();
  });

  it("memory storage round-trips", async () => {
    const storage = createMemoryLanguageStorage();
    expect(await storage.get()).toBeNull();
    await storage.set("rw");
    expect(await storage.get()).toBe("rw");
    expect(storage.peek()).toBe("rw");
  });

  it("web storage writes laif.<appId>.language and keeps apps separate", async () => {
    const backing = fakeWebStorage();
    const clinical = createWebLanguageStorage("clinical", backing);
    const admin = createWebLanguageStorage("admin", backing);
    await clinical.set("rw");
    expect(backing.data.get("laif.clinical.language")).toBe("rw");
    expect(await clinical.get()).toBe("rw");
    expect(await admin.get()).toBeNull();
    backing.data.set("laif.admin.language", "xx");
    expect(await admin.get()).toBeNull();
  });

  it("web storage surfaces failures as rejected promises (caught by createI18n)", async () => {
    const storage = createWebLanguageStorage("clinical", {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    });
    await expect(storage.get()).rejects.toThrow("SecurityError");
    await expect(storage.set("en")).rejects.toThrow("QuotaExceededError");
  });

  it("web storage rejects with a clear error when localStorage is absent (never throws on create)", async () => {
    const storage = createWebLanguageStorage("clinical");
    await expect(storage.get()).rejects.toThrow("localStorage is not available");
    await expect(storage.set("rw")).rejects.toThrow("localStorage is not available");
  });

  it("createI18n still starts and switches in memory when localStorage is absent", async () => {
    const i18n = await createI18n({
      appId: "clinical",
      storage: createWebLanguageStorage("clinical"),
    });
    expect(i18n.language).toBe("en");
    await i18n.setLanguage("rw");
    expect(i18n.language).toBe("rw");
  });

  it("native storage uses the injected kv-store", async () => {
    const data = new Map<string, string>();
    const kv: KeyValueStoreLike = {
      getItem: (key) => Promise.resolve(data.get(key) ?? null),
      setItem: (key, value) => {
        data.set(key, value);
        return Promise.resolve();
      },
    };
    const storage = createNativeLanguageStorage("worker", kv);
    expect(await storage.get()).toBeNull();
    await storage.set("rw");
    expect(data.get("laif.worker.language")).toBe("rw");
    expect(await storage.get()).toBe("rw");
  });
});
