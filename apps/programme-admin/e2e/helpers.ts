/**
 * E2E helpers: demo sign-in through the UI, and an IndexedDB snapshot reader for the Dexie
 * store `laif-admin` (the browser-side counterpart of `@laif/test-utils` `readStoreCollection`:
 * same collection names, id-ordered documents).
 */
import { expect, type Page } from "@playwright/test";

export async function signInAs(page: Page, personaName: RegExp, scope?: RegExp): Promise<void> {
  await expect(page.getByRole("heading", { level: 1, name: "Demo sign-in" })).toBeVisible();
  await page
    .getByRole("group", { name: "Choose a demo persona" })
    .getByRole("radio", { name: personaName })
    .check();
  if (scope !== undefined) {
    await page.getByRole("button", { name: "Continue" }).click();
    await page
      .getByRole("group", { name: "Choose reporting scope" })
      .getByRole("radio", { name: scope })
      .check();
  }
  await page.getByRole("button", { name: "Start demo session" }).click();
  await expect(page.getByTestId("app-shell")).toBeVisible();
}

/** Every document of a collection in the app's IndexedDB (`laif-admin`). */
export async function readStoreCollection<T = Record<string, unknown>>(
  page: Page,
  collection: string,
  dbName = "laif-admin",
): Promise<T[]> {
  return page.evaluate(
    ({ dbName: name, collection: table }) =>
      new Promise<T[]>((resolve, reject) => {
        const open = indexedDB.open(name);
        open.onerror = () => reject(open.error ?? new Error("indexedDB open failed"));
        open.onsuccess = () => {
          const db = open.result;
          const request = db.transaction(table, "readonly").objectStore(table).getAll();
          request.onerror = () => reject(request.error ?? new Error("indexedDB read failed"));
          request.onsuccess = () => {
            db.close();
            resolve(request.result as T[]);
          };
        };
      }),
    { dbName, collection },
  );
}
