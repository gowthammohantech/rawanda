/**
 * ADM-09 (offline): the lazy page chunks of the router. After sign-in the shell fetches every one
 * in the background (`prefetchPageChunks`), so a browser that goes offline can still open every
 * dashboard (the data is local in IndexedDB). Failures are ignored (on-demand load then).
 */
const PAGE_LOADERS: Array<() => Promise<unknown>> = [];

export function registerPageLoader(load: () => Promise<unknown>): void {
  PAGE_LOADERS.push(load);
}

export function prefetchPageChunks(): void {
  for (const load of PAGE_LOADERS) void load().catch(() => undefined);
}
