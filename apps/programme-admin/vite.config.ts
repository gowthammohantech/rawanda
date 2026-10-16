import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Programme Admin Dashboard (FND-11): http://localhost:5174/admin/* — `strictPort` fails fast when
 * the port is taken instead of silently moving to another one. Fully offline (no CDN).
 */
export default defineConfig({
  base: "/",
  plugins: [react(), tailwindcss()],
  server: { port: 5174, strictPort: true, host: "localhost" },
  preview: { port: 5174, strictPort: true, host: "localhost" },
  build: { chunkSizeWarningLimit: 1500 },
});
