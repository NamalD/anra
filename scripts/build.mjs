#!/usr/bin/env node
// Builds a static, installable (PWA) copy of the Chiriboga engine into dist/.
//
// The engine's pages are plain HTML (upstream's PHP only produced cache-busting
// query strings and script lists, which this script fills in). Mobile/PWA
// additions from mobile/ are injected into every page.

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
  if (SKIP.has(entry) || PAGES.includes(entry.replace(/\.html$/, ""))) continue;
  fs.cpSync(path.join(engineDir, entry), path.join(dist, entry), { recursive: true });
}
fs.cpSync(mobileDir, path.join(dist, "mobile"), { recursive: true });
fs.renameSync(path.join(dist, "mobile", "sw.js"), path.join(dist, "sw.js"));
fs.renameSync(path.join(dist, "mobile", "manifest.webmanifest"), path.join(dist, "manifest.webmanifest"));

// Short content hash of a file in dist/, used as its cache-busting version.
const versions = new Map();
function version(rel) {
  if (!versions.has(rel)) {
    versions.set(rel, createHash("sha256").update(fs.readFileSync(path.join(dist, rel))).digest("hex").slice(0, 8));
  }
  return versions.get(rel);
}

// The engine shows this as the game's version date (utility.js).
let versionReference = Math.floor(Date.now() / 1000);
try {
  versionReference = Number(execFileSync("git", ["log", "-1", "--format=%ct"], { cwd: root, encoding: "utf8" }).trim()) || versionReference;
} catch {}

const setVersions = Object.fromEntries(
  fs.readdirSync(path.join(dist, "sets")).filter((f) => f.endsWith(".js")).sort()
    .map((f) => [f.replace(/\.js$/, ""), version("sets/" + f)]),
);
const preconScripts = fs.readdirSync(path.join(dist, "precons")).filter((f) => f.endsWith(".js")).sort()
  .map((f) => `<script src="precons/${f}?v=${version("precons/" + f)}"></script>`);

const HEAD_INJECT = [
  '<meta name="theme-color" content="#0b0c0f">',
  '<meta name="mobile-web-app-capable" content="yes">',
  '<link rel="manifest" href="manifest.webmanifest">',
  '<link rel="icon" href="mobile/icons/icon-192.png">',
  '<link rel="stylesheet" href="mobile/mobile.css">',
  '<script src="mobile/feedback.js"></script>',
  '<script src="mobile/mobile.js"></script>',
  '<script src="mobile/reader.js"></script>',
].join("\n");

const phpLinks = /\b(index|engine|decklauncher|gauntlet)\.php\b/g;

function renderPage(name) {
  let html = fs.readFileSync(path.join(engineDir, `${name}.html`), "utf8");
  const eol = html.includes("\r\n") ? "\r\n" : "\n";
  html = html
    .replace(/^([ \t]*)<!-- build:precons -->[ \t]*$/m, (m, indent) => preconScripts.map((s) => indent + s).join(eol))
    .replace("__SET_VERSIONS__", JSON.stringify(setVersions))
    .replace("__VERSION_REFERENCE__", String(versionReference))
    .replace(/<\/head>/i, `${HEAD_INJECT}\n</head>`)
    // Versioned URLs for scripts, stylesheets and the card database, so a
    // fresh page never picks up stale copies from the HTTP cache.
    .replace(/(<(?:script|link)\b[^>]*\s(?:src|href)=")([^"?#:]+)(")/g, (m, pre, file, post) =>
      fs.existsSync(path.join(dist, file)) && file !== "manifest.webmanifest" ? `${pre}${file}?v=${version(file)}${post}` : m)
    .replace(/'carddata\/carddata\.json'/g, `'carddata/carddata.json?v=${version("carddata/carddata.json")}'`);
  fs.writeFileSync(path.join(dist, `${name}.html`), html);
}
PAGES.forEach(renderPage);

// The engine's scripts still link to the upstream PHP page names.
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
const buildVersion = hash.digest("hex").slice(0, 12);

const swPath = path.join(dist, "sw.js");
fs.writeFileSync(
  swPath,
  fs
    .readFileSync(swPath, "utf8")
    .replace("__VERSION__", buildVersion)
    .replace("__PRECACHE__", JSON.stringify(["./", ...precache])),
);
fs.writeFileSync(path.join(dist, ".nojekyll"), "");

console.log(`Built dist/ (${precache.length} precached files, version ${buildVersion})`);

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}
