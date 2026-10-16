import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));

/** `pnpm --filter @laif/ui-web gallery` → http://localhost:5179 (offline: no CDN requests). */
export default defineConfig({
  root,
  plugins: [react(), tailwindcss()],
  server: { port: 5179, strictPort: true, host: "localhost" },
  preview: { port: 5179, strictPort: true, host: "localhost" },
  build: {
    outDir: fileURLToPath(new URL("../dist/gallery", import.meta.url)),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1000,
  },
});
