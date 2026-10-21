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

`engine/` is a copy of upstream (commit in `engine/UPSTREAM_COMMIT`) with one change: a
portrait board layout. `engine/portrait.js` lays the corp's servers out in rows and the
runner's rig above their identity, stack and heap, so a tall phone screen is filled instead
of the landscape board being shrunk to its width. Small hooks in `init.js` (`Render`),
`utility.js` (`MouseIsOverServer`) and `cardrenderer.js` (server highlight) make server
targeting work with rows; `cardrenderer.js` also opens the card reader on a tap; landscape behaves exactly as upstream.

The build (`scripts/build.mjs`) turns it into a static site in `dist/`:

- renders the PHP pages to plain HTML once at build time (PHP was only used for cache-busting and includes)
- removes Google Analytics and the IP address display
- adds `mobile/`: a PWA manifest and icons, a service worker for offline play and text-card
  placeholders, high-DPI board rendering, a phone-sized HUD in portrait, haptic taps on
  buttons, keeping the screen awake during a game, suppression of long-press menus, and the
  card-art importer

To update the engine, replace `engine/` with a newer upstream checkout, re-apply the portrait
hooks (`git log -p -- engine/` shows them) and rebuild.

## Build and deploy

Requires Node 18+ and the PHP CLI.

```sh
npm run build   # writes dist/
npm run serve   # http://localhost:8080
```

The live site is <https://namald.github.io/anra/>. `.github/workflows/pages.yml` rebuilds it on
every push to `main` by publishing `dist/` to the `gh-pages` branch, which GitHub Pages serves.

## License

AGPL-3.0 for this repository. The engine is GPL-3.0 (see `engine/LICENSE`). Netrunner and Android
are trademarks of Fantasy Flight Publishing, Inc. and/or Wizards of the Coast LLC. This is a fan
project, not affiliated with or endorsed by FFG, WotC or Null Signal Games.
