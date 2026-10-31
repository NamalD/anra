#!/usr/bin/env node
// Screenshots of every screen of the built app at Pixel 8 size (412x915 CSS px,
// 2x), in portrait and landscape, using Playwright's Firefox. Requires a build
// (`npm run build`) and the browser (`npx playwright install firefox`).
//
//   node scripts/screenshots.mjs [--out screenshots] [--only menu,board-turn] [--base http://host/]
//
// Writes <out>/<scene>.png and <out>/console.txt (console errors per page).
import fs from "node:fs";
import path from "node:path";
import { firefox } from "playwright";
import { serve } from "./serve.mjs";

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith("--") ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true] : [])).filter((e) => e.length));
const out = path.resolve(args.out || "screenshots");
const only = args.only ? String(args.only).split(",") : null;
fs.mkdirSync(out, { recursive: true });

const server = args.base ? null : await serve("dist");
const base = args.base || server.url;
const browser = await firefox.launch();
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function newPage(landscape) {
  const context = await browser.newContext({
    viewport: landscape ? { width: 915, height: 412 } : { width: 412, height: 915 },
    deviceScaleFactor: 2,
    hasTouch: true,
  });
  const page = await context.newPage();
  const label = () => page.url().split("/").pop().split("?")[0] || "?";
  page.on("console", (m) => { if (m.type() === "error") errors.push(`[${label()}] ${m.text()}`); });
  page.on("pageerror", (e) => errors.push(`[${label()}] pageerror: ${e.message}`));
  // Let the service worker take control: it serves the placeholder card art
  // and backs that the engine's loader waits for.
  await page.goto(base + "index.html", { waitUntil: "networkidle" });
  await page.evaluate(() => navigator.serviceWorker.ready).catch(() => {});
  await page.reload({ waitUntil: "networkidle" });
  return { page, context };
}
const shot = (page, name) => page.screenshot({ path: path.join(out, name + ".png") });

// URL of a fixed runner-vs-corp game (the two System Gateway starter decks),
// built the way the menu's quick game builds its own.
async function gameUrl(page) {
  return page.evaluate(() => {
    function json(d) { const j = { identity: parseInt(d.identity), cards: [], name: d.name, notes: d.notes, url: d.URL }; for (const id in d.cards) for (let i = 0; i < d.cards[id]; i++) j.cards.push(parseInt(id)); return j; }
    const r = preconDecks.find((d) => d.name === "Gateway Runner");
    const c = preconDecks.find((d) => d.name === "Gateway Corp");
    return "engine.html?p=r&c=" + LZString.compressToEncodedURIComponent(JSON.stringify(json(c))) + "&r=" + LZString.compressToEncodedURIComponent(JSON.stringify(json(r)));
  });
}
async function openGame(page, extra = "") {
  await page.goto(base + (await gameUrl(page)) + extra, { waitUntil: "networkidle" });
  await page.waitForFunction(() => { const l = document.getElementById("loading"); return !l || getComputedStyle(l).display === "none"; }, null, { timeout: 60000 }).catch(() => {});
  await sleep(2500);
}
// Screen position of the centre of a card in the runner's grip.
const gripCard = (page, i) => page.evaluate((i) => { const c = runner.grip[i]; if (!c || !c.renderer) return null; const b = c.renderer.sprite.getBounds(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, i);
async function keepHand(page) {
  const keep = page.locator('#footer .button:has-text("Keep")');
  if (await keep.count()) await keep.first().click();
  await sleep(9000); // the corp takes its first turn
}
async function openGauntlet(page) {
  await page.locator('.menu-item:has-text("Gauntlet")').first().click();
  await sleep(300);
  await page.locator("#gauntlet-submenu .menu-item-sub").first().click();
  await page.waitForURL(/gauntlet\.html/, { timeout: 15000 });
  await sleep(2500);
}
async function dismissModal(page) {
  const btn = page.locator(".modal:visible .button.primary, .modal:visible .button").first();
  if (await btn.count()) { await btn.click(); await sleep(600); }
}

const SCENES = [
  ["menu", async (p) => { await sleep(600); await shot(p, "menu"); }],
  ["menu-land", async (p) => { await sleep(600); await shot(p, "menu-land"); }, true],
  ...["settings", "achievements", "tutorial", "credits"].map((panel) => [`menu-${panel}`, async (p) => {
    const trigger = panel === "credits" ? p.locator("a:has-text('Credits')").first() : p.locator(`.menu-item:has-text("${panel[0].toUpperCase() + panel.slice(1)}")`).first();
    await trigger.click(); await sleep(500); await shot(p, `menu-${panel}`);
  }]),
  ["menu-gauntlet", async (p) => { await p.locator('.menu-item:has-text("Gauntlet")').first().click(); await sleep(400); await shot(p, "menu-gauntlet"); }],
  ["card-images", async (p) => { await p.goto(base + "mobile/setup.html", { waitUntil: "networkidle" }); await sleep(500); await shot(p, "card-images"); }],
  ["deckbuilder", async (p) => { await p.goto(base + "decklauncher.html?p=r", { waitUntil: "networkidle" }); await sleep(2000); await shot(p, "deckbuilder"); }],
  ["deckbuilder-land", async (p) => { await p.goto(base + "decklauncher.html?p=r", { waitUntil: "networkidle" }); await sleep(2000); await shot(p, "deckbuilder-land"); }, true],
  ["deckbuilder-lightbox", async (p) => { await p.goto(base + "decklauncher.html?p=c", { waitUntil: "networkidle" }); await sleep(2000); await p.locator("#cardcontainer .card-item .card-image").first().click(); await sleep(700); await shot(p, "deckbuilder-lightbox"); }],
  ["deckbuilder-save", async (p) => { await p.goto(base + "decklauncher.html?p=r", { waitUntil: "networkidle" }); await sleep(1500); await p.locator("#savedeck").click(); await sleep(400); await shot(p, "deckbuilder-save"); }],
  ["gauntlet-welcome", async (p) => { await openGauntlet(p); await shot(p, "gauntlet-welcome"); }],
  ["gauntlet", async (p) => { await openGauntlet(p); await dismissModal(p); await shot(p, "gauntlet"); }],
  ["gauntlet-land", async (p) => { await openGauntlet(p); await dismissModal(p); await shot(p, "gauntlet-land"); }, true],
  ["gauntlet-shop", async (p) => { await openGauntlet(p); await dismissModal(p); await p.locator('button:has-text("Buy / sell cards")').click(); await sleep(700); await shot(p, "gauntlet-shop"); await p.locator(".modal:visible .button.option").first().click(); await sleep(1500); await shot(p, "gauntlet-pack"); }],
  ["board-mulligan", async (p) => { await openGame(p); await shot(p, "board-mulligan"); }],
  ["board-mulligan-land", async (p) => { await openGame(p); await shot(p, "board-mulligan-land"); }, true],
  ["board-turn", async (p) => { await openGame(p); await keepHand(p); await shot(p, "board-turn"); await sleep(6000); await shot(p, "board-turn-later"); }],
  ["board-turn-land", async (p) => { await openGame(p); await keepHand(p); await shot(p, "board-turn-land"); }, true],
  ["board-reader", async (p) => { await openGame(p); const pos = await gripCard(p, 2); if (pos) { await p.touchscreen.tap(pos.x, pos.y); await sleep(900); } await shot(p, "board-reader"); }],
  ["board-menu", async (p) => { await openGame(p); await p.locator("#menubar .menu-trigger").click(); await sleep(500); await shot(p, "board-menu"); }],
  ["board-deckinfo", async (p) => { await openGame(p); await p.locator("#menubar .deck-info-button").click(); await sleep(500); await shot(p, "board-deckinfo"); }],
  ["board-start", async (p) => { await openGame(p, "&showdeck=1"); await shot(p, "board-start"); }],
];

const started = Date.now();
for (const [name, run, landscape] of SCENES) {
  if (only && !only.includes(name)) continue;
  const { page, context } = await newPage(!!landscape);
  try {
    await run(page);
    console.log(`  ${name}`);
  } catch (e) {
    console.log(`  ${name}: FAILED ${e.message.split("\n")[0]}`);
    await shot(page, name + "-FAILED").catch(() => {});
  }
  await context.close();
}
await browser.close();
if (server) server.close();
fs.writeFileSync(path.join(out, "console.txt"), errors.join("\n") + "\n");
console.log(`${path.relative(process.cwd(), out)}/ written in ${Math.round((Date.now() - started) / 1000)}s; ${errors.length} console error line(s) in console.txt`);
