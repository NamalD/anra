// Phone/PWA tweaks layered on top of the Chiriboga pages.
// Loaded at the end of <head> on every page, after the engine's own scripts.
(function () {
  var html = document.documentElement;
  var page = (location.pathname.split("/").pop() || "index.html").replace(/\.html$/, "") || "index";
  html.classList.add("anra", "anra-" + page);
  if (matchMedia("(display-mode: standalone), (display-mode: fullscreen)").matches) {
    html.classList.add("anra-installed");
  }

  if ("serviceWorker" in navigator) {
    var base = document.currentScript ? new URL("../", document.currentScript.src) : new URL("./", location);
    navigator.serviceWorker.register(new URL("sw.js", base)).then(function (reg) {
      // An installed app can stay open for days; check for a new version
      // whenever it comes back to the foreground.
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "visible") reg.update().catch(function () {});
      });
    }).catch(function (e) {
      console.warn("Service worker registration failed", e);
    });

    // A new version has taken over: reload to show it, except mid-game,
    // where it's picked up on the next page (e.g. back at the menu).
    var hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (!hadController) return; // first install, nothing old on screen
      if (page === "engine") showUpdateNotice();
      else location.reload();
    });
  }

  function showUpdateNotice() {
    var notice = document.createElement("div");
    notice.className = "anra-update";
    notice.textContent = "Update installed. It will load after this game.";
    document.body.appendChild(notice);
    setTimeout(function () { notice.remove(); }, 6000);
  }

  // Render the PixiJS board at the phone's real pixel density (capped for
  // performance) instead of 1x, which looks blurry on a Pixel screen. The
  // engine treats renderer.width/height as layout units, so keep those in
  // CSS pixels.
  if (window.PIXI && PIXI.Application) {
    var Original = PIXI.Application;
    var resolution = Math.min(window.devicePixelRatio || 1, 2);
    var Patched = function (width, height, options) {
      if (typeof width === "object") return new Original(width);
      options = Object.assign({ resolution: resolution }, options || {});
      var app = new Original(width, height, options);
      if (app.renderer.resolution !== 1) {
        Object.defineProperty(app.renderer, "width", {
          get: function () { return this.screen.width; },
        });
        Object.defineProperty(app.renderer, "height", {
          get: function () { return this.screen.height; },
        });
      }
      return app;
    };
    Patched.prototype = Original.prototype;
    PIXI.Application = Patched;
  }

  if (page === "engine") {
    // Long-press is the engine's "zoom card" gesture; stop Chrome's context
    // menu and text selection callouts from competing with it.
    document.addEventListener("contextmenu", function (e) {
      if (e.target && e.target.tagName === "CANVAS") e.preventDefault();
    });

    // Keep the screen on while a game is open; games are slow-paced and the
    // phone would otherwise dim mid-turn. The lock drops when the app is
    // backgrounded, so take it again on return.
    var wakeLock = null;
    var keepAwake = function () {
      if (!("wakeLock" in navigator) || document.visibilityState !== "visible" || wakeLock) return;
      navigator.wakeLock.request("screen").then(function (lock) {
        wakeLock = lock;
        lock.addEventListener("release", function () { wakeLock = null; });
      }).catch(function () {});
    };
    document.addEventListener("visibilitychange", keepAwake);
    document.addEventListener("pointerdown", keepAwake, { once: true });
    keepAwake();
  }

  if (page === "index") {
    document.addEventListener("DOMContentLoaded", addMenuEntries);
  }

  function addMenuEntries() {
    var setupUrl = "mobile/setup.html";
    var menu = document.getElementById("menu-buttons");
    if (!menu || menu.querySelector(".anra-images-entry")) return;
    var item = document.createElement("div");
    item.className = "menu-item anra-images-entry";
    item.dataset.icon = "images";
    item.innerHTML =
      '<span class="mi-title">Card images</span><span class="mi-sub">Download art for offline play</span>';
    item.addEventListener("click", function () { location.href = setupUrl; });
    menu.appendChild(item);
  }
})();
