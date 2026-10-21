# Anra: Netrunner Solo for phones

A single-player Android: Netrunner game you can install on your phone, built on the
[Chiriboga engine](https://github.com/drbo6/chiriboga) (Netrunner: Solo Mode by DrBo6, based
on bobtheuberfish's original). It's tuned for a Pixel 8 but works on any modern Android phone.

The game is an installable web app (PWA), not a native APK. Chiriboga is already a browser
game (JavaScript + PixiJS), so a native app would only wrap the same code in a WebView. A PWA
installs to the home screen, runs full screen, works offline, and updates whenever this repo
is deployed.

## Play on your phone

1. Deploy (see below) and open the site in Chrome on the phone.
2. Chrome menu → **Add to Home screen** → **Install**.
3. Launch it from the home screen. Games are played in landscape.

Card art isn't included (it isn't freely redistributable). Without it, cards appear as text
faces generated from the card database, which is enough to play. To get the real art,
download `images.zip` from <https://chiriboga.cronbach.com/images/images.zip> on the phone and
import it via **Card Images** in the main menu. The art is stored on the device for offline use.

Touch controls come from the engine: tap to select, press and hold a card to zoom in on it.

## What's changed from upstream

`engine/` is an unmodified copy of upstream (commit in `engine/UPSTREAM_COMMIT`). The build
(`scripts/build.mjs`) turns it into a static site in `dist/`:

- renders the PHP pages to plain HTML once at build time (PHP was only used for cache-busting and includes)
- removes Google Analytics and the IP address display
- adds `mobile/`: a PWA manifest and icons, a service worker for offline play and text-card
  placeholders, high-DPI board rendering, landscape lock and a rotate prompt, suppression of
  long-press menus, and the card-art importer

To update the engine, replace `engine/` with a newer upstream checkout and rebuild.

## Build and deploy

Requires Node 18+ and the PHP CLI.

```sh
npm run build   # writes dist/
npm run serve   # http://localhost:8080
```

`.github/workflows/pages.yml` builds and publishes to GitHub Pages on every push to `main`.
Enable it once under **Settings → Pages → Source: GitHub Actions**.

## License

AGPL-3.0 for this repository. The engine is GPL-3.0 (see `engine/LICENSE`). Netrunner and Android
are trademarks of Fantasy Flight Publishing, Inc. and/or Wizards of the Coast LLC. This is a fan
project, not affiliated with or endorsed by FFG, WotC or Null Signal Games.
