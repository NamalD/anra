// Full-screen card reader, opened by tapping a card in a game (see OnClick in
// engine/cardrenderer/cardrenderer.js). Shows the card large with its full
// text from carddata.json. Closes on tap, the ✕ button, or Android's back.
(function () {
  var cardData = null;
  var overlay = null;

  function loadCardData() {
    if (!cardData) {
      cardData = fetch("carddata/carddata.json")
        .then(function (r) { return r.json(); })
        .then(function (json) {
          var byCode = {};
          json.data.forEach(function (c) { byCode[c.code] = c; });
          return byCode;
        })
        .catch(function () { cardData = null; return {}; });
    }
    return cardData;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  var SYMBOLS = {
    credit: "¢", click: "⟳", subroutine: "↳", trash: "🗑", mu: "MU", link: "⛓",
    "recurring-credit": "↺¢", interrupt: "⚡", agenda: "◈",
    anarch: "Anarch", criminal: "Criminal", shaper: "Shaper", "haas-bioroid": "Haas-Bioroid",
    jinteki: "Jinteki", nbn: "NBN", "weyland-consortium": "Weyland",
  };

  // Card text uses a few HTML tags and [symbol] tokens; escape everything,
  // then restore just those.
  function formatText(text) {
    return escapeHtml(text || "")
      .replace(/&lt;(\/?)(strong|em|b|i)&gt;/g, "<$1$2>")
      .replace(/&lt;trace&gt;(.*?)&lt;\/trace&gt;/g, "<strong>$1</strong>")
      .replace(/&lt;errata&gt;(.*?)&lt;\/errata&gt;/g, '<span class="anra-reader-errata">$1</span>')
      .replace(/&lt;[^&]*?&gt;/g, "")
      .replace(/\[([a-z-]+)\]/g, function (m, name) {
        return '<span class="anra-reader-symbol">' + (SYMBOLS[name] || name) + "</span>";
      })
      .replace(/\n/g, "<br>");
  }

  function stats(c) {
    var out = [];
    var add = function (label, value) {
      if (value !== undefined && value !== null) out.push([label, value]);
    };
    var rezType = c.type_code === "ice" || c.type_code === "asset" || c.type_code === "upgrade";
    add(rezType ? "Rez" : "Cost", c.cost);
    add("Advance", c.advancement_cost);
    add("Points", c.agenda_points);
    add("Strength", c.strength);
    add("MU", c.memory_cost);
    add("Trash", c.trash_cost);
    add("Link", c.base_link);
    add("Deck", c.minimum_deck_size);
    add("Influence", c.influence_limit);
    if (c.faction_cost) add("Inf.", "●".repeat(c.faction_cost));
    return out
      .map(function (s) {
        return '<div class="anra-reader-stat"><b>' + escapeHtml(s[1]) + "</b><span>" + s[0] + "</span></div>";
      })
      .join("");
  }

  function close(fromPopState) {
    if (!overlay) return;
    overlay.remove();
    overlay = null;
    if (!fromPopState && history.state && history.state.anraReader) history.back();
  }

  window.addEventListener("popstate", function () { close(true); });

  window.ShowCardReader = function (card) {
    if (!card) return;
    close();
    var imageFile = card.imageFile ? ChangeImageFileToJPG(card.imageFile) : "";
    var code = (card.imageFile || "").replace(/\.[a-z]+$/i, "");

    overlay = document.createElement("div");
    overlay.className = "anra-reader";
    overlay.innerHTML =
      '<button class="anra-reader-close" aria-label="Close">✕</button>' +
      '<div class="anra-reader-body">' +
      (imageFile ? '<img class="anra-reader-image" alt="" src="images/' + escapeHtml(imageFile) + '">' : "") +
      '<div class="anra-reader-info"><h2>' + escapeHtml(card.title || "") + "</h2></div>" +
      "</div>";
    // The tap that opened the reader can also produce a click on it; ignore that one.
    var openedAt = Date.now();
    overlay.addEventListener("click", function () {
      if (Date.now() - openedAt > 350) close();
    });
    document.body.appendChild(overlay);
    history.pushState({ anraReader: true }, "");

    var info = overlay.querySelector(".anra-reader-info");
    loadCardData().then(function (byCode) {
      var c = byCode[code];
      if (!c || !overlay || !overlay.contains(info)) return;
      var type = (c.type_code || "").replace(/-/g, " ");
      info.innerHTML =
        "<h2>" + escapeHtml(c.title) + "</h2>" +
        '<div class="anra-reader-type">' + escapeHtml(type + (c.keywords ? ": " + c.keywords : "")) + "</div>" +
        '<div class="anra-reader-stats">' + stats(c) + "</div>" +
        '<div class="anra-reader-text">' + formatText(c.text) + "</div>" +
        (c.flavor ? '<div class="anra-reader-flavor">' + formatText(c.flavor) + "</div>" : "") +
        '<div class="anra-reader-faction">' + escapeHtml((c.faction_code || "").replace(/-/g, " ")) + "</div>";
    });
  };
})();
