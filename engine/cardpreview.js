// Shows a card image beside the mouse pointer while hovering a card in a deck list:
// the gauntlet's .deck-card-entry rows and the deck builder's "Current deck" textarea.
// Mouse only; touch keeps tap-to-open-lightbox.
(function () {
  var GAP = 16;
  var preview = null;
  var shownId = -1;

  function Preview() {
    if (!preview) {
      preview = document.createElement("img");
      preview.id = "card-hover-preview";
      preview.alt = "";
      document.body.appendChild(preview);
    }
    return preview;
  }

  function Show(cardId, x, y) {
    if (typeof cardSet === "undefined" || !cardSet[cardId]) return Hide();
    var img = Preview();
    if (cardId !== shownId) {
      img.src = GetImagePath(cardSet[cardId].imageFile);
      shownId = cardId;
    }
    img.classList.add("visible");
    var w = img.offsetWidth, h = img.offsetHeight;
    var left = x + GAP;
    if (left + w > window.innerWidth - 8) left = x - GAP - w;
    var top = Math.min(Math.max(8, y - h / 2), window.innerHeight - h - 8);
    img.style.left = Math.max(8, left) + "px";
    img.style.top = top + "px";
  }

  function Hide() {
    if (preview) preview.classList.remove("visible");
  }

  // Which line of a textarea is under clientY, found by laying the text out in a hidden
  // copy of the textarea so wrapped lines are counted correctly.
  var mirror = null, mirrorKey = "";
  function LineAt(ta, clientY) {
    var cs = getComputedStyle(ta);
    var key = ta.value + "|" + ta.clientWidth + "|" + cs.font;
    if (!mirror) {
      mirror = document.createElement("div");
      mirror.setAttribute("aria-hidden", "true");
      mirror.style.cssText = "position:absolute;left:-9999px;top:0;visibility:hidden;white-space:pre-wrap;overflow-wrap:break-word;";
      document.body.appendChild(mirror);
    }
    if (key !== mirrorKey) {
      ["fontFamily", "fontSize", "fontWeight", "letterSpacing", "lineHeight", "paddingLeft", "paddingRight", "tabSize"].forEach(function (p) {
        mirror.style[p] = cs[p];
      });
      mirror.style.width = ta.clientWidth + "px";
      mirror.style.boxSizing = "border-box";
      mirror.textContent = "";
      ta.value.split("\n").forEach(function (line) {
        var div = document.createElement("div");
        div.textContent = line || "​";
        mirror.appendChild(div);
      });
      mirrorKey = key;
    }
    var rect = ta.getBoundingClientRect();
    var y = clientY - rect.top - ta.clientTop - parseFloat(cs.paddingTop) + ta.scrollTop;
    var lines = mirror.children;
    for (var i = 0; i < lines.length; i++) {
      if (y >= lines[i].offsetTop && y < lines[i].offsetTop + lines[i].offsetHeight) return lines[i].textContent;
    }
    return null;
  }

  function CardIdFromLine(line) {
    if (!line || typeof GetCardIdFromTitle !== "function") return -1;
    var title = line.replace(/^\s*\d+\s*x?\s+/i, "").trim();
    return title ? GetCardIdFromTitle(title) : -1;
  }

  function IsMouse(e) {
    return e.originalEvent.pointerType === "mouse";
  }
  $(document).on("pointermove", ".deck-card-entry[data-card-id]", function (e) {
    if (IsMouse(e)) Show(parseInt($(this).attr("data-card-id")), e.clientX, e.clientY);
  });
  $(document).on("pointermove", "textarea#deck", function (e) {
    if (!IsMouse(e)) return;
    var id = CardIdFromLine(LineAt(this, e.clientY));
    if (id > -1) Show(id, e.clientX, e.clientY); else Hide();
  });
  $(document).on("pointerleave", ".deck-card-entry, textarea#deck", Hide);
  $(document).on("pointerdown keydown", Hide);
  window.addEventListener("scroll", Hide, true);
})();
