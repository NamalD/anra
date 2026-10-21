// Service worker: precaches the app for offline play and serves card art.
//
// Card art is not distributed with this app. Images live in IMAGE_CACHE,
// filled either by the player importing the art pack (mobile/setup.html) or
// by fetching each card's art from NetrunnerDB the first time it's needed.
// Anything still missing is drawn as a placeholder: text cards built from
// carddata.json, plain card backs, and simple UI glyphs.

const VERSION = "__VERSION__";
const PRECACHE = __PRECACHE__;
const APP_CACHE = "anra-app-" + VERSION;
const IMAGE_CACHE = "anra-images";
const BASE = new URL("./", self.registration.scope);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(APP_CACHE)
      .then((cache) =>
        // One bad file shouldn't stop the whole app from installing.
        Promise.all(
          PRECACHE.map((p) =>
            cache.add(new URL(p, BASE)).catch((e) => console.warn("precache failed", p, e)),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("anra-app-") && k !== APP_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname)) return;
  const rel = url.pathname.slice(BASE.pathname.length);
  if (rel.startsWith("images/")) {
    event.respondWith(serveImage(rel));
  } else {
    event.respondWith(serveApp(req));
  }
});

async function serveApp(req) {
  const cached = await caches.match(req, { ignoreSearch: true, cacheName: APP_CACHE });
  if (cached) return cached;
  // Navigations to a page with a query string (all game pages use them).
  const url = new URL(req.url);
  if (req.mode === "navigate") {
    const page = await caches.match(new URL(url.pathname, BASE), { cacheName: APP_CACHE });
    if (page) return page;
  }
  return fetch(req);
}

async function serveImage(rel) {
  const key = new URL(rel, BASE).href;
  const hit = await caches.match(key, { cacheName: IMAGE_CACHE });
  if (hit) return hit;
  try {
    const res = await fetch(key);
    const type = res.headers.get("content-type") || "";
    if (res.ok && type.startsWith("image/")) return res;
  } catch (e) {
    // offline; fall through
  }
  const code = cardCode(rel);
  if (code) {
    const art = await fetchCardArt(code);
    if (art) {
      const cache = await caches.open(IMAGE_CACHE);
      await cache.put(key, art.clone());
      return art;
    }
  }
  return placeholder(rel);
}

// "images/01001.png" or "images/hires/01001.jpg" -> "01001"
function cardCode(rel) {
  const m = /^images\/(?:hires\/)?(\d{5})\.(?:png|jpe?g)$/i.exec(rel);
  return m ? m[1] : null;
}

// The card's art from NetrunnerDB (the source carddata.json names). Fetched
// with CORS so the image can be used as a WebGL texture; if that's refused
// or we're offline, the caller falls back to a text card.
async function fetchCardArt(code) {
  try {
    const { template } = await cards();
    if (!template) return null;
    const res = await fetch(template.replace("{code}", code), { mode: "cors", credentials: "omit" });
    const type = res.headers.get("content-type") || "";
    return res.ok && type.startsWith("image/") ? res : null;
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Placeholders

const FACTION_COLOURS = {
  anarch: "#e2531c",
  criminal: "#2a6fd1",
  shaper: "#44a83c",
  "haas-bioroid": "#7b47c0",
  jinteki: "#c0262d",
  nbn: "#e2a91c",
  "weyland-consortium": "#2f6f5e",
  neutral: "#8b9599",
  "neutral-runner": "#8b9599",
  "neutral-corp": "#8b9599",
  adam: "#b59b49",
  apex: "#a33a2b",
  "sunny-lebeau": "#5d5d5d",
};

let cardIndex = null;
async function cards() {
  if (cardIndex) return cardIndex;
  const url = new URL("carddata/carddata.json", BASE);
  const res = (await caches.match(url, { cacheName: APP_CACHE })) || (await fetch(url));
  const json = await res.json();
  cardIndex = {
    byCode: new Map(json.data.map((c) => [c.code, c])),
    template: json.imageUrlTemplate,
  };
  return cardIndex;
}

async function placeholder(rel) {
  const name = rel.split("/").pop().replace(/\.[a-z]+$/i, "");
  let svg;
  if (/^\d{5}$/.test(name)) {
    const card = (await cards()).byCode.get(name);
    svg = card ? cardSvg(card) : blankCardSvg(name);
  } else if (/^(corp|runner)_back$/i.test(name)) {
    svg = backSvg(/^corp/i.test(name));
  } else if (/^\d+$/.test(name)) {
    svg = blankCardSvg("Gauntlet " + name);
  } else {
    svg = glyphSvg(name);
  }
  return new Response(svg, {
    headers: { "content-type": "image/svg+xml", "cache-control": "no-store" },
  });
}

const W = 300;
const H = 419;

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrap(text, max) {
  const lines = [];
  for (const para of String(text).split(/\n+/)) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      if (!word) continue;
      if ((line + " " + word).trim().length > max) {
        if (line) lines.push(line);
        line = word;
      } else {
        line = (line + " " + word).trim();
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function svgDoc(body, bg) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="14" fill="${bg}" stroke="#000" stroke-width="2"/>` +
    body +
    `</svg>`
  );
}

function cardSvg(c) {
  const colour = FACTION_COLOURS[c.faction_code] || "#8b9599";
  const font = "font-family='Play, Helvetica, Arial, sans-serif'";
  const parts = [];
  parts.push(`<rect x="10" y="10" width="${W - 20}" height="${H - 20}" rx="9" fill="#14191c" stroke="${colour}" stroke-width="4"/>`);
  parts.push(`<rect x="10" y="10" width="${W - 20}" height="58" rx="9" fill="${colour}"/>`);

  const titleLines = wrap(c.title, 22).slice(0, 2);
  titleLines.forEach((t, i) => {
    const y = titleLines.length === 1 ? 48 : 34 + i * 25;
    parts.push(`<text x="${W / 2}" y="${y}" ${font} font-size="22" font-weight="bold" fill="#fff" text-anchor="middle">${esc(t)}</text>`);
  });

  const type = (c.type_code || "").replace(/-/g, " ").toUpperCase();
  const typeLine = c.keywords ? `${type}: ${c.keywords}` : type;
  parts.push(`<text x="${W / 2}" y="94" ${font} font-size="15" fill="${colour}" font-weight="bold" text-anchor="middle">${esc(typeLine)}</text>`);

  // Stat badges along the top of the text box.
  const stats = [];
  if (c.cost != null) stats.push([c.type_code === "ice" || c.type_code === "asset" || c.type_code === "upgrade" ? "REZ" : "COST", c.cost]);
  if (c.advancement_cost != null) stats.push(["ADV", c.advancement_cost]);
  if (c.agenda_points != null) stats.push(["PTS", c.agenda_points]);
  if (c.strength != null) stats.push(["STR", c.strength]);
  if (c.memory_cost != null) stats.push(["MU", c.memory_cost]);
  if (c.trash_cost != null) stats.push(["TRASH", c.trash_cost]);
  if (c.base_link != null) stats.push(["LINK", c.base_link]);
  if (c.minimum_deck_size != null) stats.push(["DECK", c.minimum_deck_size]);
  if (c.influence_limit != null) stats.push(["INF", c.influence_limit]);
  const bw = 52;
  const startX = W / 2 - (stats.length * (bw + 6) - 6) / 2;
  stats.forEach(([label, value], i) => {
    const x = startX + i * (bw + 6);
    parts.push(`<rect x="${x}" y="108" width="${bw}" height="46" rx="6" fill="#222b30" stroke="${colour}" stroke-width="1.5"/>`);
    parts.push(`<text x="${x + bw / 2}" y="138" ${font} font-size="22" font-weight="bold" fill="#fff" text-anchor="middle">${esc(value)}</text>`);
    parts.push(`<text x="${x + bw / 2}" y="150" ${font} font-size="9" fill="#9fb0b8" text-anchor="middle">${label}</text>`);
  });

  const text = (c.stripped_text || "").replace(/\s*\[subroutine\]\s*/gi, "\n↳ ");
  let lines = wrap(text, 33);
  const maxLines = 15;
  if (lines.length > maxLines) lines = lines.slice(0, maxLines - 1).concat(["…"]);
  lines.forEach((l, i) => {
    parts.push(`<text x="22" y="${180 + i * 15.5}" ${font} font-size="13" fill="#e8eef0">${esc(l)}</text>`);
  });

  const factionName = (c.faction_code || "").replace(/-/g, " ").toUpperCase();
  const inf = c.faction_cost ? " · " + "●".repeat(Math.min(c.faction_cost, 5)) : "";
  parts.push(`<text x="${W / 2}" y="${H - 22}" ${font} font-size="12" fill="${colour}" text-anchor="middle">${esc(factionName + inf)}</text>`);
  return svgDoc(parts.join(""), "#000");
}

function blankCardSvg(label) {
  return svgDoc(
    `<text x="${W / 2}" y="${H / 2}" font-family="sans-serif" font-size="20" fill="#ccc" text-anchor="middle">${esc(label)}</text>`,
    "#222",
  );
}

function backSvg(isCorp) {
  const c = isCorp ? "#2b4a7a" : "#7a2b2b";
  const label = isCorp ? "CORP" : "RUNNER";
  let grid = "";
  for (let y = 30; y < H - 20; y += 24) grid += `<line x1="16" y1="${y}" x2="${W - 16}" y2="${y}" stroke="#ffffff14"/>`;
  return svgDoc(
    `<rect x="12" y="12" width="${W - 24}" height="${H - 24}" rx="9" fill="${c}"/>${grid}` +
      `<text x="${W / 2}" y="${H / 2 + 10}" font-family="sans-serif" font-size="34" font-weight="bold" fill="#ffffffcc" text-anchor="middle">${label}</text>`,
    "#111",
  );
}

// Small UI images used by the engine (counters, glows, icons).
function glyphSvg(name) {
  const n = name.toLowerCase();
  const sq = (s, body) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 64 64">${body}</svg>`;
  const disc = (fill, label, fg = "#fff") =>
    sq(64, `<circle cx="32" cy="32" r="29" fill="${fill}" stroke="#000" stroke-width="3"/><text x="32" y="43" font-family="sans-serif" font-size="30" font-weight="bold" fill="${fg}" text-anchor="middle">${label}</text>`);
  if (n.includes("credit")) return disc("#d9b43a", "¢", "#000");
  if (n.includes("click")) return disc("#3fb6c9", "⟳", "#000");
  if (n.includes("tag")) return disc("#e05a2b", "T");
  if (n.includes("advancement")) return disc("#3a77d9", "A");
  if (n.includes("bad_publicity")) return disc("#444", "BP");
  if (n.includes("core_damage")) return disc("#a32638", "✚");
  if (n.includes("hand_size")) return disc("#666", "H");
  if (n.includes("mu")) return disc("#6c4bd1", "MU");
  if (n.includes("trash")) return disc("#8b2222", "🗑");
  if (n.includes("strength")) return disc("#c94d3f", "S");
  if (n.includes("known")) return disc("#2a8a5a", "👁");
  if (n.includes("broken")) return disc("#555", "✕");
  if (n.includes("subroutine")) return sq(32, `<path d="M8 16h40l-10-10M48 16l-10 10" transform="scale(0.6)" stroke="#fff" stroke-width="6" fill="none"/>`);
  if (n.includes("glow") || n.includes("particle")) {
    return sq(64, `<defs><radialGradient id="g"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><circle cx="32" cy="32" r="32" fill="url(#g)"/>`);
  }
  if (n.startsWith("history")) return sq(50, `<rect x="2" y="2" width="60" height="60" rx="6" fill="#26323a"/>`);
  // Anything else: transparent.
  return sq(4, "");
}
