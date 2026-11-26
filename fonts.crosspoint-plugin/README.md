Fonts installs precompiled font families on your reader. Browse the catalog in the web UI, preview each family as the reader renders it, pick the point sizes you want and install them straight to the SD card.

Install
-------

Get Fonts from the Plugin Hub (Home > Plugins on the reader, or the Plugin Hub card in the web UI). To install by hand, copy this folder to /.crosspoint/plugins/fonts/ on the SD card.

Use
---

1. Start File Transfer on the reader and open its web page in a browser on your phone or computer.
2. Open Settings > Fonts.
3. Browse by purpose (Reading, Interface, Mono, Script, Display) or filter by name or license. Press Preview to see a page rendered with the reader's own engine; previews load on demand.
4. Tick the sizes you want (each one is a separate bitmap file of a few hundred KB) and press Install. The reader downloads the files from GitHub into the family's folder under /.fonts/ on the card; they never pass through your browser.
5. On the reader, open Settings > Font and pick the family. It is listed there right after the install, with no restart.

Good to know
------------

- The reader holds at most 128 installed families; the plugin warns you at the limit. Remove deletes a whole family.
- The catalog is rebuilt automatically, so new families appear without a plugin update.
- To use your own catalog (for example a fork of josmerod/cp-fonts on GitHub), paste the URL of its catalog/fonts.json under Catalog and press Save.
- Fonts keep their upstream licenses; every family links to its license text. This plugin's code is MIT.

How it works
------------

Files are served by raw.githubusercontent.com, which answers directly without a redirect; the plugin only resolves redirects as a fallback, for catalogs hosted elsewhere. Two quirks of the current firmware are handled transparently: destination folders are created before the first download, and the font registry is refreshed after an install so the family is visible without a restart.
