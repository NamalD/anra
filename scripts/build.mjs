#!/usr/bin/env node
// Builds a static, installable (PWA) copy of the Chiriboga engine into dist/.
//
// The upstream engine is a set of PHP pages, but PHP is only used for
// cache-busting query strings and file includes, so each page is rendered
// once at build time with the PHP CLI and saved as plain HTML. Mobile/PWA
// additions from mobile/ are then injected into every page.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const engineDir = path.join(root, "engine");
const mobileDir = path.join(root, "mobile");
const dist = path.join(root, "dist");

const PAGES = ["index", "engine", "decklauncher", "gauntlet"];
// Upstream files that only make sense on a PHP server or for developers.
const SKIP = new Set(["README.md", "documentation", "manifest.json", "UPSTREAM_COMMIT"]);

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

for (const entry of fs.readdirSync(engineDir)) {
  if (SKIP.has(entry) || entry.endsWith(".php")) continue;
  fs.cpSync(path.join(engineDir, entry), path.join(dist, entry), { recursive: true });
}
fs.cpSync(mobileDir, path.join(dist, "mobile"), { recursive: true });
fs.renameSync(path.join(dist, "mobile", "sw.js"), path.join(dist, "sw.js"));
fs.renameSync(path.join(dist, "mobile", "manifest.webmanifest"), path.join(dist, "manifest.webmanifest"));

const HEAD_INJECT = [
  '<meta name="theme-color" content="#0b1114">',
  '<meta name="mobile-web-app-capable" content="yes">',
  '<link rel="manifest" href="manifest.webmanifest">',
  '<link rel="icon" href="mobile/icons/icon-192.png">',
  '<link rel="stylesheet" href="mobile/mobile.css">',
  '<script src="mobile/mobile.js"></script>',
  '<script src="mobile/reader.js"></script>',
].join("\n");

const phpLinks = /\b(index|engine|decklauncher|gauntlet)\.php\b/g;

function renderPage(name) {
  let html = execFileSync("php", ["-d", "display_errors=stderr", `${name}.php`], {
    cwd: engineDir,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  html = html
    // Drop Google Analytics; the app is meant to run privately/offline.
    .replace(/<!-- Google Analytics -->[\s\S]*?gtag\('config'[^<]*<\/script>/, "")
    .replace(/<link rel="manifest" href="manifest\.json">/, "")
    .replace(/<link href="images\/favicon\.ico" rel="icon">/, "")
    // The menu shows the visitor's IP address, which is meaningless offline.
    .replace(/IP: Unknown/g, "NODE: LOCAL")
    .replace(phpLinks, "$1.html")
    .replace(/<\/head>/i, `${HEAD_INJECT}\n</head>`);
  fs.writeFileSync(path.join(dist, `${name}.html`), html);
}
PAGES.forEach(renderPage);

// Rewrite page links inside the engine's scripts as well.
for (const file of walk(dist)) {
  if (!file.endsWith(".js") || file.includes(`${path.sep}mobile${path.sep}`)) continue;
  const src = fs.readFileSync(file, "utf8");
  if (phpLinks.test(src)) fs.writeFileSync(file, src.replace(phpLinks, "$1.html"));
  phpLinks.lastIndex = 0;
}

// Everything except card art is precached so the app works offline.
const precache = walk(dist)
  .map((f) => path.relative(dist, f).split(path.sep).join("/"))
  .filter((f) => f !== "sw.js" && !f.startsWith("images/") && !f.endsWith(".map"))
  .sort();
const hash = createHash("sha256");
for (const f of [...precache, "sw.js"]) hash.update(f).update(fs.readFileSync(path.join(dist, f)));
const version = hash.digest("hex").slice(0, 12);

const swPath = path.join(dist, "sw.js");
fs.writeFileSync(
  swPath,
  fs
    .readFileSync(swPath, "utf8")
    .replace("__VERSION__", version)
    .replace("__PRECACHE__", JSON.stringify(["./", ...precache])),
);
fs.writeFileSync(path.join(dist, ".nojekyll"), "");

console.log(`Built dist/ (${precache.length} precached files, version ${version})`);

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}
