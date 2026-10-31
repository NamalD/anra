#!/usr/bin/env node
// Static server for dist/ with caching disabled, for local play and screenshots.
//   node scripts/serve.mjs [dir] [port]      (defaults: dist, 8080)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".map": "application/json", ".webmanifest": "application/manifest+json",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".txt": "text/plain; charset=utf-8",
};

// Starts serving `root`; resolves to the base URL. Port 0 picks a free port.
export function serve(root, port = 0) {
  root = path.resolve(root);
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    if (p.endsWith("/")) p += "index.html";
    const file = path.join(root, p);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404, { "content-type": "text/plain" });
      return res.end("not found");
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) =>
    server.listen(port, "127.0.0.1", () => resolve({ url: `http://127.0.0.1:${server.address().port}/`, close: () => server.close() })),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2] || "dist";
  if (!fs.existsSync(path.join(dir, "index.html"))) {
    console.error(`${dir}/ has no index.html; run \`npm run build\` first.`);
    process.exit(1);
  }
  const { url } = await serve(dir, Number(process.argv[3] || 8080));
  console.log(`Serving ${dir}/ at ${url}`);
}
