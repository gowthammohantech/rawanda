/**
 * Static SPA server for the Expo web export (CTZ-09 web E2E): serves `web-build/`, falling back
 * to `index.html` for client routes (`/health/…`). Usage: `node e2e/serve.mjs <dir> <port>`.
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";

const root = resolve(process.argv[2] ?? "web-build");
const port = Number(process.argv[3] ?? "8092");
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".ico": "image/x-icon",
};

createServer((request, response) => {
  const pathname = decodeURIComponent((request.url ?? "/").split("?")[0] ?? "/");
  let file = join(root, pathname);
  if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) {
    file = join(root, "index.html");
  }
  response.writeHead(200, {
    "content-type": TYPES[extname(file)] ?? "application/octet-stream",
  });
  createReadStream(file).pipe(response);
}).listen(port, "127.0.0.1", () => {
  process.stdout.write(`serving ${root} on http://127.0.0.1:${port}\n`);
});
