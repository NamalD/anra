# Anra: Netrunner Solo for phones

A single-player Android: Netrunner game you can install on your phone, built on the
[Chiriboga engine](https://github.com/drbo6/chiriboga) (Netrunner: Solo Mode by DrBo6, based
on bobtheuberfish's original). It's tuned for a Pixel 8 but works on any modern Android phone.

The game is an installable web app (PWA), not a native APK. Chiriboga is already a browser
game (JavaScript + PixiJS), so a native app would only wrap the same code in a WebView. A PWA
installs to the home screen, runs full screen, works offline, and updates whenever this repo
is deployed.

## Play on your phone

1. Open <https://namald.github.io/anra/> in Chrome on the phone.
2. Chrome menu → **Add to Home screen** → **Install**.
3. Launch it from the home screen. Play in portrait or landscape; the board re-lays itself out when you rotate.

Card art isn't bundled (it isn't freely redistributable). Instead each card's art is loaded
from NetrunnerDB the first time it's needed and kept on the phone. **Card Images** in the main
menu can download all of it at once for offline play, or import the Netrunner Solo Mode image
pack (<https://chiriboga.cronbach.com/images/images.zip>), which also has the game's icons and
card backs. Any card whose art can't be loaded is drawn as a text card from the card database.

Touch controls: tap a card to read it full screen (unless the tap does something in the game,
such as rezzing or using an ability), press and hold to zoom in on it, drag a card from your
hand to play it.

## What's changed from upstream

`engine/` is a copy of upstream (commit in `engine/UPSTREAM_COMMIT`) with two sets of changes:

- **A portrait board layout.** `engine/portrait.js` lays the corp's servers out in rows and the
  runner's rig above their identity, stack and heap, so a tall phone screen is filled instead
  of the landscape board being shrunk to its width. Small hooks in `init.js` (`Render`),
  `utility.js` (`MouseIsOverServer`) and `cardrenderer.js` (server highlight) make server
  targeting work with rows; `cardrenderer.js` also opens the card reader on a tap; landscape
  behaves exactly as upstream.
- **A new look.** Upstream's green CRT terminal theme is replaced by a dark graphite design set
  in Inter (bundled in `engine/fonts/`, SIL OFL). `style.css` holds the design tokens, shared
  components and the in-game HUD; `menu.css` the main menu; `decks.css` the deck builder and
  gauntlet. Old CSS variable names (`--crt-green`…) are kept as aliases so inline styles keep
  working. On the board, `BoardPalette` in `cardrenderer.js` sets the highlight colours and the
  per-type counter colours, and counters pop when they change. The main menu's markup in
  `index.php` was rebuilt (home screen plus full-screen panels), as were the in-game menu in
  `engine.php` and the deck info and gauntlet summary dialogs in `init.js` and `utility.js`.
  The CRT effects setting is gone; sound and vibration settings replace it.

- **Plain HTML pages.** Upstream's `index.php`, `engine.php`, `decklauncher.php` and `gauntlet.php`
  are `engine/*.html` here. PHP only produced cache-busting query strings, script lists and the
  set and precon file lists; the build fills those in (`<!-- build:precons -->`,
  `__SET_VERSIONS__`, `__VERSION_REFERENCE__`), and the pages no longer carry Google Analytics,
  the server's favicon or the IP address display.

The build (`scripts/build.mjs`) turns it into a static site in `dist/`:

- copies the engine, lists the precon decks, versions every script, stylesheet and the card
  database with a content hash so updates are never served stale
- adds `mobile/`: a PWA manifest and icons, a service worker for offline play and placeholder
  art (text cards, card backs, counter chips), high-DPI board rendering, keeping the screen
  awake during a game, suppression of long-press menus, the card reader, the card-art
  importer, and `feedback.js`: short synthesised sounds and vibration for taps and game
  moments (runs, damage, agendas, winning and losing), each switchable in Settings

To update the engine, replace `engine/` with a newer upstream checkout, re-apply these changes
(`git log -p -- engine/` shows them; for the pages, port upstream's PHP page changes into the
`.html` files) and rebuild. Engine files use CRLF line endings; keep them.

## Build and deploy

Requires Node 18+.

```sh
npm run build   # writes dist/
npm run serve   # http://localhost:8080
```

Installed copies update themselves: when the app is opened (or brought back to the
foreground) it checks for a new version, installs it in the background and reloads onto it,
except during a game, where the update loads afterwards. **Card Images → Reload latest
version** forces a fresh copy if needed.

The live site is <https://namald.github.io/anra/>. `.github/workflows/pages.yml` rebuilds it on
every push to `main` by publishing `dist/` to the `gh-pages` branch, which GitHub Pages serves.

## License

AGPL-3.0 for this repository. The engine is GPL-3.0 (see `engine/LICENSE`). Netrunner and Android
are trademarks of Fantasy Flight Publishing, Inc. and/or Wizards of the Coast LLC. This is a fan
project, not affiliated with or endorsed by FFG, WotC or Null Signal Games.
