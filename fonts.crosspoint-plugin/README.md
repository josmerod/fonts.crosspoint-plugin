# Fonts

Browse a catalog of **289 precompiled `.cpfont` font families** (6–18 pt) from
your reader's web UI, preview each one with the reader's own renderer, pick the
point sizes you want, and install them straight to the SD card. Then choose the
active family — no reboot needed.

The catalog is built and maintained by
[josmerod/cp-fonts](https://github.com/josmerod/cp-fonts): CrossGlyph builds of
the curated [WP-Fonts](https://github.com/Chairzard/WP-Fonts) collection, with
per-family licenses (OFL, MIT, Apache-2.0, …) linked right in the list.

## Install

Open **Home → Plugins** on the reader (Plugin Hub) and install **Fonts**, or
install it from the Plugin Hub page in the web UI. Manual install: copy this
folder to `/.crosspoint/plugins/fonts/` on the SD card.

## Use

1. Open the web UI (`http://crosspoint.local`) → **Settings → Fonts**.
2. Browse by group — *Reading*, *Interface*, *Mono*, *Script*, *Display* — or
   filter by name or license. Press **Preview** to see a page rendered with the
   reader's own engine; previews load on demand.
3. Tick the sizes you want (each is a separate bitmap file of a few hundred KB;
   `all` / `none` toggle the whole family) and press **Install**. Files stream
   from GitHub straight to `/.fonts/<Family>/` on the card — they never pass
   through your browser.
4. Pick the family under **Settings → Font** on the reader. It appears there
   immediately after install; the plugin's *Set active* button writes the
   setting for the next boot.

The reader holds at most **128 installed families**; the plugin warns you when
you reach the limit. **Remove** deletes a whole family.

## Catalog

The plugin reads its catalog at runtime from cp-fonts, so new families appear
without a plugin update. To use your own fork, paste its `catalog/fonts.json`
URL under **Catalog** and press *Save* (stored in `/.crosspoint/fonts.json`).

## How it works

Binaries and previews are served by `raw.githubusercontent.com`, which answers
`200` directly — the reader's fetch path does not follow redirects, so the
plugin only resolves redirects (via relay) as a fallback for catalogs hosted
elsewhere. Two quirks of the current X4 Pro firmware are handled transparently:
destination folders are created before the first download, and the font
registry is refreshed after install so the family is visible without a reboot.

Fonts keep their upstream licenses; see the per-family license files in
cp-fonts. This plugin's code is MIT.
