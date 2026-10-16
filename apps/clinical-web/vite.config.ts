import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Clinical Web Portal (FND-11): http://localhost:5173/clinical/* — `strictPort` fails fast when
 * the port is taken instead of silently moving to another one. Fully offline (no CDN).
 */
export default defineConfig({
  base: "/",
  plugins: [react(), tailwindcss()],
  server: { port: 5173, strictPort: true, host: "localhost" },
  preview: { port: 5173, strictPort: true, host: "localhost" },
  build: { chunkSizeWarningLimit: 1500 },
});
